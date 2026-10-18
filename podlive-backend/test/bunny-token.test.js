const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { signBunnyDirectoryUrl } = require('../src/services/bunny-token.service');

test('Bunny private media URLs are signed for a directory and expire', () => {
    const before = Math.floor(Date.now() / 1000);
    const signed = signBunnyDirectoryUrl('https://cdn.example.test/video/playlist.m3u8', 'secret', { expiresInSeconds: 900 });
    const match = signed.match(/^https:\/\/cdn\.example\.test\/bcdn_token=(HS256-[^&]+)&token_path=%2Fvideo%2F&expires=(\d+)\/video\/playlist\.m3u8$/);
    assert.ok(match, 'URL should scope the token to the video directory');
    const expires = Number(match[2]);
    assert.ok(expires >= before + 900 && expires <= before + 901);
    const expected = crypto.createHmac('sha256', 'secret')
        .update('/video/')
        .update(String(expires))
        .update(Buffer.alloc(0))
        .update('token_path=/video/')
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    assert.equal(match[1], `HS256-${expected}`);
});

test('private CDN signer refuses to create unsigned URLs', () => {
    assert.throws(() => signBunnyDirectoryUrl('https://cdn.example.test/video.m3u8', ''), /not configured/);
});
