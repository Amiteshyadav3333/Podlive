const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const authMiddleware = require('../middleware/auth.middleware');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// Configure Multer
const os = require('os');
const fs = require('fs');

// Use /uploads inside project if exists (local), else fallback to /tmp (Render/cloud)
const localUploads = path.join(__dirname, '../../uploads');
const uploadDir = fs.existsSync(path.dirname(localUploads))
    ? (fs.mkdirSync(localUploads, { recursive: true }), localUploads)
    : (fs.mkdirSync(path.join(os.tmpdir(), 'podlive-uploads'), { recursive: true }), path.join(os.tmpdir(), 'podlive-uploads'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 1024 } // 1GB max limit
});

router.post('/',
    authMiddleware,
    upload.fields([{ name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]),
    uploadController.uploadVideo
);

module.exports = router;
