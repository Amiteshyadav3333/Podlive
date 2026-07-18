const express = require('express');
const router = express.Router();
const videoController = require('../controllers/video.controller');
const authMiddleware = require('../middleware/auth.middleware');

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');

const uploadDir = path.join(os.tmpdir(), 'podlive-uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const thumbnailStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `thumb-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    }
});

const thumbnailUpload = multer({
    storage: thumbnailStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) return cb(null, true);
        cb(new Error('Only image files allowed'));
    }
});

const subtitleStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.vtt';
        cb(null, `sub-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    }
});

const subtitleUpload = multer({
    storage: subtitleStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.vtt', '.srt'].includes(ext) || file.mimetype === 'text/vtt' || file.mimetype === 'text/plain' || file.mimetype === 'application/x-subrip') return cb(null, true);
        cb(new Error('Only VTT or SRT files allowed'));
    }
});

router.get('/', videoController.listVideos);
router.get('/history', authMiddleware, videoController.listHistory);
router.get('/playlists', authMiddleware, videoController.listPlaylists);
router.post('/playlists', authMiddleware, videoController.createPlaylist);
router.patch('/playlists/:playlistId', authMiddleware, videoController.updatePlaylist);
router.delete('/playlists/:playlistId', authMiddleware, videoController.deletePlaylist);
router.post('/playlists/:playlistId/videos', authMiddleware, videoController.addVideoToPlaylist);
router.delete('/playlists/:playlistId/videos/:videoId', authMiddleware, videoController.removeVideoFromPlaylist);

router.post('/subscriptions/:creatorId', authMiddleware, videoController.toggleSubscription);
router.get('/subscriptions/:creatorId/status', authMiddleware, videoController.getSubscriptionStatus);

router.get('/:id', authMiddleware, videoController.getVideo);
router.patch('/:id', authMiddleware, videoController.updateVideo);
router.delete('/:id', authMiddleware, videoController.deleteVideo);
router.post('/:id/view', authMiddleware, videoController.recordView);
router.post('/:id/reaction', authMiddleware, videoController.reactToVideo);
router.post('/:id/history', authMiddleware, videoController.updateHistory);
router.post('/:id/report', authMiddleware, videoController.reportVideo);
router.get('/:id/analytics', authMiddleware, videoController.getCreatorAnalytics);

router.post('/:id/thumbnail', authMiddleware, thumbnailUpload.single('thumbnail'), videoController.uploadThumbnail);
router.get('/:id/subtitles', videoController.listSubtitles);
router.post('/:id/subtitles', authMiddleware, subtitleUpload.single('subtitle'), videoController.uploadSubtitle);
router.delete('/:id/subtitles/:subtitleId', authMiddleware, videoController.deleteSubtitle);

router.get('/:id/comments', videoController.listComments);
router.post('/:id/comments', authMiddleware, videoController.createComment);
router.patch('/:id/comments/:commentId', authMiddleware, videoController.updateComment);
router.delete('/:id/comments/:commentId', authMiddleware, videoController.deleteComment);
router.patch('/:id/comments/:commentId/pin', authMiddleware, videoController.pinComment);

module.exports = router;
