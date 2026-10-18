const test = require('node:test');
const assert = require('node:assert/strict');
const createViewerCountUpdater = require('../src/services/viewer-count-updater');

test('viewer count writes are coalesced and updates go only to the creator', async () => {
  const pendingTimers = [];
  const calls = { findUnique: [], update: [], emits: [] };
  let viewerCount = 125;
  const prisma = {
    liveSession: {
      async findUnique(query) {
        calls.findUnique.push(query);
        return { id: 'live-1', host_user_id: 'creator-1', viewer_count_peak: 100 };
      },
      async update(query) { calls.update.push(query); }
    }
  };
  const io = {
    to(room) {
      return { emit(event, payload) { calls.emits.push({ room, event, payload }); } };
    }
  };
  const schedule = createViewerCountUpdater({
    prisma,
    io,
    getViewerCount: () => viewerCount,
    setTimer(callback, delayMs) {
      const timer = { callback, delayMs, unref() {} };
      pendingTimers.push(timer);
      return timer;
    }
  });

  schedule('live-1');
  schedule('live-1');
  assert.equal(pendingTimers.length, 1);
  assert.equal(pendingTimers[0].delayMs, 1500);

  viewerCount = 130;
  await pendingTimers[0].callback();

  assert.equal(calls.findUnique.length, 1);
  assert.deepEqual(calls.update[0].data, { viewer_count: 130, viewer_count_peak: 130 });
  assert.deepEqual(calls.emits, [{
    room: 'creator-1',
    event: 'viewer_count_update',
    payload: { sessionId: 'live-1', viewerCount: 130, viewerCountPeak: 130 }
  }]);
});
