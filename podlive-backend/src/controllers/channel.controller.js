const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const cleanHandle = (value) => String(value || '').trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9._-]/g, '');
const colorPattern = /^#[0-9a-f]{6}$/i;

const channelInclude = {
    owner: { select: { id: true, display_name: true, unique_handle: true, avatar_url: true, is_verified: true, subscriber_count: true } },
    membership_tiers: { where: { is_active: true }, orderBy: { price_amount: 'asc' } }
};

exports.createChannel = async (req, res) => {
    try {
        const existing = await prisma.channel.findUnique({ where: { owner_id: req.user.id } });
        if (existing) return res.status(409).json({ error: 'You already have a channel', channel: existing });
        const owner = await prisma.user.findUnique({ where: { id: req.user.id } });
        const handle = cleanHandle(req.body.handle || owner.unique_handle);
        if (handle.length < 3) return res.status(400).json({ error: 'Channel handle must be at least 3 characters' });
        const channel = await prisma.channel.create({
            data: { owner_id: req.user.id, name: String(req.body.name || owner.display_name).trim(), handle, description: req.body.description || null },
            include: channelInclude
        });
        res.status(201).json({ channel });
    } catch (error) {
        if (error.code === 'P2002') return res.status(409).json({ error: 'Channel handle is already taken' });
        console.error('[Channel] create error:', error);
        res.status(500).json({ error: 'Failed to create channel' });
    }
};

exports.getChannel = async (req, res) => {
    try {
        const channel = await prisma.channel.findFirst({
            where: { OR: [{ id: req.params.handle }, { handle: cleanHandle(req.params.handle) }] },
            include: channelInclude
        });
        if (!channel) return res.status(404).json({ error: 'Channel not found' });
        const [videos, live, courses] = await Promise.all([
            prisma.video.findMany({ where: { owner_id: channel.owner_id, visibility: 'public', processing_status: 'ready' }, orderBy: { upload_date: 'desc' }, take: 24 }),
            prisma.liveSession.findMany({ where: { host_user_id: channel.owner_id, visibility: 'public', status: { in: ['live', 'scheduled'] } }, orderBy: { created_at: 'desc' }, take: 10 }),
            prisma.course.findMany({ where: { instructor_id: channel.owner_id, status: 'published', visibility: 'public' }, orderBy: { created_at: 'desc' }, take: 12 })
        ]);
        res.json({ channel, videos: videos.map(v => ({ ...v, filesize: v.filesize.toString(), views: v.views.toString(), watch_time: v.watch_time.toString() })), live, courses });
    } catch (error) {
        console.error('[Channel] get error:', error);
        res.status(500).json({ error: 'Failed to fetch channel' });
    }
};

exports.updateChannel = async (req, res) => {
    try {
        const channel = await prisma.channel.findUnique({ where: { owner_id: req.user.id } });
        if (!channel) return res.status(404).json({ error: 'Create your channel first' });
        const allowed = ['name', 'description', 'avatar_url', 'banner_url', 'trailer_video_id', 'layout', 'social_links', 'membership_enabled'];
        const data = Object.fromEntries(allowed.filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
        for (const key of ['primary_color', 'accent_color']) {
            if (req.body[key] !== undefined) {
                if (!colorPattern.test(req.body[key])) return res.status(400).json({ error: `${key} must be a 6-digit hex color` });
                data[key] = req.body[key];
            }
        }
        if (req.body.handle !== undefined) data.handle = cleanHandle(req.body.handle);
        const updated = await prisma.channel.update({ where: { id: channel.id }, data, include: channelInclude });
        res.json({ message: 'Channel customized', channel: updated });
    } catch (error) {
        if (error.code === 'P2002') return res.status(409).json({ error: 'Channel handle is already taken' });
        console.error('[Channel] update error:', error);
        res.status(500).json({ error: 'Failed to customize channel' });
    }
};

exports.createTier = async (req, res) => {
    try {
        const channel = await prisma.channel.findUnique({ where: { owner_id: req.user.id } });
        if (!channel) return res.status(404).json({ error: 'Channel not found' });
        const amount = Number(req.body.price_amount);
        if (!req.body.name || !Number.isInteger(amount) || amount < 0) return res.status(400).json({ error: 'Tier name and price_amount in smallest currency unit are required' });
        const tier = await prisma.membershipTier.create({ data: { channel_id: channel.id, name: String(req.body.name).trim(), description: req.body.description || null, price_amount: amount, currency: String(req.body.currency || 'INR').toUpperCase(), billing_period: req.body.billing_period || 'monthly', benefits: req.body.benefits || [], badge_url: req.body.badge_url || null } });
        res.status(201).json({ tier });
    } catch (error) {
        console.error('[Channel] tier create error:', error);
        res.status(500).json({ error: 'Failed to create membership tier' });
    }
};

exports.updateTier = async (req, res) => {
    try {
        const tier = await prisma.membershipTier.findUnique({ where: { id: req.params.tierId }, include: { channel: true } });
        if (!tier || tier.channel.owner_id !== req.user.id) return res.status(404).json({ error: 'Membership tier not found' });
        const allowed = ['name', 'description', 'price_amount', 'currency', 'billing_period', 'benefits', 'badge_url', 'is_active'];
        const data = Object.fromEntries(allowed.filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
        const updated = await prisma.membershipTier.update({ where: { id: tier.id }, data });
        res.json({ tier: updated });
    } catch (error) {
        console.error('[Channel] tier update error:', error);
        res.status(500).json({ error: 'Failed to update membership tier' });
    }
};

exports.joinMembership = async (req, res) => {
    try {
        const tier = await prisma.membershipTier.findUnique({ where: { id: req.params.tierId }, include: { channel: true } });
        if (!tier || !tier.is_active || !tier.channel.membership_enabled) return res.status(404).json({ error: 'Membership is not available' });
        if (tier.channel.owner_id === req.user.id) return res.status(400).json({ error: 'Channel owner cannot join their own membership' });
        const membership = await prisma.channelMembership.upsert({
            where: { channel_id_member_id: { channel_id: tier.channel_id, member_id: req.user.id } },
            create: { channel_id: tier.channel_id, tier_id: tier.id, member_id: req.user.id, status: 'pending' },
            update: { tier_id: tier.id, status: 'pending', ended_at: null }
        });
        res.status(201).json({ message: 'Membership created; activate it after payment confirmation', membership });
    } catch (error) {
        console.error('[Channel] membership error:', error);
        res.status(500).json({ error: 'Failed to create membership' });
    }
};

exports.listMembers = async (req, res) => {
    try {
        const channel = await prisma.channel.findUnique({ where: { owner_id: req.user.id } });
        if (!channel) return res.status(404).json({ error: 'Channel not found' });
        const memberships = await prisma.channelMembership.findMany({ where: { channel_id: channel.id }, include: { tier: true, member: { select: { id: true, display_name: true, unique_handle: true, avatar_url: true } } }, orderBy: { started_at: 'desc' } });
        res.json({ memberships });
    } catch (error) {
        console.error('[Channel] members error:', error);
        res.status(500).json({ error: 'Failed to fetch members' });
    }
};
