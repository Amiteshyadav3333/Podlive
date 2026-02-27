const express = require('express');
const router = express.Router();
const stageController = require('../controllers/stage.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.post('/invite', authMiddleware, stageController.inviteUser);
router.post('/invite/:id/accept', authMiddleware, stageController.acceptInvite);
router.post('/invite/:id/reject', authMiddleware, stageController.rejectInvite);
router.delete('/guest/:sessionId/:userId', authMiddleware, stageController.removeGuest);
router.get('/:sessionId/guests', authMiddleware, stageController.getGuests);

module.exports = router;
