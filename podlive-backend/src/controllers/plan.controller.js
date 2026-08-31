const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { resolveEntitlements } = require('../services/platform-subscription.service');

const PLANS = {
    plus: { code: 'plus', name: 'PodLive Plus', amountPaise: 29900, durationDays: 30, benefits: ['Ad-free videos', 'Higher quality playback', 'Personalised video feed', 'More live podcasts'] },
    max: { code: 'max', name: 'PodLive Max', amountPaise: 59900, durationDays: 30, benefits: ['Unlimited ad-free viewing', 'Highest available quality', 'Personalised video feed', 'Unlimited podcast creation'] }
};

const publicPlans = () => Object.values(PLANS).map(({ durationDays, ...plan }) => ({ ...plan, durationDays }));

exports.listPlans = (_req, res) => res.json({ plans: publicPlans() });

exports.getStatus = async (req, res) => {
    const [subscription, latestOrder] = await Promise.all([
        prisma.platformSubscription.findFirst({
            where: { user_id: req.user.id, status: 'active', expires_at: { gt: new Date() } },
            orderBy: { expires_at: 'desc' }
        }),
        prisma.platformSubscription.findFirst({ where: { user_id: req.user.id }, orderBy: { created_at: 'desc' } })
    ]);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ subscription, latestOrder, entitlements: resolveEntitlements(subscription) });
};

exports.createCheckout = async (req, res) => {
    try {
        const plan = PLANS[String(req.body.planCode || '')];
        if (!plan) return res.status(400).json({ error: 'Invalid subscription plan' });
        const order = await prisma.platformSubscription.create({
            data: { user_id: req.user.id, plan_code: plan.code, amount_paise: plan.amountPaise }
        });
        const upiId = process.env.PLATFORM_UPI_ID || 'yadavamitesh569@oksbi';
        const params = new URLSearchParams({ pa: upiId, pn: 'PodLive', am: (plan.amountPaise / 100).toFixed(2), cu: 'INR', tn: `PodLive ${plan.name} ${order.id}` });
        res.status(201).json({ orderId: order.id, status: order.status, upiUri: `upi://pay?${params.toString()}`, amountRupees: plan.amountPaise / 100, payee: upiId, entitlementsAfterVerification: resolveEntitlements({ ...order, status: 'active', expires_at: new Date(Date.now() + plan.durationDays * 86400000) }) });
    } catch (error) {
        console.error('Create platform checkout error:', error);
        res.status(500).json({ error: 'Unable to create checkout' });
    }
};

exports.submitReference = async (req, res) => {
    const reference = String(req.body.upiReference || '').trim();
    if (!/^[A-Za-z0-9-]{6,64}$/.test(reference)) return res.status(400).json({ error: 'Enter a valid UPI transaction reference' });
    const result = await prisma.platformSubscription.updateMany({
        where: { id: req.params.id, user_id: req.user.id, status: 'pending' },
        data: { upi_reference: reference, status: 'verification_pending', payment_submitted_at: new Date() }
    });
    if (!result.count) return res.status(404).json({ error: 'Pending order not found' });
    res.json({ message: 'Payment reference submitted for verification', status: 'verification_pending' });
};

module.exports.PLANS = PLANS;
