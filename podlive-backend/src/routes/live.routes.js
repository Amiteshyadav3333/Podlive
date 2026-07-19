const express = require('express');
const router = express.Router();
const liveController = require('../controllers/live.controller');
const authMiddleware = require('../middleware/auth.middleware');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
        const ext = path.extname(file.originalname);
        cb(null, 'recording-' + uniqueSuffix + ext);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// Static routes MUST come before /:id to avoid param matching
router.get('/active', liveController.getActiveLives);
router.get('/scheduled', liveController.getScheduledLives);
router.get('/vods', liveController.getPublicVODs);
router.post('/create', authMiddleware, liveController.createLiveSession);

// Dynamic /:id routes
router.post('/:id/start', authMiddleware, liveController.startLiveSession);
router.post('/:id/hls/start', authMiddleware, liveController.startHlsEgress);
router.post('/:id/ingress', authMiddleware, liveController.createIngress);
router.get('/:id/obs-config', authMiddleware, liveController.getObsConfig);
router.patch('/:id/settings', authMiddleware, liveController.updateLiveSettings);
router.post('/:id/end', authMiddleware, liveController.endLiveSession);
router.get('/:id/token', authMiddleware.optionalAuth, liveController.getViewerToken);
router.get('/:id/upgrade', authMiddleware, liveController.upgradeViewerToken);
router.get('/:id/guest-token', liveController.getGuestToken);
router.get('/:id/stats', liveController.getSessionStats);
router.get('/:id/recording', liveController.getRecordingDetails);
router.get('/:id/participants', authMiddleware, liveController.getLiveParticipants);
router.post('/:id/comment', authMiddleware, liveController.addComment);
router.patch('/:id/chat/:messageId/moderate', authMiddleware, liveController.moderateMessage);
router.post('/:id/moderation/remove-participant', authMiddleware, liveController.removeLiveParticipant);
router.patch('/:id/moderation/participant-permissions', authMiddleware, liveController.updateParticipantPermissions);
router.post('/:id/like', authMiddleware, liveController.toggleLike);
router.get('/:id/like-status', authMiddleware, liveController.getLikeStatus);
router.post('/:id/view', liveController.incrementViewCount);
router.post('/:id/viewer-heartbeat', liveController.viewerHeartbeat);
router.delete('/:id', authMiddleware, liveController.deleteRecording);

module.exports = router;
