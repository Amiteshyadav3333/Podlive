const test = require('node:test');
const assert = require('node:assert/strict');
const multer = require('multer');
const { getAllowedOrigins, isOriginAllowed } = require('../src/config/cors-policy');
const errorHandler = require('../src/middleware/error-handler');

function invokeErrorHandler(error, environment) {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = environment;
  const response = {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    errorHandler(error, {}, response, () => {});
  } finally {
    console.error = originalError;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
  return response;
}

test('CORS uses configured origins and does not trust arbitrary hosting previews', () => {
  const origins = getAllowedOrigins('https://app.example, https://staging.example', 'https://ignored.example');
  assert.deepEqual(origins, ['https://app.example', 'https://staging.example']);
  assert.equal(isOriginAllowed('https://app.example', origins), true);
  assert.equal(isOriginAllowed('https://user-preview.vercel.app', origins), false);
  assert.equal(isOriginAllowed('https://attacker.onrender.com', origins), false);
  assert.equal(isOriginAllowed(undefined, origins), true);
});

test('default CORS origins retain the production site and local development ports', () => {
  const origins = getAllowedOrigins('', undefined);
  assert.deepEqual(origins, [
    'https://indiapodlive.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001'
  ]);
});

test('production errors do not disclose internal messages or stack traces', () => {
  const response = invokeErrorHandler(new Error('database password leaked'), 'production');
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.payload, { error: 'Internal Server Error' });
});

test('development errors retain diagnostics for local debugging', () => {
  const response = invokeErrorHandler(new Error('development diagnostic'), 'development');
  assert.equal(response.statusCode, 500);
  assert.equal(response.payload.message, 'development diagnostic');
  assert.match(response.payload.stack, /development diagnostic/);
});

test('upload size failures return a stable client error without raw parser text', () => {
  const error = new multer.MulterError('LIMIT_FILE_SIZE');
  const response = invokeErrorHandler(error, 'production');
  assert.equal(response.statusCode, 413);
  assert.equal(response.payload.error, 'File size exceeds the configured upload limit.');
  assert.ok(response.payload.maxUploadSizeBytes > 0);
});
