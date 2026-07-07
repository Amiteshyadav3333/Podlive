const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const authMiddleware = require('../middleware/auth.middleware');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');

// Always use /tmp on cloud (Render doesn't have persistent disk)
const uploadDir = path.join(os.tmpdir(), 'podlive-uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
        const ext = path.extname(file.originalname) || (file.mimetype.includes('mp4') ? '.mp4' : '.webm');
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: Number(process.env.MAX_UPLOAD_SIZE_BYTES || 2 * 1024 * 1024 * 1024) },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'video') {
            const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'application/octet-stream'];
            // Accept if mimetype matches OR extension is video
            const ext = path.extname(file.originalname).toLowerCase();
            const validExt = ['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext);
            if (allowed.includes(file.mimetype) || validExt) return cb(null, true);
            return cb(new Error('Only video files are allowed'));
        }
        if (file.fieldname === 'thumbnail') {
            if (file.mimetype.startsWith('image/')) return cb(null, true);
            return cb(new Error('Only image files allowed for thumbnail'));
        }
        cb(null, true);
    }
});

const formatBytes = (bytes) => `${Math.round(bytes / 1024 / 1024)}MB`;

const chunkStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        cb(null, `chunk-${req.params.uploadId || 'init'}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.part`);
    }
});

const chunkUpload = multer({
    storage: chunkStorage,
    limits: { fileSize: Number(process.env.UPLOAD_CHUNK_MAX_BYTES || 32 * 1024 * 1024) }
});

// Multer error handler middleware
const handleMulterError = (err, req, res, next) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            error: `File too large. Max ${formatBytes(Number(process.env.MAX_UPLOAD_SIZE_BYTES || 2 * 1024 * 1024 * 1024))} allowed.`
        });
    }
    if (err) {
        return res.status(400).json({ error: err.message || 'File upload error' });
    }
    next();
};

router.post('/chunk/init', authMiddleware, uploadController.initChunkUpload);
router.get('/chunk/:uploadId', authMiddleware, uploadController.getChunkUploadStatus);
router.post('/chunk/:uploadId',
    authMiddleware,
    (req, res, next) => {
        chunkUpload.single('chunk')(req, res, (err) => {
            if (err) return handleMulterError(err, req, res, next);
            next();
        });
    },
    uploadController.uploadChunk
);
router.post('/chunk/:uploadId/pause', authMiddleware, uploadController.pauseChunkUpload);
router.post('/chunk/:uploadId/cancel', authMiddleware, uploadController.cancelChunkUpload);
router.post('/chunk/:uploadId/complete', authMiddleware, uploadController.completeChunkUpload);

router.post('/',
    authMiddleware,
    (req, res, next) => {
        upload.fields([{ name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }])(req, res, (err) => {
            if (err) return handleMulterError(err, req, res, next);
            next();
        });
    },
    uploadController.uploadVideo
);

module.exports = router;
