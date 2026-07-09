const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const livekitEgressService = require('../services/livekit-egress.service');

// In-memory store — works for single-instance.
// For multi-instance scale, replace with Redis adapter: socket.io/redis-adapter
const activeUsers = new Map();    // userId -> socketId
const socketUsers = new Map();    // socketId -> userId
const pendingDisconnects = new Map(); // userId -> timeoutId
const liveRoomViewers = new Map(); // sessionId -> Set(socketId)

const publicUserSelect = {
    id: true,
    unique_handle: true,
    display_name: true,
    avatar_url: true,
    is_verified: true
};

const normalizeHandleCandidates = (handle) => {
    const cleaned = String(handle || '').trim();
    if (!cleaned) return [];
    const withoutAt = cleaned.replace(/^@+/, '');
    return Array.from(new Set([cleaned, withoutAt, `@${withoutAt}`].filter(Boolean)));
};

const findUserByHandle = async (handle) => {
    const candidates = normalizeHandleCandidates(handle);
    if (candidates.length === 0) return null;
    return prisma.user.findFirst({
        where: { unique_handle: { in: candidates } },
        select: publicUserSelect
    });
};

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
            socketUsers.set(socket.id, userId);
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
                const registeredHostId = socketUsers.get(socket.id);
                const effectiveHostId = registeredHostId || hostId;
                if (!sessionId || !inviteeHandle || !effectiveHostId) {
                    return socket.emit('invite_status', { success: false, message: 'Session and invitee are required.' });
                }

                const session = await prisma.liveSession.findUnique({
                    where: { id: sessionId },
                    include: { host: { select: publicUserSelect } }
                });
                if (!session || session.host_user_id !== effectiveHostId) {
                    return socket.emit('invite_status', { success: false, message: 'Only the real host can send stage invites.' });
                }
                if (!['scheduled', 'live'].includes(session.status)) {
                    return socket.emit('invite_status', { success: false, message: 'This live session is not accepting stage invites.' });
                }

                const invitee = await findUserByHandle(inviteeHandle);

                if (!invitee) {
                    return socket.emit('invite_status', { success: false, message: `User ${inviteeHandle} not found.` });
                }
                if (invitee.id === effectiveHostId) {
                    return socket.emit('invite_status', { success: false, message: 'Host is already on stage.' });
                }

                let invite = await prisma.stageInvite.findFirst({
                    where: {
                        session_id: sessionId,
                        invitee_id: invitee.id,
                        status: { in: ['pending', 'accepted'] }
                    },
                    include: {
                        invitee: { select: publicUserSelect },
                        host: { select: publicUserSelect }
                    }
                });

                if (!invite) {
                    invite = await prisma.stageInvite.create({
                        data: {
                            session_id: sessionId,
                            host_id: effectiveHostId,
                            invitee_id: invitee.id,
                            status: 'pending'
                        },
                        include: {
                            invitee: { select: publicUserSelect },
                            host: { select: publicUserSelect }
                        }
                    });
                    prisma.notification.create({
                        data: {
                            user_id: invitee.id,
                            type: 'stage_invite',
                            title: 'Stage invite',
                            body: `${session.host.display_name} invited you to join the live stage`,
                            data: { sessionId, inviteId: invite.id }
                        }
                    }).catch((err) => console.error('[Socket] invite notification error:', err.message));
                }

                io.to(invitee.id).emit('receive_invite', {
                    invite,
                    session,
                    host: session.host
                });
                io.to(sessionId).emit('stage_invite_sent', { invite, invitee });

                if (activeUsers.get(invitee.id)) {
                    socket.emit('invite_status', { success: true, message: `Invite sent to ${invitee.unique_handle}!`, invite });
                } else {
                    socket.emit('invite_status', { success: true, message: `Invite saved. ${invitee.unique_handle} will see it when online.`, invite });
                }
            } catch (err) {
                console.error('[Socket] send_invite error:', err);
                socket.emit('invite_status', { success: false, message: err.message || 'Server error sending invite.' });
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

            const registeredUserId = socketUsers.get(socket.id);
            let safeSenderHandle = String(senderHandle || 'viewer').trim();
            if (registeredUserId) {
                const user = await prisma.user.findUnique({
                    where: { id: registeredUserId },
                    select: { unique_handle: true }
                }).catch(() => null);
                safeSenderHandle = user?.unique_handle || safeSenderHandle;
            }

            const payload = { senderHandle: safeSenderHandle, message: message.trim(), type: 'message', created_at: new Date() };
            io.to(sessionId).emit('receive_chat_message', payload);

            // Persist to DB asynchronously
            prisma.chatMessage.create({
                data: { session_id: sessionId, sender_handle: safeSenderHandle, message: message.trim(), type: 'message' }
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
            socketUsers.delete(socket.id);

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
