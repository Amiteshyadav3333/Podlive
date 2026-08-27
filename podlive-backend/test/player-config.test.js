const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlayerConfig, SHORTCUTS } = require('../src/services/player-config.service');

const video = {
    id: 'video-1',
    title: 'Demo',
    thumbnail: null,
    duration_seconds: 120,
    language: 'hi',
    hls_master_url: 'https://media.test/master.m3u8',
    source_url: 'https://media.test/source.mp4',
    files: [
        { id: 'high', quality: '1080p', url: 'high.m3u8', playlist_url: 'high.m3u8', height: 1080 },
        { id: 'low', quality: '360p', url: 'low.m3u8', playlist_url: 'low.m3u8', height: 360 }
    ],
    subtitles: [{ id: 'sub-1', language: 'hi', label: 'Hindi', vtt_url: 'hi.vtt' }],
    thumbnails: [{ kind: 'thumbnail', url: 'poster.jpg' }, { kind: 'preview', url: 'preview.jpg' }]
};

test('builds adaptive and ordered manual sources with text tracks', () => {
    const config = buildPlayerConfig({ video, history: { position_seconds: 42, completed: false } });
    assert.equal(config.media.poster, 'poster.jpg');
    assert.deepEqual(config.media.sources.map((source) => source.quality), ['auto', '360p', '1080p']);
    assert.equal(config.media.textTracks[0].default, true);
    assert.equal(config.resume.positionSeconds, 42);
    assert.equal(config.controls.quality.automatic, true);
});

test('completed media starts from the beginning and exposes unique shortcut actions', () => {
    const config = buildPlayerConfig({ video, history: { position_seconds: 119, completed: true } });
    assert.equal(config.resume.positionSeconds, 0);
    assert.ok(SHORTCUTS.some((shortcut) => shortcut.action === 'toggle_picture_in_picture'));
    assert.ok(SHORTCUTS.some((shortcut) => shortcut.action === 'set_loop_start'));
});

test('falls back to original source when no renditions exist', () => {
    const config = buildPlayerConfig({
        video: { ...video, hls_master_url: null, files: [], subtitles: [], thumbnails: [] },
        history: null
    });
    assert.deepEqual(config.media.sources, [{ quality: 'source', url: video.source_url }]);
    assert.equal(config.controls.captions, false);
});
