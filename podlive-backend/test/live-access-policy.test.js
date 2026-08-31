const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'test-api-key';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'test-secret-that-is-long-enough-for-jwt';
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://livekit.test';

const state = {
    session: null,
    user: null,
    accessInvite: null,
    stageInvite: null,
    accessInviteUpdates: [],
    stageInviteUpdates: [],
    lastLiveFindMany: null
    , platformSubscription: { plan_code: 'max', status: 'active', expires_at: new Date(Date.now() + 86400000) }
};

const prisma = {
    liveSession: {
        findUnique: async () => state.session,
        findMany: async (args) => { state.lastLiveFindMany = args; return []; },
        update: async ({ data }) => (state.session = { ...state.session, ...data }),
        create: async ({ data }) => ({ id: 'session-1', ...data }),
        count: async () => 0
    },
    liveAccessInvite: {
        findUnique: async ({ where }) => state.accessInvite?.token_hash === where.token_hash ? state.accessInvite : null,
        update: async ({ data }) => {
            state.accessInviteUpdates.push(data);
            state.accessInvite = {
                ...state.accessInvite,
                redeemed_by: data.redeemed_by,
                use_count: state.accessInvite.use_count + (data.use_count?.increment || 0)
            };
            return state.accessInvite;
        },
        create: async ({ data }) => ({ id: 'access-1', use_count: 0, revoked_at: null, created_at: new Date(), ...data }),
        findMany: async () => state.accessInvite ? [state.accessInvite] : [],
        updateMany: async () => ({ count: 1 })
    },
    stageInvite: {
        findFirst: async ({ where }) => {
            if (!state.stageInvite) return null;
            if (state.stageInvite.session_id !== where.session_id || state.stageInvite.invitee_id !== where.invitee_id) return null;
            const allowed = typeof where.status === 'string' ? [where.status] : where.status?.in;
            return !allowed || allowed.includes(state.stageInvite.status) ? state.stageInvite : null;
        },
        update: async ({ data }) => {
            state.stageInviteUpdates.push(data);
            state.stageInvite = { ...state.stageInvite, ...data };
            return state.stageInvite;
        }
    },
    user: { findUnique: async () => state.user },
    videoAccessGrant: { findUnique: async () => null }
    , platformSubscription: { findFirst: async () => state.platformSubscription }
};

const prismaModule = require('@prisma/client');
const OriginalPrismaClient = prismaModule.PrismaClient;
prismaModule.PrismaClient = class MockPrismaClient { constructor() { return prisma; } };
delete require.cache[require.resolve('../src/controllers/live.controller')];
const liveController = require('../src/controllers/live.controller');
prismaModule.PrismaClient = OriginalPrismaClient;

const baseSession = (overrides = {}) => ({
    id: 'session-1',
    host_user_id: 'host-1',
    status: 'live',
    visibility: 'public',
    livekit_room_name: 'room-1',
    chat_enabled: true,
    host: { id: 'host-1', unique_handle: 'host' },
    video: null,
    ...overrides
});

const response = () => ({
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; }
});

const reset = (session = baseSession()) => {
    state.session = session;
    state.user = { id: 'viewer-1', unique_handle: 'viewer', display_name: 'Viewer' };
    state.accessInvite = null;
    state.stageInvite = null;
    state.accessInviteUpdates = [];
    state.stageInviteUpdates = [];
    state.lastLiveFindMany = null;
    state.platformSubscription = { plan_code: 'max', status: 'active', expires_at: new Date(Date.now() + 86400000) };
};

const accessInvite = (token, overrides = {}) => ({
    id: 'access-1',
    session_id: 'session-1',
    token_hash: crypto.createHash('sha256').update(token).digest('hex'),
    allowed_user_id: null,
    redeemed_by: null,
    use_count: 0,
    max_uses: 1,
    expires_at: new Date(Date.now() + 60_000),
    revoked_at: null,
    ...overrides
});

test('public anonymous guest receives viewer-only permissions', async () => {
    reset();
    const res = response();
    await liveController.getGuestToken({ params: { id: 'session-1' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.role, 'viewer');
    assert.equal(res.body.permissions.canPublish, false);
    assert.equal(res.body.permissions.canSubscribe, true);
    assert.ok(res.body.token);
});

test('live creation validates visibility and creates realtime-only sessions', async () => {
    reset();
    const invalid = response();
    await liveController.createLiveSession({ body: { title: 'Show', visibility: 'friends' }, user: { id: 'host-1' } }, invalid);
    assert.equal(invalid.statusCode, 400);

    const created = response();
    await liveController.createLiveSession({ body: { title: 'Show', visibility: 'private' }, user: { id: 'host-1' } }, created);
    assert.equal(created.statusCode, 201);
    assert.equal(created.body.session.visibility, 'private');
    assert.equal(created.body.session.status, 'live');
    assert.equal(created.body.realtimeOnly, true);
    assert.equal(created.body.hlsEnabled, false);
});

test('free users receive a five-minute live room, not an unlimited trial', async () => {
    reset();
    state.platformSubscription = null;
    const res = response();
    await liveController.createLiveSession({ body: { title: 'Free show', visibility: 'public' }, user: { id: 'host-1' } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.subscription.fullAccess, false);
    assert.ok(res.body.subscription.freeLiveEndsAt);
});

test('private live rejects anonymous guests and viewers without an invite', async () => {
    reset(baseSession({ visibility: 'private' }));
    const guestRes = response();
    await liveController.getGuestToken({ params: { id: 'session-1' } }, guestRes);
    assert.equal(guestRes.statusCode, 403);

    const viewerRes = response();
    await liveController.getViewerToken({ params: { id: 'session-1' }, query: {}, user: { id: 'viewer-1' } }, viewerRes);
    assert.equal(viewerRes.statusCode, 403);
});

test('valid private invite is bound once and grants viewer-only access', async () => {
    reset(baseSession({ visibility: 'private' }));
    state.accessInvite = accessInvite('valid-token');
    const res = response();
    await liveController.getViewerToken({ params: { id: 'session-1' }, query: { invite: 'valid-token' }, user: { id: 'viewer-1' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.role, 'viewer');
    assert.equal(res.body.permissions.canPublish, false);
    assert.equal(state.accessInvite.redeemed_by, 'viewer-1');
    assert.equal(state.accessInvite.use_count, 1);
});

test('private invite rejects expired, revoked, wrong-user and second-user access', async () => {
    for (const override of [
        { expires_at: new Date(Date.now() - 1) },
        { revoked_at: new Date() },
        { allowed_user_id: 'someone-else' },
        { redeemed_by: 'someone-else', use_count: 1 }
    ]) {
        reset(baseSession({ visibility: 'private' }));
        state.accessInvite = accessInvite('blocked-token', override);
        const res = response();
        await liveController.getViewerToken({ params: { id: 'session-1' }, query: { invite: 'blocked-token' }, user: { id: 'viewer-1' } }, res);
        assert.equal(res.statusCode, 403);
    }
});

test('accepted stage guest can publish and reconnect to a private live', async () => {
    reset(baseSession({ visibility: 'private' }));
    state.stageInvite = { id: 'stage-1', session_id: 'session-1', invitee_id: 'viewer-1', status: 'accepted' };
    const res = response();
    await liveController.getViewerToken({ params: { id: 'session-1' }, query: {}, user: { id: 'viewer-1' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.role, 'stage');
    assert.equal(res.body.permissions.canPublish, true);
});

test('host can auto-start a scheduled private live and publish', async () => {
    reset(baseSession({ visibility: 'private', status: 'scheduled' }));
    state.user = { id: 'host-1', unique_handle: 'host', display_name: 'Host' };
    const res = response();
    await liveController.getViewerToken({ params: { id: 'session-1' }, query: {}, user: { id: 'host-1' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.role, 'host');
    assert.equal(res.body.permissions.canPublish, true);
    assert.equal(state.session.status, 'live');
});

test('pending stage invite upgrades viewer to publisher; no invite is rejected', async () => {
    reset();
    state.stageInvite = { id: 'stage-1', session_id: 'session-1', invitee_id: 'viewer-1', status: 'pending' };
    const accepted = response();
    await liveController.upgradeViewerToken({ params: { id: 'session-1' }, user: { id: 'viewer-1' } }, accepted);
    assert.equal(accepted.statusCode, 200);
    assert.equal(accepted.body.role, 'stage');
    assert.equal(accepted.body.permissions.canPublish, true);
    assert.equal(state.stageInvite.status, 'accepted');

    state.stageInvite = null;
    const denied = response();
    await liveController.upgradeViewerToken({ params: { id: 'session-1' }, user: { id: 'viewer-1' } }, denied);
    assert.equal(denied.statusCode, 403);
});

test('private invite can load session details and is reusable only by its bound user', async () => {
    reset(baseSession({ visibility: 'private' }));
    state.accessInvite = accessInvite('details-token');
    const allowed = response();
    await liveController.getSessionDetails({ params: { id: 'session-1' }, query: { invite: 'details-token' }, user: { id: 'viewer-1' } }, allowed);
    assert.equal(allowed.statusCode, 200);

    const denied = response();
    await liveController.getSessionDetails({ params: { id: 'session-1' }, query: { invite: 'details-token' }, user: { id: 'viewer-2' } }, denied);
    assert.equal(denied.statusCode, 404);
});

test('only a private-live host can create access links', async () => {
    reset(baseSession({ visibility: 'public' }));
    const publicRes = response();
    await liveController.createAccessInvite({ params: { id: 'session-1' }, body: {}, user: { id: 'host-1' } }, publicRes);
    assert.equal(publicRes.statusCode, 409);

    reset(baseSession({ visibility: 'private' }));
    const privateRes = response();
    await liveController.createAccessInvite({ params: { id: 'session-1' }, body: {}, user: { id: 'host-1' } }, privateRes);
    assert.equal(privateRes.statusCode, 201);
    assert.ok(privateRes.body.token);
    assert.match(privateRes.body.joinPath, /^\/live\/session-1\?invite=/);
    assert.equal(privateRes.body.invite.token_hash, undefined);

    const nonHost = response();
    await liveController.createAccessInvite({ params: { id: 'session-1' }, body: {}, user: { id: 'viewer-1' } }, nonHost);
    assert.equal(nonHost.statusCode, 404);
});

test('ending a live is host-only and clears realtime state', async () => {
    reset(baseSession({ viewer_count: 9, livekit_ingress_id: null }));
    const denied = response();
    await liveController.endLiveSession({ params: { id: 'session-1' }, user: { id: 'viewer-1' } }, denied);
    assert.equal(denied.statusCode, 403);

    const emitted = [];
    const io = { to: () => ({ emit: (...args) => emitted.push(args) }), emit: (...args) => emitted.push(args) };
    const ended = response();
    await liveController.endLiveSession({ params: { id: 'session-1' }, user: { id: 'host-1' }, io }, ended);
    assert.equal(ended.statusCode, 200);
    assert.equal(state.session.status, 'ended');
    assert.equal(state.session.viewer_count, 0);
    assert.equal(state.session.recording_url, null);
    assert.ok(emitted.length >= 2);
});

test('public discovery queries never include private sessions', async () => {
    reset();
    const active = response();
    await liveController.getActiveLives({}, active);
    assert.equal(active.statusCode, 200);
    assert.deepEqual(state.lastLiveFindMany.where.visibility.in, ['public', 'unlisted']);

    const scheduled = response();
    await liveController.getScheduledLives({}, scheduled);
    assert.equal(scheduled.statusCode, 200);
    assert.deepEqual(state.lastLiveFindMany.where.visibility.in, ['public', 'unlisted']);
});

test('all live access and stage-management API routes are exposed', () => {
    const liveRoutes = require('../src/routes/live.routes');
    const stageRoutes = require('../src/routes/stage.routes');
    const paths = (router) => router.stack.map((layer) => layer.route?.path).filter(Boolean);
    for (const path of [
        '/create', '/:id/start', '/:id/end', '/:id/token', '/:id/guest-token', '/:id/upgrade',
        '/:id/access-invites', '/:id/settings', '/:id/moderation/remove-participant',
        '/:id/moderation/participant-permissions'
    ]) assert.ok(paths(liveRoutes).includes(path), `missing live route ${path}`);
    for (const path of [
        '/invite', '/invite/:id/accept', '/invite/:id/reject', '/guest/:sessionId/:userId',
        '/guest/:sessionId/:userId/mute', '/guest/:sessionId/:userId/disable-camera',
        '/guest/:sessionId/:userId/permissions', '/:sessionId/guests'
    ]) assert.ok(paths(stageRoutes).includes(path), `missing stage route ${path}`);
});
