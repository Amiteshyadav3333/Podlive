const express = require('express');
const controller = require('../controllers/plan.controller');
const authMiddleware = require('../middleware/auth.middleware');
const router = express.Router();

router.get('/', controller.listPlans);
router.get('/status', authMiddleware, controller.getStatus);
router.post('/checkout', authMiddleware, controller.createCheckout);
router.post('/orders/:id/reference', authMiddleware, controller.submitReference);

module.exports = router;
