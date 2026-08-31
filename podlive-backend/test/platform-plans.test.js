const test = require('node:test');
const assert = require('node:assert/strict');
const { PLANS } = require('../src/controllers/plan.controller');
const { resolveEntitlements } = require('../src/services/platform-subscription.service');

test('platform plans use the configured monthly INR prices and benefits', () => {
    assert.equal(PLANS.plus.amountPaise, 29900);
    assert.equal(PLANS.max.amountPaise, 59900);
    assert.equal(PLANS.plus.durationDays, 30);
    assert.ok(PLANS.max.benefits.includes('Unlimited podcast creation'));
});

test('only a verified and unexpired subscription grants paid entitlements', () => {
    const now = new Date('2026-08-28T00:00:00Z');
    assert.equal(resolveEntitlements({ plan_code: 'max', status: 'verification_pending' }, now).planCode, 'free');
    const active = resolveEntitlements({ plan_code: 'max', status: 'active', expires_at: '2026-09-28T00:00:00Z' }, now);
    assert.equal(active.planCode, 'max');
    assert.equal(active.adFree, true);
    assert.equal(active.podcastLimit, null);
    assert.equal(resolveEntitlements({ plan_code: 'plus', status: 'active', expires_at: '2026-07-28T00:00:00Z' }, now).planCode, 'free');
    const free = resolveEntitlements(null, now);
    assert.equal(free.fullAccess, false);
    assert.equal(free.liveMinutes, 5);
    assert.equal(active.fullAccess, true);
});

test('subscription checkout routes protect user orders', () => {
    const routes = require('node:fs').readFileSync(require.resolve('../src/routes/plan.routes'), 'utf8');
    assert.match(routes, /post\('\/checkout', authMiddleware/);
    assert.match(routes, /post\('\/orders\/:id\/reference', authMiddleware/);
    assert.doesNotMatch(routes, /payment-webhook|admin\/payment-reviews/);
});
