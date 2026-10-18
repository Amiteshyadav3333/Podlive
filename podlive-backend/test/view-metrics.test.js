const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateViewProgress } = require('../src/services/view-metrics.service');

test('watch time advances only from server measured elapsed time', () => {
    const first = calculateViewProgress({ previousWatchTime: 0, elapsedSeconds: 15, duration: 120 });
    assert.equal(first.becameQualified, false);
    assert.equal(first.watchDelta, 15);
    const repeated = calculateViewProgress({ previousWatchTime: 15, elapsedSeconds: 15, duration: 120, wasQualified: false });
    assert.equal(repeated.becameQualified, true);
    assert.equal(repeated.watchDelta, 15);
    const later = calculateViewProgress({ previousWatchTime: 30, elapsedSeconds: 15, duration: 120, wasQualified: true });
    assert.equal(later.becameQualified, false);
});

test('heartbeat time is capped and cannot exceed the canonical video duration', () => {
    const result = calculateViewProgress({ previousWatchTime: 90, elapsedSeconds: 9999, duration: 100 });
    assert.equal(result.nextWatchTime, 100);
    assert.equal(result.watchDelta, 10);
});

test('short videos use a proportional qualification threshold', () => {
    const result = calculateViewProgress({ elapsedSeconds: 3, duration: 10 });
    assert.equal(result.thresholdSeconds, 3);
    assert.equal(result.qualified, true);
});
