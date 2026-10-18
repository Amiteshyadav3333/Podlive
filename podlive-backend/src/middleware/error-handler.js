const multer = require('multer');

function errorHandler(err, req, res, next) {
  console.error(err.stack);

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const configuredLimit = Number(process.env.MAX_UPLOAD_SIZE_BYTES);
      const maxUploadSizeBytes = Number.isFinite(configuredLimit) && configuredLimit > 0
        ? configuredLimit
        : 5 * 1024 * 1024 * 1024;
      return res.status(413).json({ error: 'File size exceeds the configured upload limit.', maxUploadSizeBytes });
    }
    return res.status(400).json({ error: 'Upload could not be processed.' });
  }

  const payload = { error: 'Internal Server Error' };
  if (process.env.NODE_ENV === 'development') {
    payload.message = err.message;
    payload.stack = err.stack;
  }
  return res.status(500).json(payload);
}

module.exports = errorHandler;
