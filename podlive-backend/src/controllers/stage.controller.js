const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

const livekitHost = process.env.LIVEKIT_URL || 'http://127.0.0.1:7880';
const roomService = new RoomServiceClient(livekitHost, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);

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

const createToken = async (roomName, participantName, canPublish = true) => {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!roomName) {
        throw new Error('LiveKit room is not ready for this session');
    }

    const at = new AccessToken(apiKey, apiSecret, {
        identity: participantName,
        metadata: JSON.stringify({ role: canPublish ? 'stage' : 'viewer' })
    });
    at.addGrant({ roomJoin: true, room: roomName, canPublish, canSubscribe: true, canPublishData: true });

    return await at.toJwt();
};

const ensureHostSession = async (sessionId, hostId) => {
    const session = await prisma.liveSession.findUnique({
        where: { id: sessionId },
        include: { host: { select: publicUserSelect } }
    });
    if (!session || session.host_user_id !== hostId) return null;
    return session;
};

const getTrackSource = (track) => String(track.source || track.sourceName || '').toLowerCase();

const muteTracksBySource = async (roomName, identity, sourceNeedle) => {
    const participant = await roomService.getParticipant(roomName, identity);
    const tracks = participant?.tracks || [];
    const mutedTrackIds = [];

    for (const track of tracks) {
        const source = getTrackSource(track);
        if (source.includes(sourceNeedle)) {
            await roomService.mutePublishedTrack(roomName, identity, track.sid, true);
            mutedTrackIds.push(track.sid);
        }
    }

    return mutedTrackIds;
};

exports.inviteUser = async (req, res) => {
    try {
        const { sessionId, handle } = req.body;
        const host_id = req.user.id;

        const session = await ensureHostSession(sessionId, host_id);
        if (!session) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        if (!['scheduled', 'live'].includes(session.status)) {
            return res.status(409).json({ error: 'Stage invites are available only for scheduled or live sessions' });
        }

        const invitee = await findUserByHandle(handle);
        if (!invitee) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (invitee.id === host_id) {
            return res.status(400).json({ error: 'Host is already on stage' });
        }

        const existingInvite = await prisma.stageInvite.findFirst({
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

        if (existingInvite) {
            if (req.io) {
                req.io.to(invitee.id).emit('receive_invite', {
                    sessionId,
                    invite: existingInvite,
                    session,
                    host: session.host,
                    inviteId: existingInvite.id
                });
            }
            return res.json({
                message: existingInvite.status === 'accepted' ? 'User is already on stage' : 'Invite already pending',
                invite: existingInvite,
                invitee
            });
        }

        const newInvite = await prisma.stageInvite.create({
            data: {
                session_id: sessionId,
                host_id,
                invitee_id: invitee.id,
                status: 'pending'
            },
            include: {
                invitee: { select: publicUserSelect },
                host: { select: publicUserSelect }
            }
        });

        await prisma.notification.create({
            data: {
                user_id: invitee.id,
                type: 'stage_invite',
                title: 'Stage invite',
                body: `${session.host.display_name} invited you to join the live stage`,
                data: { sessionId, inviteId: newInvite.id }
            }
        }).catch((err) => console.error('[Stage] notification error:', err.message));

        if (req.io) {
            req.io.to(invitee.id).emit('receive_invite', {
                sessionId,
                invite: newInvite,
                session,
                host: session.host,
                inviteId: newInvite.id
            });
            req.io.to(sessionId).emit('stage_invite_sent', {
                invite: newInvite,
                invitee
            });
        }

        res.status(201).json({ message: 'Invite sent', invite: newInvite, invitee });
    } catch (error) {
        console.error('Invite Error:', error);
        res.status(500).json({ error: 'Failed to send invite', details: error.message });
    }
};

exports.acceptInvite = async (req, res) => {
    try {
        const { id } = req.params;
        const invite = await prisma.stageInvite.findUnique({
            where: { id },
            include: {
                session: { include: { host: { select: publicUserSelect } } },
                invitee: { select: publicUserSelect }
            }
        });

        if (!invite || invite.invitee_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        if (!['pending', 'accepted'].includes(invite.status)) {
            return res.status(409).json({ error: `Invite is ${invite.status}` });
        }
        if (!['scheduled', 'live'].includes(invite.session.status)) {
            return res.status(409).json({ error: 'This live session is no longer accepting stage guests' });
        }

        const updatedInvite = await prisma.stageInvite.update({
            where: { id },
            data: { status: 'accepted', accepted_at: invite.accepted_at || new Date() },
            include: { invitee: { select: publicUserSelect } }
        });

        const token = await createToken(invite.session.livekit_room_name, invite.invitee.unique_handle);

        try {
            await roomService.updateParticipant(invite.session.livekit_room_name, invite.invitee.unique_handle, {
                permission: { canPublish: true, canSubscribe: true, canPublishData: true }
            });
        } catch (e) {
            console.log('[Stage] Participant permission update skipped:', e.message);
        }

        if (req.io) {
            req.io.to(invite.session_id).emit('stage_guest_joined', {
                invite: updatedInvite,
                user: invite.invitee,
                permissions: { canPublish: true, canSubscribe: true, canPublishData: true }
            });
            req.io.to(invite.host_id).emit('invite_accepted', {
                sessionId: invite.session_id,
                invite: updatedInvite,
                invitee: invite.invitee
            });
            req.io.to(invite.invitee_id).emit('stage_permissions_updated', {
                sessionId: invite.session_id,
                canPublish: true,
                canSubscribe: true,
                canPublishData: true
            });
        }

        res.json({
            message: 'Invite accepted',
            token,
            roomName: invite.session.livekit_room_name,
            livekitUrl: process.env.LIVEKIT_URL,
            role: 'stage',
            permissions: { canPublish: true, canSubscribe: true, canPublishData: true },
            invite: updatedInvite
        });
    } catch (error) {
        console.error('Accept Invite Error:', error);
        res.status(500).json({ error: 'Failed to accept invite', details: error.message });
    }
};

exports.rejectInvite = async (req, res) => {
    try {
        const { id } = req.params;
        const invite = await prisma.stageInvite.findUnique({ where: { id } });

        if (!invite || invite.invitee_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const updatedInvite = await prisma.stageInvite.update({
            where: { id },
            data: { status: 'rejected' },
            include: { invitee: { select: publicUserSelect } }
        });

        if (req.io) {
            req.io.to(invite.host_id).emit('invite_rejected', {
                sessionId: invite.session_id,
                invite: updatedInvite
            });
        }

        res.json({ message: 'Invite rejected', invite: updatedInvite });
    } catch (error) {
        console.error('Reject Invite Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.removeGuest = async (req, res) => {
    try {
        const { sessionId, userId } = req.params;
        const host_id = req.user.id;

        const session = await ensureHostSession(sessionId, host_id);
        if (!session) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const guestUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!guestUser) {
            return res.status(404).json({ error: 'Guest not found' });
        }

        try {
            await roomService.removeParticipant(session.livekit_room_name, guestUser.unique_handle);
        } catch (e) {
            console.log("Error removing from LiveKit room (maybe already left):", e.message);
        }

        await prisma.stageInvite.updateMany({
            where: { session_id: sessionId, invitee_id: userId, status: 'accepted' },
            data: { status: 'ended', left_at: new Date() }
        });

        if (req.io) {
            req.io.to(userId).emit('guest_removed', { sessionId, userId });
            req.io.to(sessionId).emit('stage_guest_removed', { sessionId, userId, identity: guestUser.unique_handle });
        }

        res.json({ message: 'Guest removed', userId, identity: guestUser.unique_handle });
    } catch (error) {
        console.error('Remove Guest Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.muteGuestMic = async (req, res) => {
    try {
        const { sessionId, userId } = req.params;
        const host_id = req.user.id;

        const session = await ensureHostSession(sessionId, host_id);
        if (!session) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const guestUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!guestUser) {
            return res.status(404).json({ error: 'Guest not found' });
        }

        try {
            await muteTracksBySource(session.livekit_room_name, guestUser.unique_handle, 'microphone');
            await muteTracksBySource(session.livekit_room_name, guestUser.unique_handle, 'mic');
        } catch (e) {
            console.log("Error muting guest mic:", e.message);
        }

        if (req.io) {
            req.io.to(userId).emit('guest_muted', { sessionId, userId });
            req.io.to(sessionId).emit('stage_guest_mic_muted', { sessionId, userId, identity: guestUser.unique_handle });
        }

        res.json({ message: 'Guest mic muted', userId, identity: guestUser.unique_handle });
    } catch (error) {
        console.error('Mute Guest Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.disableGuestCamera = async (req, res) => {
    try {
        const { sessionId, userId } = req.params;
        const host_id = req.user.id;

        const session = await ensureHostSession(sessionId, host_id);
        if (!session) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const guestUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!guestUser) {
            return res.status(404).json({ error: 'Guest not found' });
        }

        try {
            await muteTracksBySource(session.livekit_room_name, guestUser.unique_handle, 'camera');
        } catch (e) {
            console.log("Error disabling guest camera:", e.message);
        }

        if (req.io) {
            req.io.to(userId).emit('guest_camera_disabled', { sessionId, userId });
            req.io.to(sessionId).emit('stage_guest_camera_disabled', { sessionId, userId, identity: guestUser.unique_handle });
        }

        res.json({ message: 'Guest camera disabled', userId, identity: guestUser.unique_handle });
    } catch (error) {
        console.error('Disable Guest Camera Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.updateGuestPermissions = async (req, res) => {
    try {
        const { sessionId, userId } = req.params;
        const host_id = req.user.id;
        const canPublish = Boolean(req.body.canPublish);
        const canSubscribe = req.body.canSubscribe !== false;
        const canPublishData = req.body.canPublishData !== false;

        const session = await ensureHostSession(sessionId, host_id);
        if (!session) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const guestUser = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
        if (!guestUser) {
            return res.status(404).json({ error: 'Guest not found' });
        }

        const activeInvite = await prisma.stageInvite.findFirst({
            where: { session_id: sessionId, invitee_id: userId, status: 'accepted' }
        });
        if (!activeInvite && canPublish) {
            return res.status(403).json({ error: 'User must accept a stage invite before publish permission is allowed' });
        }

        try {
            await roomService.updateParticipant(session.livekit_room_name, guestUser.unique_handle, {
                permission: { canPublish, canSubscribe, canPublishData }
            });
        } catch (e) {
            console.log('[Stage] Permission update skipped:', e.message);
        }

        if (req.io) {
            req.io.to(userId).emit('stage_permissions_updated', {
                sessionId,
                canPublish,
                canSubscribe,
                canPublishData
            });
            req.io.to(sessionId).emit('stage_guest_permissions_updated', {
                sessionId,
                userId,
                identity: guestUser.unique_handle,
                canPublish,
                canSubscribe,
                canPublishData
            });
        }

        res.json({
            message: 'Guest permissions updated',
            userId,
            identity: guestUser.unique_handle,
            permissions: { canPublish, canSubscribe, canPublishData }
        });
    } catch (error) {
        console.error('Update Guest Permissions Error:', error);
        res.status(500).json({ error: 'Failed to update guest permissions', details: error.message });
    }
};

exports.getGuests = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.json([]);
        }
        const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
        if (!session || session.host_user_id !== userId) {
            return res.json([]);
        }

        const guests = await prisma.stageInvite.findMany({
            where: { session_id: sessionId, status: 'accepted' },
            include: { invitee: { select: publicUserSelect } },
            orderBy: { invited_at: 'asc' }
        });

        res.json(guests || []);
    } catch (error) {
        console.error('Get Guests Error:', error);
        res.json([]);
    }
};
