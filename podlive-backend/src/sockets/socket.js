const prisma = require('../lib/prisma');
const livekitEgressService = require('../services/livekit-egress.service');
const createViewerCountUpdater = require('../services/viewer-count-updater');
const jwt = require('jsonwebtoken');

// In-memory store — works for single-instance.
// For multi-instance scale, replace with Redis adapter: socket.io/redis-adapter
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

const isAcceptedStageGuest = (sessionId, guestId) => prisma.stageInvite.findFirst({
    where: { session_id: sessionId, invitee_id: guestId, status: 'accepted' },
    select: { id: true }
}).catch(() => null);

const allowSocketEvent = (socket, event, limit, windowMs) => {
    const now = Date.now();
    const limits = socket.data.eventLimits || (socket.data.eventLimits = {});
    const recent = (limits[event] || []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= limit) return false;
    recent.push(now);
    limits[event] = recent;
    return true;
};

module.exports = (io) => {
    const scheduleViewerCountUpdate = createViewerCountUpdater({
        prisma,
        io,
        getViewerCount: async (sessionId) => (await io.in(sessionId).fetchSockets()).length
    });

    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token || socket.handshake.query?.token;
            if (token && token !== 'mock-access-token') {
                socket.data.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            }
        } catch (_error) {
            // Guest or expired connection allowed for viewing public streams/chats
        }
        return next();
    });
    io.on('connection', (socket) => {

        // ── Register user ──────────────────────────────────────
        socket.on('register_user', () => {
            const userId = socket.data.user?.id;
            if (!userId) return;
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
                if (!allowSocketEvent(socket, 'send_invite', 10, 60_000)) return;
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

                if ((await io.in(invitee.id).fetchSockets()).length > 0) {
                    socket.emit('invite_status', { success: true, message: `Invite sent to ${invitee.unique_handle}!`, invite });
                } else {
                    socket.emit('invite_status', { success: true, message: `Invite saved. ${invitee.unique_handle} will see it when online.`, invite });
                }
            } catch (err) {
                console.error('[Socket] send_invite error:', err);
                socket.emit('invite_status', { success: false, message: err.message || 'Server error sending invite.' });
            }
        });

        socket.on('accept_invite', ({ sessionId }) => {
            (async () => {
                try {
                    const registeredUserId = socketUsers.get(socket.id);
                    if (!registeredUserId) return;
                    const invitee = await prisma.user.findUnique({ where: { id: registeredUserId }, select: publicUserSelect });
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

        socket.on('reject_invite', async ({ sessionId }) => {
            const inviteeId = socketUsers.get(socket.id);
            if (!inviteeId || !sessionId) return;
            const invite = await prisma.stageInvite.findFirst({ where: { session_id: sessionId, invitee_id: inviteeId, status: 'pending' } }).catch(() => null);
            if (!invite) return;
            await prisma.stageInvite.update({ where: { id: invite.id }, data: { status: 'rejected' } }).catch(() => null);
            io.to(invite.host_id).emit('invite_rejected', { sessionId, inviteeHandle: (await prisma.user.findUnique({ where: { id: inviteeId }, select: { unique_handle: true } }))?.unique_handle });
        });

        // ── Host controls (mic / camera / kick) ────────────────
        socket.on('mute_guest', async ({ sessionId, guestId }) => {
            const hostUserId = socket.data?.user?.id || socketUsers.get(socket.id);
            if (!guestId || !hostUserId || !sessionId) return;
            const session = await prisma.liveSession.findUnique({ where: { id: sessionId } }).catch(() => null);
            if (!session || session.host_user_id !== hostUserId || !await isAcceptedStageGuest(sessionId, guestId)) return;
            io.to(guestId).emit('guest_muted');
        });

        socket.on('disable_camera_guest', async ({ sessionId, guestId }) => {
            const hostUserId = socket.data?.user?.id || socketUsers.get(socket.id);
            if (!guestId || !hostUserId || !sessionId) return;
            const session = await prisma.liveSession.findUnique({ where: { id: sessionId } }).catch(() => null);
            if (!session || session.host_user_id !== hostUserId || !await isAcceptedStageGuest(sessionId, guestId)) return;
            io.to(guestId).emit('guest_camera_disabled');
        });

        socket.on('remove_guest', async ({ sessionId, guestId }) => {
            const hostUserId = socket.data?.user?.id || socketUsers.get(socket.id);
            if (!guestId || !hostUserId || !sessionId) return;
            const session = await prisma.liveSession.findUnique({ where: { id: sessionId } }).catch(() => null);
            if (!session || session.host_user_id !== hostUserId || !await isAcceptedStageGuest(sessionId, guestId)) return;
            io.to(guestId).emit('guest_removed');
        });

        // ── Live chat ──────────────────────────────────────────
        socket.on('join_chat_room', async (sessionId) => {
            if (!sessionId) return;
            const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { id: true, status: true, visibility: true, host_user_id: true, chat_enabled: true } }).catch(() => null);
            if (!session || !session.chat_enabled || !['live', 'scheduled'].includes(session.status)) return;
            if (session.visibility === 'private') {
                const userId = socket.data.user?.id;
                if (!userId) return;
                const accessInvite = await prisma.liveAccessInvite.findFirst({ where: { session_id: sessionId, redeemed_by: userId, revoked_at: null, OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }] }, select: { id: true } });
                const stageInvite = await prisma.stageInvite.findFirst({ where: { session_id: sessionId, invitee_id: userId, status: 'accepted' }, select: { id: true } });
                if (session.host_user_id !== userId && !accessInvite && !stageInvite) return;
            }
            socket.join(sessionId);

            if (!liveRoomViewers.has(sessionId)) {
                liveRoomViewers.set(sessionId, new Set());
            }
            const viewers = liveRoomViewers.get(sessionId);
            if (!viewers.has(socket.id)) {
                viewers.add(socket.id);
                scheduleViewerCountUpdate(io, sessionId);
            }
        });

        socket.on('leave_chat_room', (sessionId) => {
            if (!sessionId) return;
            socket.leave(sessionId);
            const viewers = liveRoomViewers.get(sessionId);
            if (viewers?.delete(socket.id)) {
                if (viewers.size === 0) liveRoomViewers.delete(sessionId);
                scheduleViewerCountUpdate(io, sessionId);
            }
        });

        socket.on('send_chat_message', async ({ sessionId, message }) => {
            if (!allowSocketEvent(socket, 'send_chat_message', 6, 10_000) || !sessionId || typeof message !== 'string' || !message.trim() || message.trim().length > 500 || !socket.rooms.has(sessionId)) return;

            const session = await prisma.liveSession.findUnique({ where: { id: sessionId } }).catch(() => null);
            if (!session || !session.chat_enabled || !['live', 'scheduled'].includes(session.status)) {
                return socket.emit('chat_error', { message: 'Live chat is not available.' });
            }

            const registeredUserId = socketUsers.get(socket.id);
            let safeSenderHandle = 'viewer';
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
            if (!allowSocketEvent(socket, 'send_live_reaction', 20, 10_000) || !sessionId || !socket.rooms.has(sessionId) || !['like', 'heart', 'clap', 'fire'].includes(reaction)) return;
            io.to(sessionId).emit('receive_live_reaction', {
                sessionId,
                reaction,
                created_at: new Date()
            });
        });

        // ── Follower count update ──────────────────────────────
        // Follower counts are emitted only by REST handlers after database updates.

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

            affectedRooms.forEach((sessionId) => scheduleViewerCountUpdate(io, sessionId));

            const disconnectedUserId = socketUsers.get(socket.id) || socket.data?.user?.id;
            socketUsers.delete(socket.id);

            // Only consider host auto-end if the user has NO remaining active sockets
            if (!disconnectedUserId || (await io.in(disconnectedUserId).fetchSockets()).length > 0) {
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
                        if ((await io.in(disconnectedUserId).fetchSockets()).length > 0) {
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
