const express = require('express');
const router = express.Router();
const channel = require('../controllers/channel.controller');
const auth = require('../middleware/auth.middleware');

router.post('/', auth, channel.createChannel);
router.patch('/me', auth, channel.updateChannel);
router.post('/me/tiers', auth, channel.createTier);
router.patch('/me/tiers/:tierId', auth, channel.updateTier);
router.get('/me/members', auth, channel.listMembers);
router.post('/tiers/:tierId/join', auth, channel.joinMembership);
router.get('/:handle', channel.getChannel);

module.exports = router;
