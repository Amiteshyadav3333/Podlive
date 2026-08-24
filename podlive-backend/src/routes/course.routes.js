const express = require('express');
const router = express.Router();
const course = require('../controllers/course.controller');
const auth = require('../middleware/auth.middleware');

router.get('/', course.listCourses);
router.get('/mine', auth, course.listMine);
router.post('/', auth, course.createCourse);
router.post('/orders/:orderId/confirm', course.confirmPayment);
router.get('/:slug', auth.optionalAuth, course.getCourse);
router.patch('/:id', auth, course.updateCourse);
router.post('/:id/sections', auth, course.addSection);
router.post('/:id/sections/:sectionId/lessons', auth, course.addLesson);
router.patch('/:id/lessons/:lessonId', auth, course.updateLesson);
router.post('/:id/checkout', auth, course.createOrder);
router.patch('/:id/progress', auth, course.updateProgress);

module.exports = router;
