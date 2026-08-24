const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const slugify = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const instructorSelect = { id: true, display_name: true, unique_handle: true, avatar_url: true, bio: true, is_verified: true };
const courseInclude = { instructor: { select: instructorSelect }, sections: { orderBy: { position: 'asc' }, include: { lessons: { orderBy: { position: 'asc' } } } } };
const isOwner = (course, userId) => course && course.instructor_id === userId;

const serializeCourse = (course, unlocked = false) => ({
    ...course,
    sections: course.sections?.map((section) => ({ ...section, lessons: section.lessons.map((lesson) => unlocked || lesson.is_preview ? lesson : { id: lesson.id, section_id: lesson.section_id, title: lesson.title, description: lesson.description, kind: lesson.kind, duration_seconds: lesson.duration_seconds, position: lesson.position, is_preview: false, is_published: lesson.is_published, locked: true }) }))
});

exports.listCourses = async (req, res) => {
    try {
        const where = { status: 'published', visibility: 'public', ...(req.query.category ? { category: req.query.category } : {}), ...(req.query.instructorId ? { instructor_id: req.query.instructorId } : {}) };
        const courses = await prisma.course.findMany({ where, include: { instructor: { select: instructorSelect }, _count: { select: { sections: true, enrollments: true } } }, orderBy: [{ enrollment_count: 'desc' }, { created_at: 'desc' }], take: 50 });
        res.json({ courses });
    } catch (error) { res.status(500).json({ error: 'Failed to fetch courses' }); }
};

exports.getCourse = async (req, res) => {
    try {
        const course = await prisma.course.findFirst({ where: { OR: [{ id: req.params.slug }, { slug: req.params.slug }] }, include: courseInclude });
        if (!course) return res.status(404).json({ error: 'Course not found' });
        const userId = req.user?.id;
        const enrollment = userId ? await prisma.courseEnrollment.findUnique({ where: { course_id_user_id: { course_id: course.id, user_id: userId } } }) : null;
        const unlocked = isOwner(course, userId) || enrollment?.status === 'active';
        if (course.status !== 'published' && !isOwner(course, userId)) return res.status(404).json({ error: 'Course not found' });
        res.json({ course: serializeCourse(course, unlocked), enrollment, viewer: { enrolled: Boolean(enrollment?.status === 'active'), isInstructor: isOwner(course, userId) } });
    } catch (error) { console.error('[Courses] detail:', error); res.status(500).json({ error: 'Failed to fetch course' }); }
};

exports.listMine = async (req, res) => {
    try { res.json({ courses: await prisma.course.findMany({ where: { instructor_id: req.user.id }, include: { _count: { select: { sections: true, enrollments: true, orders: true } } }, orderBy: { updated_at: 'desc' } }) }); }
    catch (error) { res.status(500).json({ error: 'Failed to fetch your courses' }); }
};

exports.createCourse = async (req, res) => {
    try {
        if (!req.body.title) return res.status(400).json({ error: 'Course title is required' });
        const base = slugify(req.body.slug || req.body.title) || 'course';
        const slug = `${base}-${crypto.randomBytes(3).toString('hex')}`;
        const course = await prisma.course.create({ data: { instructor_id: req.user.id, title: String(req.body.title).trim(), slug, subtitle: req.body.subtitle || null, category: req.body.category || null, language: req.body.language || 'Hindi', level: req.body.level || 'all_levels', price_amount: Math.max(Number(req.body.price_amount || 0), 0), currency: req.body.currency || 'INR', theme: req.body.theme || { primaryColor: '#7C3AED', style: 'modern' } } });
        res.status(201).json({ course });
    } catch (error) { console.error('[Courses] create:', error); res.status(500).json({ error: 'Failed to create course' }); }
};

exports.updateCourse = async (req, res) => {
    try {
        const course = await prisma.course.findUnique({ where: { id: req.params.id } });
        if (!isOwner(course, req.user.id)) return res.status(404).json({ error: 'Course not found' });
        const fields = ['title', 'subtitle', 'description', 'thumbnail_url', 'trailer_url', 'category', 'level', 'language', 'price_amount', 'compare_price_amount', 'currency', 'status', 'visibility', 'outcomes', 'requirements', 'theme', 'certificate_enabled', 'discussion_enabled'];
        const data = Object.fromEntries(fields.filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
        if (data.status && !['draft', 'published', 'archived'].includes(data.status)) return res.status(400).json({ error: 'Invalid course status' });
        const updated = await prisma.course.update({ where: { id: course.id }, data, include: courseInclude });
        res.json({ course: updated });
    } catch (error) { res.status(500).json({ error: 'Failed to update course' }); }
};

exports.addSection = async (req, res) => {
    try {
        const course = await prisma.course.findUnique({ where: { id: req.params.id }, include: { sections: true } });
        if (!isOwner(course, req.user.id)) return res.status(404).json({ error: 'Course not found' });
        if (!req.body.title) return res.status(400).json({ error: 'Section title is required' });
        const section = await prisma.courseSection.create({ data: { course_id: course.id, title: req.body.title, description: req.body.description || null, position: req.body.position ?? course.sections.length } });
        res.status(201).json({ section });
    } catch (error) { res.status(500).json({ error: 'Failed to add section' }); }
};

exports.addLesson = async (req, res) => {
    try {
        const section = await prisma.courseSection.findUnique({ where: { id: req.params.sectionId }, include: { course: true, lessons: true } });
        if (!section || section.course.instructor_id !== req.user.id) return res.status(404).json({ error: 'Section not found' });
        if (!req.body.title) return res.status(400).json({ error: 'Lesson title is required' });
        const lesson = await prisma.courseLesson.create({ data: { section_id: section.id, title: req.body.title, description: req.body.description || null, kind: req.body.kind || 'video', video_url: req.body.video_url || null, live_session_id: req.body.live_session_id || null, resource_url: req.body.resource_url || null, duration_seconds: req.body.duration_seconds || null, position: req.body.position ?? section.lessons.length, is_preview: Boolean(req.body.is_preview), is_published: req.body.is_published !== false, content: req.body.content || null } });
        res.status(201).json({ lesson });
    } catch (error) { res.status(500).json({ error: 'Failed to add lesson' }); }
};

exports.updateLesson = async (req, res) => {
    try {
        const lesson = await prisma.courseLesson.findUnique({ where: { id: req.params.lessonId }, include: { section: { include: { course: true } } } });
        if (!lesson || lesson.section.course.instructor_id !== req.user.id) return res.status(404).json({ error: 'Lesson not found' });
        const fields = ['title', 'description', 'kind', 'video_url', 'live_session_id', 'resource_url', 'duration_seconds', 'position', 'is_preview', 'is_published', 'content'];
        const data = Object.fromEntries(fields.filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
        res.json({ lesson: await prisma.courseLesson.update({ where: { id: lesson.id }, data }) });
    } catch (error) { res.status(500).json({ error: 'Failed to update lesson' }); }
};

exports.createOrder = async (req, res) => {
    try {
        const course = await prisma.course.findUnique({ where: { id: req.params.id } });
        if (!course || course.status !== 'published') return res.status(404).json({ error: 'Course not available' });
        if (course.instructor_id === req.user.id) return res.status(400).json({ error: 'Instructor already has access' });
        if (course.price_amount === 0) {
            const existing = await prisma.courseEnrollment.findUnique({ where: { course_id_user_id: { course_id: course.id, user_id: req.user.id } } });
            const enrollment = await prisma.courseEnrollment.upsert({ where: { course_id_user_id: { course_id: course.id, user_id: req.user.id } }, create: { course_id: course.id, user_id: req.user.id }, update: { status: 'active' } });
            if (!existing) await prisma.course.update({ where: { id: course.id }, data: { enrollment_count: { increment: 1 } } });
            return res.status(201).json({ free: true, enrollment });
        }
        const order = await prisma.courseOrder.create({ data: { course_id: course.id, buyer_id: req.user.id, amount: course.price_amount, currency: course.currency, payment_provider: process.env.PAYMENT_PROVIDER || 'razorpay' } });
        res.status(201).json({ order, checkoutRequired: true, message: 'Create the provider checkout using this order ID' });
    } catch (error) { res.status(500).json({ error: 'Failed to start checkout' }); }
};

exports.confirmPayment = async (req, res) => {
    try {
        if (!process.env.PAYMENT_WEBHOOK_SECRET || req.headers['x-podlive-webhook-secret'] !== process.env.PAYMENT_WEBHOOK_SECRET) return res.status(401).json({ error: 'Invalid webhook signature' });
        const order = await prisma.courseOrder.findUnique({ where: { id: req.params.orderId } });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.status === 'paid') return res.json({ message: 'Payment was already confirmed' });
        await prisma.$transaction([
            prisma.courseOrder.update({ where: { id: order.id }, data: { status: 'paid', provider_payment_id: req.body.paymentId || null, paid_at: new Date() } }),
            prisma.courseEnrollment.upsert({ where: { course_id_user_id: { course_id: order.course_id, user_id: order.buyer_id } }, create: { course_id: order.course_id, user_id: order.buyer_id }, update: { status: 'active' } }),
            prisma.course.update({ where: { id: order.course_id }, data: { enrollment_count: { increment: 1 } } })
        ]);
        res.json({ message: 'Payment confirmed and course unlocked' });
    } catch (error) { res.status(500).json({ error: 'Failed to confirm payment' }); }
};

exports.updateProgress = async (req, res) => {
    try {
        const enrollment = await prisma.courseEnrollment.findUnique({ where: { course_id_user_id: { course_id: req.params.id, user_id: req.user.id } } });
        if (!enrollment || enrollment.status !== 'active') return res.status(403).json({ error: 'Course enrollment required' });
        const completed = Array.from(new Set([...enrollment.completed_lessons, req.body.lessonId].filter(Boolean)));
        const total = await prisma.courseLesson.count({ where: { section: { course_id: req.params.id }, is_published: true } });
        const progress = total ? Math.min((completed.length / total) * 100, 100) : 0;
        const updated = await prisma.courseEnrollment.update({ where: { id: enrollment.id }, data: { completed_lessons: completed, progress_percent: progress, ...(progress === 100 ? { completed_at: new Date() } : {}) } });
        res.json({ enrollment: updated });
    } catch (error) { res.status(500).json({ error: 'Failed to update progress' }); }
};
