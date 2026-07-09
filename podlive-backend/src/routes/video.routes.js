const express = require('express');
const router = express.Router();
const videoController = require('../controllers/video.controller');
const authMiddleware = require('../middleware/auth.middleware');

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

router.get('/:id/comments', videoController.listComments);
router.post('/:id/comments', authMiddleware, videoController.createComment);
router.patch('/:id/comments/:commentId', authMiddleware, videoController.updateComment);
router.delete('/:id/comments/:commentId', authMiddleware, videoController.deleteComment);
router.patch('/:id/comments/:commentId/pin', authMiddleware, videoController.pinComment);

module.exports = router;
