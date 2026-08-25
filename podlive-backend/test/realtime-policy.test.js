const test = require('node:test');
const assert = require('node:assert/strict');
const authController = require('../src/controllers/auth.controller');
const liveController = require('../src/controllers/live.controller');
const liveRoutes = require('../src/routes/live.routes');
const userRoutes = require('../src/routes/user.routes');
const uploadRoutes = require('../src/routes/upload.routes');

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

test('recording egress cannot be started from the live API', () => {
    assert.equal(liveController.startHlsEgress, undefined);
    assert.equal(routePaths(liveRoutes).some((path) => /egress/i.test(path)), false);
});

test('live recordings stay disabled while explicit creator uploads are exposed separately', () => {
    assert.equal(routePaths(liveRoutes).includes('/vods'), false);
    assert.equal(routePaths(liveRoutes).includes('/videos'), true);
    assert.equal(routePaths(userRoutes).includes('/recordings'), true);
    assert.equal(routePaths(liveRoutes).includes('/:id/details'), true);
    assert.equal(routePaths(uploadRoutes).includes('/direct/init'), true);
    assert.equal(routePaths(uploadRoutes).includes('/direct/:uploadId/status'), true);
    assert.equal(routePaths(uploadRoutes).includes('/direct/:uploadId/complete'), true);
});
