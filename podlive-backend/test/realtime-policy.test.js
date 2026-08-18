const test = require('node:test');
const assert = require('node:assert/strict');
const authController = require('../src/controllers/auth.controller');
const liveController = require('../src/controllers/live.controller');
const liveRoutes = require('../src/routes/live.routes');
const userRoutes = require('../src/routes/user.routes');

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
});

const routePaths = (router) => router.stack.map((layer) => layer.route?.path).filter(Boolean);

test('SSO rejects requests without a bounded one-time ticket', async () => {
    const res = response();
    await authController.cheetchatSso({ body: {} }, res);
    assert.equal(res.statusCode, 400);
});

test('recording egress is permanently unavailable', async () => {
    const res = response();
    await liveController.startHlsEgress({}, res);
    assert.equal(res.statusCode, 410);
    assert.match(res.body.error, /real-time only/i);
});

test('live recordings stay disabled while explicit creator uploads are exposed separately', () => {
    assert.equal(routePaths(liveRoutes).includes('/vods'), false);
    assert.equal(routePaths(liveRoutes).includes('/videos'), true);
    assert.equal(routePaths(userRoutes).includes('/recordings'), false);
    assert.equal(routePaths(liveRoutes).includes('/:id/details'), true);
    const deleteRoutes = liveRoutes.stack.filter((layer) => layer.route?.methods?.delete);
    assert.equal(deleteRoutes.length, 0);
});
