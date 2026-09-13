const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const livekitEgressService = require('../services/livekit-egress.service');
const jwt = require('jsonwebtoken');

// In-memory store — works for single-instance.
// For multi-instance scale, replace with Redis adapter: socket.io/redis-adapter
const userSockets = new Map();     // userId -> Set(socketId)
const socketUsers = new Map();     // socketId -> userId
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

const findUserByHandle = async (handleOrId) => {
    const raw = String(handleOrId || '').trim();
    if (!raw) return null;
    const candidates = normalizeHandleCandidates(raw);
    return prisma.user.findFirst({
        where: {
            OR: [
                { id: raw },
                { unique_handle: { in: candidates } }
            ]
        },
        select: publicUserSelect
    });
};

const emitViewerCount = async (io, sessionId) => {
    const count = liveRoomViewers.get(sessionId)?.size || 0;
    try {
        const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
        if (!session) return;
        const newPeak = Math.max(session.viewer_count_peak || 0, count);
        await prisma.liveSession.update({
            where: { id: sessionId },
            data: {
                viewer_count: count,
                viewer_count_peak: newPeak
            }
        });

        io.to(sessionId).emit('viewer_count_update', {
            sessionId,
            viewerCount: count,
            viewerCountPeak: newPeak
        });
    } catch (err) {
        console.error('[Socket] Viewer count update error:', err.message);
    }
};

module.exports = (io) => {
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) return next(new Error('Authentication required'));
            socket.data.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            return next();
        } catch (_error) {
            return next(new Error('Invalid or expired authentication'));
        }
    });
    io.on('connection', (socket) => {

        // ── Register user ──────────────────────────────────────
        socket.on('register_user', () => {
            const userId = socket.data.user?.id;
            if (!userId) return;
            if (!userSockets.has(userId)) {
                userSockets.set(userId, new Set());
            }
            userSockets.get(userId).add(socket.id);
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
                const effectiveHostId = registeredHostId;
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
                    sessionId,
                    invite,
                    session,
                    host: session.host,
                    inviteId: invite.id
                });
                io.to(sessionId).emit('stage_invite_sent', { invite, invitee });

                if (userSockets.has(invitee.id) && userSockets.get(invitee.id).size > 0) {
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
            (async () => {
                try {
                    const registeredUserId = socketUsers.get(socket.id);
                    const invitee = registeredUserId
                        ? await prisma.user.findUnique({ where: { id: registeredUserId }, select: publicUserSelect })
                        : await findUserByHandle(inviteeHandle);
                    if (!sessionId || !invitee) return;

                    const invite = await prisma.stageInvite.findFirst({
                        where: {
                            session_id: sessionId,
                            invitee_id: invitee.id,
                            status: { in: ['pending', 'accepted'] }
                        },
                        include: {
                            invitee: { select: publicUserSelect },
                            host: { select: publicUserSelect },
                            session: true
                        },
                        orderBy: { invited_at: 'desc' }
                    });
                    if (!invite) return;

                    const updatedInvite = invite.status === 'accepted'
                        ? invite
                        : await prisma.stageInvite.update({
                            where: { id: invite.id },
                            data: { status: 'accepted', accepted_at: new Date() },
                            include: {
                                invitee: { select: publicUserSelect },
                                host: { select: publicUserSelect },
                                session: true
                            }
                        });

                    io.to(sessionId).emit('stage_guest_joined', {
                        invite: updatedInvite,
                        user: invitee,
                        permissions: { canPublish: true, canSubscribe: true, canPublishData: true }
                    });
                    io.to(invite.host_id).emit('invite_accepted', {
                        sessionId,
                        invite: updatedInvite,
                        invitee,
                        inviteeHandle: invitee.unique_handle
                    });
                    io.to(invitee.id).emit('stage_permissions_updated', {
                        sessionId,
                        canPublish: true,
                        canSubscribe: true,
                        canPublishData: true
                    });
                } catch (err) {
                    console.error('[Socket] accept_invite error:', err.message);
                }
            })();
        });

        socket.on('reject_invite', ({ sessionId, hostId, inviteeHandle }) => {
            if (hostId) io.to(hostId).emit('invite_rejected', { sessionId, inviteeHandle });
        });

        // ── Host controls (mic / camera / kick) ────────────────
        socket.on('mute_guest', async ({ sessionId, guestId }) => {
            const hostUserId = socket.data?.user?.id || socketUsers.get(socket.id);
            if (!guestId || !hostUserId) return;
            if (sessionId) {
                const session = await prisma.liveSession.findUnique({ where: { id: sessionId } }).catch(() => null);
                if (session && session.host_user_id !== hostUserId) return;
            }
            io.to(guestId).emit('guest_muted');
        });

        socket.on('disable_camera_guest', async ({ sessionId, guestId }) => {
            const hostUserId = socket.data?.user?.id || socketUsers.get(socket.id);
            if (!guestId || !hostUserId) return;
            if (sessionId) {
                const session = await prisma.liveSession.findUnique({ where: { id: sessionId } }).catch(() => null);
                if (session && session.host_user_id !== hostUserId) return;
            }
            io.to(guestId).emit('guest_camera_disabled');
        });

        socket.on('remove_guest', async ({ sessionId, guestId }) => {
            const hostUserId = socket.data?.user?.id || socketUsers.get(socket.id);
            if (!guestId || !hostUserId) return;
            if (sessionId) {
                const session = await prisma.liveSession.findUnique({ where: { id: sessionId } }).catch(() => null);
                if (session && session.host_user_id !== hostUserId) return;
            }
            io.to(guestId).emit('guest_removed');
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

            const disconnectedUserId = socketUsers.get(socket.id) || socket.data?.user?.id;
            socketUsers.delete(socket.id);

            if (disconnectedUserId && userSockets.has(disconnectedUserId)) {
                const userSocketSet = userSockets.get(disconnectedUserId);
                userSocketSet.delete(socket.id);
                if (userSocketSet.size === 0) {
                    userSockets.delete(disconnectedUserId);
                }
            }

            // Only consider host auto-end if the user has NO remaining active sockets
            if (!disconnectedUserId || (userSockets.has(disconnectedUserId) && userSockets.get(disconnectedUserId).size > 0)) {
                return;
            }

            // Auto-end session if host disconnects from all devices and doesn't reconnect in 60s
            try {
                const activeSessions = await prisma.liveSession.findMany({
                    where: { host_user_id: disconnectedUserId, status: 'live' }
                });

                if (activeSessions.length > 0) {
                    console.log(`[Socket] Host ${disconnectedUserId} disconnected completely — 60s grace timer started`);

                    const timeoutId = setTimeout(async () => {
                        // Check again if host reconnected in between
                        if (userSockets.has(disconnectedUserId) && userSockets.get(disconnectedUserId).size > 0) {
                            pendingDisconnects.delete(disconnectedUserId);
                            return;
                        }

                        for (const session of activeSessions) {
                            try {
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
                                        is_processing: false,
                                        dvr_enabled: false,
                                        replay_enabled: false,
                                        hls_url: null,
                                        recording_url: null
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
                    }, 60000);

                    pendingDisconnects.set(disconnectedUserId, timeoutId);
                }
            } catch (err) {
                console.error('[Socket] Disconnect handler error:', err.message);
            }
        });
    });
};
