const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const livekitEgressService = require('../services/livekit-egress.service');

// In-memory store — works for single-instance.
// For multi-instance scale, replace with Redis adapter: socket.io/redis-adapter
const activeUsers = new Map();    // userId -> socketId
const pendingDisconnects = new Map(); // userId -> timeoutId
const liveRoomViewers = new Map(); // sessionId -> Set(socketId)

const emitViewerCount = async (io, sessionId) => {
    const count = liveRoomViewers.get(sessionId)?.size || 0;
    try {
        const session = await prisma.liveSession.update({
            where: { id: sessionId },
            data: {
                viewer_count: count,
                viewer_count_peak: { increment: 0 }
            }
        });

        if (count > session.viewer_count_peak) {
            await prisma.liveSession.update({
                where: { id: sessionId },
                data: { viewer_count_peak: count }
            });
        }

        io.to(sessionId).emit('viewer_count_update', {
            sessionId,
            viewerCount: count,
            viewerCountPeak: Math.max(count, session.viewer_count_peak)
        });
    } catch (err) {
        console.error('[Socket] Viewer count update error:', err.message);
    }
};

module.exports = (io) => {
    io.on('connection', (socket) => {

        // ── Register user ──────────────────────────────────────
        socket.on('register_user', (userId) => {
            if (!userId) return;
            activeUsers.set(userId, socket.id);
            socket.join(userId);

            if (pendingDisconnects.has(userId)) {
                clearTimeout(pendingDisconnects.get(userId));
                pendingDisconnects.delete(userId);
                console.log(`[Socket] Host ${userId} reconnected — auto-end cancelled`);
            }
        });

        // ── Stage invites ──────────────────────────────────────
        socket.on('send_invite', async ({ sessionId, inviteeHandle, hostId }) => {
            try {
                let handle = (inviteeHandle || '').trim();
                if (!handle.startsWith('@')) handle = '@' + handle;

                const [invitee, host] = await Promise.all([
                    prisma.user.findUnique({ where: { unique_handle: handle } }),
                    prisma.user.findUnique({ where: { id: hostId } })
                ]);

                if (!invitee) {
                    return socket.emit('invite_status', { success: false, message: `User ${handle} not found.` });
                }

                const targetSocketId = activeUsers.get(invitee.id);
                if (targetSocketId) {
                    io.to(targetSocketId).emit('receive_invite', { sessionId, host });
                    socket.emit('invite_status', { success: true, message: `Invite sent to ${handle}!` });
                } else {
                    socket.emit('invite_status', { success: false, message: `${handle} is currently offline.` });
                }
            } catch (err) {
                console.error('[Socket] send_invite error:', err.message);
                socket.emit('invite_status', { success: false, message: 'Server error sending invite.' });
            }
        });

        socket.on('accept_invite', ({ sessionId, hostId, inviteeHandle }) => {
            const hostSocket = activeUsers.get(hostId);
            if (hostSocket) io.to(hostSocket).emit('invite_accepted', { sessionId, inviteeHandle });
        });

        socket.on('reject_invite', ({ sessionId, hostId, inviteeHandle }) => {
            const hostSocket = activeUsers.get(hostId);
            if (hostSocket) io.to(hostSocket).emit('invite_rejected', { sessionId, inviteeHandle });
        });

        // ── Host controls (mic / camera / kick) ────────────────
        socket.on('mute_guest', ({ guestId }) => {
            const guestSocket = activeUsers.get(guestId);
            if (guestSocket) io.to(guestSocket).emit('guest_muted');
        });

        socket.on('disable_camera_guest', ({ guestId }) => {
            const guestSocket = activeUsers.get(guestId);
            if (guestSocket) io.to(guestSocket).emit('guest_camera_disabled');
        });

        socket.on('remove_guest', ({ guestId }) => {
            const guestSocket = activeUsers.get(guestId);
            if (guestSocket) io.to(guestSocket).emit('guest_removed');
        });

        // ── Live chat ──────────────────────────────────────────
        socket.on('join_chat_room', (sessionId) => {
            if (!sessionId) return;
            socket.join(sessionId);

            if (!liveRoomViewers.has(sessionId)) {
                liveRoomViewers.set(sessionId, new Set());
            }
            liveRoomViewers.get(sessionId).add(socket.id);
            emitViewerCount(io, sessionId);
        });

        socket.on('leave_chat_room', (sessionId) => {
            if (!sessionId) return;
            socket.leave(sessionId);
            liveRoomViewers.get(sessionId)?.delete(socket.id);
            emitViewerCount(io, sessionId);
        });

        socket.on('send_chat_message', async ({ sessionId, senderHandle, message }) => {
            if (!sessionId || !message?.trim()) return;

            const session = await prisma.liveSession.findUnique({ where: { id: sessionId } }).catch(() => null);
            if (!session || !session.chat_enabled || !['live', 'scheduled'].includes(session.status)) {
                return socket.emit('chat_error', { message: 'Live chat is not available.' });
            }

            const payload = { senderHandle, message: message.trim(), type: 'message', created_at: new Date() };
            io.to(sessionId).emit('receive_chat_message', payload);

            // Persist to DB asynchronously
            prisma.chatMessage.create({
                data: { session_id: sessionId, sender_handle: senderHandle, message: message.trim(), type: 'message' }
            }).catch(err => console.error('[Socket] Chat save error:', err.message));
        });

        socket.on('send_live_reaction', ({ sessionId, reaction }) => {
            if (!sessionId) return;
            io.to(sessionId).emit('receive_live_reaction', {
                sessionId,
                reaction: reaction || 'like',
                created_at: new Date()
            });
        });

        // ── Follower count update ──────────────────────────────
        socket.on('follower_count_update', ({ userId, count }) => {
            io.to(userId).emit('follower_count_update', { count });
        });

        // ── Disconnect ─────────────────────────────────────────
        socket.on('disconnect', async () => {
            let disconnectedUserId = null;
            const affectedRooms = [];

            for (const [sessionId, viewers] of liveRoomViewers.entries()) {
                if (viewers.delete(socket.id)) {
                    affectedRooms.push(sessionId);
                }
                if (viewers.size === 0) {
                    liveRoomViewers.delete(sessionId);
                }
            }

            affectedRooms.forEach((sessionId) => emitViewerCount(io, sessionId));

            for (const [userId, socketId] of activeUsers.entries()) {
                if (socketId === socket.id) {
                    disconnectedUserId = userId;
                    activeUsers.delete(userId);
                    break;
                }
            }

            if (!disconnectedUserId) return;

            // Auto-end session if host disconnects and doesn't reconnect in 20s
            try {
                const activeSessions = await prisma.liveSession.findMany({
                    where: { host_user_id: disconnectedUserId, status: 'live' }
                });

                if (activeSessions.length > 0) {
                    console.log(`[Socket] Host ${disconnectedUserId} disconnected — 20s grace timer started`);

                    const timeoutId = setTimeout(async () => {
                        for (const session of activeSessions) {
                            try {
                                if (session.livekit_egress_id) {
                                    livekitEgressService.stopEgress(session.livekit_egress_id).catch((err) => {
                                        console.error(`[Socket] Stop egress failed for ${session.id}:`, err.message);
                                    });
                                }
                                if (session.livekit_ingress_id) {
                                    livekitEgressService.deleteIngress(session.livekit_ingress_id).catch((err) => {
                                        console.error(`[Socket] Delete ingress failed for ${session.id}:`, err.message);
                                    });
                                }

                                await prisma.liveSession.update({
                                    where: { id: session.id },
                                    data: {
                                        status: 'ended',
                                        ended_at: new Date(),
                                        livekit_egress_id: null,
                                        livekit_ingress_id: null,
                                        viewer_count: 0,
                                        is_processing: false
                                    }
                                });
                                io.to(session.id).emit('podcast_ended');
                                io.emit('live_ended', { id: session.id });
                                console.log(`[Socket] Auto-ended session ${session.id}`);
                            } catch (err) {
                                console.error(`[Socket] Auto-end failed for ${session.id}:`, err.message);
                            }
                        }
                        pendingDisconnects.delete(disconnectedUserId);
                    }, 20000);

                    pendingDisconnects.set(disconnectedUserId, timeoutId);
                }
            } catch (err) {
                console.error('[Socket] Disconnect handler error:', err.message);
            }
        });
    });
};
