const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');
const { AccessToken } = require('livekit-server-sdk');
const fs = require('fs');
const path = require('path');
const livekitEgressService = require('../services/livekit-egress.service');
const livekitRoomService = require('../services/livekit-room.service');

const allowedVisibility = new Set(['public', 'private', 'unlisted']);
const allowedIngressTypes = new Set(['rtmp', 'whip']);

const createToken = async (roomName, participantName, canPublish = false, role = 'viewer') => {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    const at = new AccessToken(apiKey, apiSecret, {
        identity: participantName,
        metadata: JSON.stringify({ role })
    });
    at.addGrant({ roomJoin: true, room: roomName, canPublish, canSubscribe: true, canPublishData: true });

    return await at.toJwt();
};

const publicUserSelect = {
    id: true,
    unique_handle: true,
    display_name: true,
    avatar_url: true,
    is_verified: true
};

const sanitizeSession = (session, includeSecrets = false) => {
    if (!session) return session;
    const { stream_key, ingest_url, ...safeSession } = session;
    if (includeSecrets) {
        safeSession.stream_key = stream_key;
        safeSession.ingest_url = ingest_url;
    }
    return safeSession;
};

const serializeEgressId = (egress) => egress?.egressId || egress?.egress_id || egress?.id || null;

const extractIngressConfig = (ingress) => ({
    id: ingress?.ingressId || ingress?.ingress_id || ingress?.id || null,
    url: ingress?.url || ingress?.ingressUrl || ingress?.rtmpUrl || ingress?.whipUrl || ingress?.state?.url || null,
    streamKey: ingress?.streamKey || ingress?.stream_key || ingress?.key || ingress?.state?.streamKey || null
});

const safeNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const getHostOwnedSession = async (sessionId, userId) => {
    const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session || session.host_user_id !== userId) {
        return null;
    }
    return session;
};

exports.createLiveSession = async (req, res) => {
    try {
        const {
            title,
            description,
            category,
            thumbnail_url,
            visibility = 'public',
            scheduled_at,
            goLiveNow = true,
            dvr_enabled = true,
            low_latency = true,
            chat_enabled = true,
            moderation_enabled = true
        } = req.body;
        const host_user_id = req.user.id;

        if (!title) {
            return res.status(400).json({ error: 'Title is required to go live.' });
        }
        if (!allowedVisibility.has(visibility)) {
            return res.status(400).json({ error: 'visibility must be public, private or unlisted' });
        }

        const livekit_room_name = `room-${crypto.randomBytes(8).toString('hex')}`;
        const shouldStartNow = goLiveNow !== false && !scheduled_at;

        let newSession = await prisma.liveSession.create({
            data: {
                host_user_id,
                title,
                description,
                thumbnail_url,
                category,
                visibility,
                scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
                status: shouldStartNow ? 'live' : 'scheduled',
                livekit_room_name,
                dvr_enabled,
                low_latency,
                chat_enabled,
                moderation_enabled,
                started_at: shouldStartNow ? new Date() : null,
            }
        });

        if (shouldStartNow && livekitEgressService.isHlsEgressEnabled()) {
            try {
                const egress = await livekitEgressService.startRoomHlsEgress(newSession);
                const hlsUrl = livekitEgressService.getLiveHlsUrl(newSession.id);
                newSession = await prisma.liveSession.update({
                    where: { id: newSession.id },
                    data: {
                        livekit_egress_id: serializeEgressId(egress),
                        hls_url: hlsUrl,
                        recording_url: livekitEgressService.getRecordingHlsUrl(newSession.id),
                        is_processing: true
                    }
                });
            } catch (egressError) {
                console.error('[Live] Auto HLS egress failed:', egressError.message);
            }
        }

        res.status(201).json({
            message: 'Live session created successfully',
            session: sanitizeSession(newSession, true),
            livekitUrl: process.env.LIVEKIT_URL,
            hlsEnabled: livekitEgressService.isHlsEgressEnabled()
        });

    } catch (error) {
        console.error('Create Live Session Error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message,
            code: error.code || error.errorCode
        });
    }
};

exports.startHlsEgress = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({ where: { id } });

        if (!session || session.host_user_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized to start HLS for this session' });
        }
        if (session.status !== 'live') {
            return res.status(409).json({ error: 'Session must be live before HLS can start' });
        }
        if (!livekitEgressService.isHlsEgressEnabled()) {
            return res.status(202).json({
                enabled: false,
                message: 'Live HLS egress is disabled. Set ENABLE_LIVEKIT_HLS_EGRESS=true and configure R2/S3.'
            });
        }
        if (session.livekit_egress_id && session.hls_url) {
            return res.json({ enabled: true, hlsUrl: session.hls_url, egressId: session.livekit_egress_id });
        }

        const egress = await livekitEgressService.startRoomHlsEgress(session);
        const hlsUrl = livekitEgressService.getLiveHlsUrl(session.id);
        const updatedSession = await prisma.liveSession.update({
            where: { id },
            data: {
                livekit_egress_id: serializeEgressId(egress),
                hls_url: hlsUrl,
                recording_url: livekitEgressService.getRecordingHlsUrl(session.id),
                is_processing: true
            }
        });

        res.json({
            enabled: true,
            hlsUrl,
            session: sanitizeSession(updatedSession)
        });
    } catch (error) {
        console.error('Start HLS Egress Error:', error);
        res.status(500).json({ error: 'Failed to start HLS egress', details: error.message });
    }
};

exports.startLiveSession = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({ where: { id }, include: { host: true } });

        if (!session || session.host_user_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized to start this session' });
        }

        const updatedSession = await prisma.liveSession.update({
            where: { id },
            data: {
                status: 'live',
                started_at: session.started_at || new Date(),
                ended_at: null
            }
        });

        const token = await createToken(session.livekit_room_name, session.host.unique_handle, true, 'host');

        let sessionForResponse = updatedSession;
        if (livekitEgressService.isHlsEgressEnabled() && !updatedSession.livekit_egress_id) {
            try {
                const egress = await livekitEgressService.startRoomHlsEgress(updatedSession);
                const hlsUrl = livekitEgressService.getLiveHlsUrl(updatedSession.id);
                sessionForResponse = await prisma.liveSession.update({
                    where: { id },
                    data: {
                        livekit_egress_id: serializeEgressId(egress),
                        hls_url: hlsUrl,
                        recording_url: livekitEgressService.getRecordingHlsUrl(updatedSession.id),
                        is_processing: true
                    }
                });
            } catch (egressError) {
                console.error('[Live] HLS egress on start failed:', egressError.message);
            }
        }

        if (req.io) {
            req.io.emit('live_started', sanitizeSession(sessionForResponse));
        }

        res.json({
            token,
            roomName: session.livekit_room_name,
            livekitUrl: process.env.LIVEKIT_URL,
            session: sanitizeSession(sessionForResponse)
        });
    } catch (error) {
        console.error('Start Live Session Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.endLiveSession = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({ where: { id } });

        if (!session || session.host_user_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized to end this session' });
        }

        if (session.livekit_egress_id) {
            livekitEgressService.stopEgress(session.livekit_egress_id).catch((error) => {
                console.error('[Live] stop egress failed:', error.message);
            });
        }
        if (session.livekit_ingress_id) {
            livekitEgressService.deleteIngress(session.livekit_ingress_id).catch((error) => {
                console.error('[Live] delete ingress failed:', error.message);
            });
        }

        const updatedSession = await prisma.liveSession.update({
            where: { id },
            data: {
                status: 'ended',
                ended_at: new Date(),
                livekit_egress_id: null,
                livekit_ingress_id: null,
                viewer_count: 0,
                is_processing: false
            }
        });

        if (req.io) {
            req.io.to(id).emit('podcast_ended', sanitizeSession(updatedSession));
            req.io.emit('live_ended', { id });
        }

        res.json({ message: 'Live session ended successfully', session: updatedSession });
    } catch (error) {
        console.error('End Live Session Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Public guest token — no login required, viewer-only (canPublish: false)
exports.getGuestToken = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({ where: { id } });

        if (!session || session.status !== 'live') {
            return res.status(404).json({ error: 'Active live session not found' });
        }
        if (session.visibility === 'private') {
            return res.status(403).json({ error: 'This live stream is private' });
        }

        // Generate anonymous viewer identity
        const identity = `viewer-${crypto.randomBytes(4).toString('hex')}`;
        const token = await createToken(session.livekit_room_name, identity, false, 'viewer');

        res.json({
            token,
            roomName: session.livekit_room_name,
            livekitUrl: process.env.LIVEKIT_URL,
            isHost: false,
            isGuest: true,
            isStage: false,
            role: 'viewer',
            permissions: {
                canPublish: false,
                canSubscribe: true,
                canPublishData: true
            },
            chatEnabled: session.chat_enabled
        });
    } catch (error) {
        console.error('Get Guest Token Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getViewerToken = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({ where: { id } });

        if (!session || session.status !== 'live') {
            return res.status(404).json({ error: 'Active live session not found' });
        }
        if (session.visibility === 'private' && session.host_user_id !== req.user.id) {
            return res.status(403).json({ error: 'This live stream is private' });
        }

        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const isHost = session.host_user_id === req.user.id;
        let stageInvite = isHost ? null : await prisma.stageInvite.findFirst({
            where: {
                session_id: id,
                invitee_id: req.user.id,
                status: { in: ['pending', 'accepted'] }
            },
            orderBy: { invited_at: 'desc' }
        });
        if (stageInvite?.status === 'pending') {
            stageInvite = await prisma.stageInvite.update({
                where: { id: stageInvite.id },
                data: { status: 'accepted', accepted_at: new Date() }
            });
            if (req.io) {
                req.io.to(id).emit('stage_guest_joined', {
                    invite: stageInvite,
                    user: {
                        id: user.id,
                        unique_handle: user.unique_handle,
                        display_name: user.display_name,
                        avatar_url: user.avatar_url,
                        is_verified: user.is_verified
                    },
                    permissions: { canPublish: true, canSubscribe: true, canPublishData: true }
                });
                req.io.to(session.host_user_id).emit('invite_accepted', {
                    sessionId: id,
                    invite: stageInvite,
                    invitee: {
                        id: user.id,
                        unique_handle: user.unique_handle,
                        display_name: user.display_name,
                        avatar_url: user.avatar_url,
                        is_verified: user.is_verified
                    },
                    inviteeHandle: user.unique_handle
                });
            }
        }
        const canPublish = isHost || !!stageInvite;
        const role = isHost ? 'host' : (stageInvite ? 'stage' : 'viewer');
        const token = await createToken(session.livekit_room_name, user.unique_handle, canPublish, role);

        res.json({
            token,
            roomName: session.livekit_room_name,
            livekitUrl: process.env.LIVEKIT_URL,
            isHost,
            isStage: !!stageInvite,
            role,
            permissions: {
                canPublish,
                canSubscribe: true,
                canPublishData: true
            },
            chatEnabled: session.chat_enabled
        });
    } catch (error) {
        console.error('Get Viewer Token Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.upgradeViewerToken = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({ where: { id } });

        if (!session || session.status !== 'live') {
            return res.status(404).json({ error: 'Active live session not found' });
        }
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isHost = session.host_user_id === req.user.id;
        let stageInvite = isHost ? null : await prisma.stageInvite.findFirst({
            where: {
                session_id: id,
                invitee_id: req.user.id,
                status: { in: ['pending', 'accepted'] }
            },
            orderBy: { invited_at: 'desc' }
        });
        if (!isHost && !stageInvite) {
            return res.status(403).json({ error: 'Only the host or accepted stage guests can publish to this live session' });
        }
        if (stageInvite && stageInvite.status === 'pending') {
            stageInvite = await prisma.stageInvite.update({
                where: { id: stageInvite.id },
                data: { status: 'accepted', accepted_at: new Date() }
            });
            if (req.io) {
                req.io.to(id).emit('stage_guest_joined', {
                    invite: stageInvite,
                    user,
                    permissions: { canPublish: true, canSubscribe: true, canPublishData: true }
                });
                req.io.to(session.host_user_id).emit('invite_accepted', {
                    sessionId: id,
                    invite: stageInvite,
                    invitee: {
                        id: user.id,
                        unique_handle: user.unique_handle,
                        display_name: user.display_name,
                        avatar_url: user.avatar_url,
                        is_verified: user.is_verified
                    },
                    inviteeHandle: user.unique_handle
                });
            }
        }

        const token = await createToken(session.livekit_room_name, user.unique_handle, true, isHost ? 'host' : 'stage');

        res.json({
            token,
            roomName: session.livekit_room_name,
            livekitUrl: process.env.LIVEKIT_URL,
            isHost,
            isStage: !isHost,
            role: isHost ? 'host' : 'stage',
            permissions: {
                canPublish: true,
                canSubscribe: true,
                canPublishData: true
            }
        });
    } catch (error) {
        console.error('Upgrade Viewer Token Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getActiveLives = async (req, res) => {
    try {
        const sessions = await prisma.liveSession.findMany({
            where: {
                status: 'live',
                visibility: { in: ['public', 'unlisted'] }
            },
            include: { host: { select: publicUserSelect } },
            orderBy: { started_at: 'desc' }
        });
        res.json(sessions.map((session) => sanitizeSession(session)));
    } catch (error) {
        console.error('Get Active Lives Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getScheduledLives = async (req, res) => {
    try {
        const sessions = await prisma.liveSession.findMany({
            where: {
                status: 'scheduled',
                visibility: { in: ['public', 'unlisted'] }
            },
            include: { host: { select: publicUserSelect } },
            orderBy: [{ scheduled_at: 'asc' }, { created_at: 'desc' }]
        });
        res.json(sessions.map((session) => sanitizeSession(session)));
    } catch (error) {
        console.error('Get Scheduled Lives Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getSessionStats = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({ where: { id } });

        if (!session) {
            return res.status(404).json({ error: 'Live session not found' });
        }

        res.json({
            viewer_count_peak: session.viewer_count_peak,
            viewer_count: session.viewer_count,
            hls_url: session.hls_url,
            status: session.status,
            likes: session.like_count,
            gifts: session.gift_count,
            super_chat_amount: session.super_chat_amount,
            started_at: session.started_at,
            ended_at: session.ended_at
        });
    } catch (error) {
        console.error('Get Session Stats Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getRecordingDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({
            where: { id },
            include: {
                host: true,
                subtitles: true,
                chat_messages: {
                    orderBy: { created_at: 'asc' }
                }
            }
        });

        if (!session) {
            return res.status(404).json({ error: 'Recording not found' });
        }

        // We can expose the details even if the session is not ended yet for future-proofing,
        // but it's typically for 'ended' status.
        // Also exclude sensitive host data
        const { host, ...sessionData } = session;
        const { password_hash, ...publicHost } = host;

        res.json({
            ...sessionData,
            host: publicHost
        });

    } catch (error) {
        console.error('Get Recording Details Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.addComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { message, type = 'message', amount } = req.body;
        const normalizedAmount = safeNumber(amount);
        const session = await prisma.liveSession.findUnique({ where: { id } });
        if (!session || !['live', 'scheduled'].includes(session.status)) {
            return res.status(404).json({ error: 'Live session not found' });
        }
        if (!session.chat_enabled) {
            return res.status(403).json({ error: 'Live chat is disabled for this session' });
        }

        const user = await prisma.user.findUnique({ where: { id: req.user.id } });

        if (!message || message.trim() === '') {
            return res.status(400).json({ error: 'Comment message is required' });
        }
        if (!['message', 'gift', 'super_chat'].includes(type)) {
            return res.status(400).json({ error: 'Unsupported live message type' });
        }
        if (['gift', 'super_chat'].includes(type) && normalizedAmount < 0) {
            return res.status(400).json({ error: 'amount must be a positive number' });
        }

        const newComment = await prisma.chatMessage.create({
            data: {
                session_id: id,
                sender_handle: user.unique_handle,
                message: message.trim(),
                type,
                amount: amount ? normalizedAmount : null,
                created_at: new Date()
            }
        });

        if (type === 'gift') {
            await prisma.liveSession.update({
                where: { id },
                data: { gift_count: { increment: 1 } }
            });
        }
        if (type === 'super_chat') {
            await prisma.liveSession.update({
                where: { id },
                data: { super_chat_amount: { increment: normalizedAmount } }
            });
        }

        if (req.io) {
            req.io.to(id).emit('receive_chat_message', {
                id: newComment.id,
                senderHandle: user.unique_handle,
                message: newComment.message,
                type: newComment.type,
                amount: newComment.amount,
                created_at: newComment.created_at
            });
        }

        res.status(201).json({
            message: 'Comment added successfully',
            comment: newComment
        });

    } catch (error) {
        console.error('Add Comment Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.toggleLike = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        const session = await prisma.liveSession.findUnique({ where: { id } });
        if (!session) {
            return res.status(404).json({ error: 'Live session not found' });
        }

        const existingLike = await prisma.like.findUnique({
            where: {
                user_id_session_id: {
                    user_id,
                    session_id: id
                }
            }
        });

        if (existingLike) {
            // Unlike
            await prisma.like.delete({ where: { id: existingLike.id } });
            await prisma.liveSession.update({
                where: { id },
                data: { like_count: { decrement: 1 } }
            });
            if (req.io) req.io.to(id).emit('live_like_update', { sessionId: id, delta: -1 });
            res.json({ liked: false });
        } else {
            // Like
            await prisma.like.create({
                data: { user_id, session_id: id }
            });
            await prisma.liveSession.update({
                where: { id },
                data: { like_count: { increment: 1 } }
            });
            if (req.io) req.io.to(id).emit('live_like_update', { sessionId: id, delta: 1 });
            res.json({ liked: true });
        }
    } catch (error) {
        console.error("Toggle like error:", error);
        res.status(500).json({ error: 'Failed to toggle like status' });
    }
};

exports.createIngress = async (req, res) => {
    try {
        const { id } = req.params;
        const { type = 'rtmp' } = req.body;

        if (!allowedIngressTypes.has(type)) {
            return res.status(400).json({ error: 'type must be rtmp or whip' });
        }

        const session = await prisma.liveSession.findUnique({ where: { id } });
        if (!session || session.host_user_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized to create ingress for this session' });
        }
        if (!livekitEgressService.isIngressEnabled()) {
            return res.status(202).json({
                enabled: false,
                message: 'LiveKit ingress is disabled. Set ENABLE_LIVEKIT_INGRESS=true to create OBS/RTMP inputs.'
            });
        }
        if (session.livekit_ingress_id && session.ingest_url) {
            return res.json({
                enabled: true,
                type: session.ingress_type,
                ingestUrl: session.ingest_url,
                streamKey: session.stream_key,
                session: sanitizeSession(session, true)
            });
        }

        const ingress = await livekitEgressService.createIngress(session, type);
        const config = extractIngressConfig(ingress);

        const updatedSession = await prisma.liveSession.update({
            where: { id },
            data: {
                livekit_ingress_id: config.id,
                ingress_type: type,
                ingest_url: config.url,
                stream_key: config.streamKey
            }
        });

        res.status(201).json({
            enabled: true,
            type,
            ingestUrl: config.url,
            streamKey: config.streamKey,
            session: sanitizeSession(updatedSession, true)
        });
    } catch (error) {
        console.error('Create Ingress Error:', error);
        res.status(500).json({ error: 'Failed to create live ingress', details: error.message });
    }
};

exports.getObsConfig = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({ where: { id } });

        if (!session || session.host_user_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized to view stream settings' });
        }

        res.json({
            enabled: Boolean(session.ingest_url && session.stream_key),
            type: session.ingress_type,
            ingestUrl: session.ingest_url,
            streamKey: session.stream_key,
            roomName: session.livekit_room_name,
            hlsUrl: session.hls_url,
            livekitUrl: process.env.LIVEKIT_URL
        });
    } catch (error) {
        console.error('Get OBS Config Error:', error);
        res.status(500).json({ error: 'Failed to fetch OBS config' });
    }
};

exports.updateLiveSettings = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, category, visibility, scheduled_at, chat_enabled, moderation_enabled, dvr_enabled, low_latency } = req.body;

        if (visibility && !allowedVisibility.has(visibility)) {
            return res.status(400).json({ error: 'visibility must be public, private or unlisted' });
        }

        const existing = await prisma.liveSession.findUnique({ where: { id } });
        if (!existing || existing.host_user_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized to update this session' });
        }

        const session = await prisma.liveSession.update({
            where: { id },
            data: {
                ...(title !== undefined ? { title } : {}),
                ...(description !== undefined ? { description } : {}),
                ...(category !== undefined ? { category } : {}),
                ...(visibility !== undefined ? { visibility } : {}),
                ...(scheduled_at !== undefined ? { scheduled_at: scheduled_at ? new Date(scheduled_at) : null } : {}),
                ...(chat_enabled !== undefined ? { chat_enabled } : {}),
                ...(moderation_enabled !== undefined ? { moderation_enabled } : {}),
                ...(dvr_enabled !== undefined ? { dvr_enabled } : {}),
                ...(low_latency !== undefined ? { low_latency } : {})
            }
        });

        if (req.io) {
            req.io.to(id).emit('live_settings_updated', sanitizeSession(session));
        }

        res.json({ message: 'Live settings updated', session: sanitizeSession(session, true) });
    } catch (error) {
        console.error('Update Live Settings Error:', error);
        res.status(500).json({ error: 'Failed to update live settings' });
    }
};

exports.moderateMessage = async (req, res) => {
    try {
        const { id, messageId } = req.params;
        const { action } = req.body;

        const session = await prisma.liveSession.findUnique({ where: { id } });
        if (!session || session.host_user_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized to moderate this session' });
        }
        if (!['delete', 'pin', 'unpin'].includes(action)) {
            return res.status(400).json({ error: 'action must be delete, pin or unpin' });
        }

        const data = action === 'delete'
            ? { is_deleted: true, message: '[deleted]', moderated_at: new Date() }
            : { is_pinned: action === 'pin', moderated_at: new Date() };

        const updateResult = await prisma.chatMessage.updateMany({
            where: { id: messageId, session_id: id },
            data
        });

        if (updateResult.count === 0) {
            return res.status(404).json({ error: 'Live message not found' });
        }

        const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });

        if (req.io) {
            req.io.to(id).emit('live_message_moderated', { messageId, action, message });
        }

        res.json({ message: 'Moderation action applied', chatMessage: message });
    } catch (error) {
        console.error('Moderate Message Error:', error);
        res.status(500).json({ error: 'Failed to moderate message' });
    }
};

exports.getLiveParticipants = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await getHostOwnedSession(id, req.user.id);
        if (!session) {
            return res.status(403).json({ error: 'Unauthorized to view participants for this session' });
        }
        if (!livekitRoomService.hasLiveKitConfig()) {
            return res.status(503).json({ error: 'LiveKit is not configured' });
        }

        const participants = await livekitRoomService.listParticipants(session.livekit_room_name);
        res.json({
            roomName: session.livekit_room_name,
            participants: participants.map((participant) => ({
                sid: participant.sid,
                identity: participant.identity,
                name: participant.name,
                state: participant.state,
                joinedAt: participant.joinedAt,
                permission: participant.permission,
                tracks: participant.tracks
            }))
        });
    } catch (error) {
        console.error('Get Live Participants Error:', error);
        res.status(500).json({ error: 'Failed to fetch live participants', details: error.message });
    }
};

exports.removeLiveParticipant = async (req, res) => {
    try {
        const { id } = req.params;
        const { identity } = req.body;
        const session = await getHostOwnedSession(id, req.user.id);

        if (!session) {
            return res.status(403).json({ error: 'Unauthorized to moderate this session' });
        }
        if (!identity) {
            return res.status(400).json({ error: 'identity is required' });
        }
        const targetUser = await prisma.user.findFirst({
            where: { unique_handle: identity },
            select: publicUserSelect
        });
        if (targetUser?.id === session.host_user_id) {
            return res.status(400).json({ error: 'Host cannot be removed from their own live session' });
        }
        if (!livekitRoomService.hasLiveKitConfig()) {
            return res.status(503).json({ error: 'LiveKit is not configured' });
        }

        await livekitRoomService.removeParticipant(session.livekit_room_name, identity);

        if (targetUser) {
            await prisma.stageInvite.updateMany({
                where: { session_id: id, invitee_id: targetUser.id, status: 'accepted' },
                data: { status: 'ended', left_at: new Date() }
            });
        }

        if (req.io) {
            req.io.to(id).emit('live_participant_removed', { identity });
            if (targetUser) {
                req.io.to(targetUser.id).emit('guest_removed', { sessionId: id, identity });
            }
        }

        res.json({ message: 'Participant removed', identity });
    } catch (error) {
        console.error('Remove Live Participant Error:', error);
        res.status(500).json({ error: 'Failed to remove participant', details: error.message });
    }
};

exports.updateParticipantPermissions = async (req, res) => {
    try {
        const { id } = req.params;
        const { identity, canPublish = false, canSubscribe = true, canPublishData = true } = req.body;
        const session = await getHostOwnedSession(id, req.user.id);

        if (!session) {
            return res.status(403).json({ error: 'Unauthorized to moderate this session' });
        }
        if (!identity) {
            return res.status(400).json({ error: 'identity is required' });
        }
        const targetUser = await prisma.user.findFirst({
            where: { unique_handle: identity },
            select: publicUserSelect
        });
        if (targetUser?.id === session.host_user_id && !canPublish) {
            return res.status(400).json({ error: 'Host publish permission cannot be disabled here' });
        }
        if (canPublish && targetUser?.id !== session.host_user_id) {
            const activeInvite = targetUser ? await prisma.stageInvite.findFirst({
                where: { session_id: id, invitee_id: targetUser.id, status: 'accepted' }
            }) : null;
            if (!activeInvite) {
                return res.status(403).json({ error: 'User must accept a stage invite before publish permission is allowed' });
            }
        }
        if (!livekitRoomService.hasLiveKitConfig()) {
            return res.status(503).json({ error: 'LiveKit is not configured' });
        }

        const participant = await livekitRoomService.updateParticipantPermissions(session.livekit_room_name, identity, {
            canPublish,
            canSubscribe,
            canPublishData
        });

        if (req.io) {
            req.io.to(id).emit('live_participant_permissions_updated', {
                identity,
                canPublish,
                canSubscribe,
                canPublishData
            });
            if (targetUser) {
                req.io.to(targetUser.id).emit('stage_permissions_updated', {
                    sessionId: id,
                    canPublish,
                    canSubscribe,
                    canPublishData
                });
            }
        }

        res.json({ message: 'Participant permissions updated', participant });
    } catch (error) {
        console.error('Update Participant Permissions Error:', error);
        res.status(500).json({ error: 'Failed to update participant permissions', details: error.message });
    }
};

exports.viewerHeartbeat = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.findUnique({ where: { id } });
        if (!session || session.status !== 'live') {
            return res.status(404).json({ error: 'Active live session not found' });
        }

        const viewerCount = Math.max(0, safeNumber(req.body.viewerCount, session.viewer_count));
        const updated = await prisma.liveSession.update({
            where: { id },
            data: {
                viewer_count: viewerCount,
                viewer_count_peak: { increment: viewerCount > session.viewer_count_peak ? viewerCount - session.viewer_count_peak : 0 }
            }
        });

        if (req.io) {
            req.io.to(id).emit('viewer_count_update', {
                sessionId: id,
                viewerCount: updated.viewer_count,
                viewerCountPeak: updated.viewer_count_peak
            });
        }

        res.json({ viewerCount: updated.viewer_count, viewerCountPeak: updated.viewer_count_peak });
    } catch (error) {
        console.error('Viewer Heartbeat Error:', error);
        res.status(500).json({ error: 'Failed to update viewer count' });
    }
};

exports.getLikeStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        const existingLike = await prisma.like.findUnique({
            where: {
                user_id_session_id: {
                    user_id,
                    session_id: id
                }
            }
        });

        res.json({ liked: !!existingLike });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch like status' });
    }
};

exports.deleteRecording = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        const session = await prisma.liveSession.findUnique({
            where: { id },
            include: { subtitles: true }
        });

        if (!session) {
            return res.status(404).json({ error: 'Recording not found' });
        }

        if (session.host_user_id !== user_id) {
            return res.status(403).json({ error: 'You do not have permission to delete this recording' });
        }

        // Delete associated files
        try {
            // 1. Delete subtitle files
            if (session.subtitles && session.subtitles.length > 0) {
                session.subtitles.forEach(sub => {
                    if (sub.vtt_url) {
                        try {
                            const url = new URL(sub.vtt_url);
                            const fileName = path.basename(url.pathname);
                            const filePath = path.join(__dirname, '../../uploads', fileName);
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                            }
                        } catch (e) {
                            console.error('Failed to parse subtitle URL or delete file:', e);
                        }
                    }
                });
            }

            // 2. Delete HLS directory
            const hlsDir = path.join(__dirname, '../../uploads', `hls_${id}`);
            if (fs.existsSync(hlsDir)) {
                fs.rmSync(hlsDir, { recursive: true, force: true });
            }

            // 3. Delete local thumbnail
            if (session.thumbnail_url && session.thumbnail_url.includes('/uploads/')) {
                try {
                    const url = new URL(session.thumbnail_url);
                    const fileName = path.basename(url.pathname);
                    const filePath = path.join(__dirname, '../../uploads', fileName);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                } catch (e) { }
            }

            // 4. Delete original video file if recording_url points to a direct local file
            if (session.recording_url && session.recording_url.includes('/uploads/') && !session.recording_url.includes('hls_')) {
                try {
                    const url = new URL(session.recording_url);
                    const fileName = path.basename(url.pathname);
                    const filePath = path.join(__dirname, '../../uploads', fileName);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                } catch (e) { }
            }
        } catch (fileError) {
            console.error('Error deleting files associated with recording:', fileError);
            // We can choose to softly ignore file deletion errors to still clean up DB
        }

        // We must also delete nested relations manually or use cascade deletes, 
        // since sqlite in prisma might require explicit cascades or manual deletion.
        // Let's manually delete likes, comments, subtitles, and invites related to this session to avoid foreign key constraints
        await prisma.subtitle.deleteMany({ where: { session_id: id } });
        await prisma.like.deleteMany({ where: { session_id: id } });
        await prisma.chatMessage.deleteMany({ where: { session_id: id } });
        await prisma.stageInvite.deleteMany({ where: { session_id: id } });

        await prisma.liveSession.delete({
            where: { id }
        });

        res.json({ message: 'Recording deleted successfully' });
    } catch (error) {
        console.error("Delete recording error:", error);
        res.status(500).json({ error: 'Failed to delete recording' });
    }
};

exports.getPublicVODs = async (req, res) => {
    try {
        const { category, sort = 'latest', limit = 24 } = req.query;
        const where = { status: 'ended', recording_url: { not: null } };
        if (category && category !== 'All') where.category = category;

        const orderBy = sort === 'popular'
            ? [{ views: 'desc' }, { ended_at: 'desc' }]
            : [{ ended_at: 'desc' }];

        const sessions = await prisma.liveSession.findMany({
            where,
            include: { host: { select: { id: true, unique_handle: true, display_name: true, avatar_url: true, is_verified: true } } },
            orderBy,
            take: parseInt(limit)
        });
        res.json(sessions);
    } catch (error) {
        console.error('Get Public VODs Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.incrementViewCount = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.liveSession.update({
            where: { id },
            data: { views: { increment: 1 } }
        });

        res.json({ views: session.views });
    } catch (error) {
        console.error("Increment view error:", error);
        res.status(500).json({ error: 'Failed to increment view count' });
    }
};
