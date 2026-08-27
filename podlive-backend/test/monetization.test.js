const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateEligibility, WATCH_SECONDS_REQUIREMENT } = require('../src/services/monetization.service');

test('monetization stays ineligible until both requirements are met', () => {
    const result = calculateEligibility({ followers: 1000, watchSeconds: WATCH_SECONDS_REQUIREMENT - 1 });
    assert.equal(result.eligible, false);
    assert.equal(result.status, 'ineligible');
    assert.equal(result.progress.followersPercent, 100);
    assert.equal(result.progress.watchHoursPercent, 99);
});

test('monetization activates when followers and watch hours qualify', () => {
    const result = calculateEligibility({ followers: 1400, watchSeconds: WATCH_SECONDS_REQUIREMENT });
    assert.equal(result.eligible, true);
    assert.equal(result.status, 'active');
    assert.equal(result.progress.watchHours, 5000);
});

test('a suspended account is not automatically reactivated', () => {
    const result = calculateEligibility({ followers: 2000, watchSeconds: WATCH_SECONDS_REQUIREMENT * 2, currentStatus: 'suspended' });
    assert.equal(result.eligible, true);
    assert.equal(result.status, 'suspended');
});
