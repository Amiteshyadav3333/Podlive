const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateViewProgress } = require('../src/services/view-metrics.service');

test('a repeated heartbeat only adds new watch time and counts once', () => {
    const first = calculateViewProgress({ previousWatchTime: 0, submittedWatchTime: 35, duration: 120 });
    assert.equal(first.becameQualified, true);
    assert.equal(first.watchDelta, 35);
    const repeated = calculateViewProgress({ previousWatchTime: 35, submittedWatchTime: 35, duration: 120, wasQualified: true });
    assert.equal(repeated.becameQualified, false);
    assert.equal(repeated.watchDelta, 0);
});

test('seeking cannot submit more watch time than the video duration', () => {
    const result = calculateViewProgress({ submittedWatchTime: 9999, duration: 100 });
    assert.equal(result.nextWatchTime, 100);
});

test('short videos use a proportional qualification threshold', () => {
    const result = calculateViewProgress({ submittedWatchTime: 3, duration: 10 });
    assert.equal(result.thresholdSeconds, 3);
    assert.equal(result.qualified, true);
});
