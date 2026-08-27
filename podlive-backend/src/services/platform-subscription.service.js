const PLAN_ENTITLEMENTS = Object.freeze({
    free: { adFree: false, maxVideoHeight: 720, personalizedFeed: false, podcastLimit: 0 },
    plus: { adFree: true, maxVideoHeight: 1080, personalizedFeed: true, podcastLimit: 10 },
    max: { adFree: true, maxVideoHeight: null, personalizedFeed: true, podcastLimit: null }
});

const resolveEntitlements = (subscription, now = new Date()) => {
    const active = Boolean(subscription
        && subscription.status === 'active'
        && subscription.expires_at
        && new Date(subscription.expires_at) > now);
    const planCode = active && PLAN_ENTITLEMENTS[subscription.plan_code] ? subscription.plan_code : 'free';
    return { planCode, active, ...PLAN_ENTITLEMENTS[planCode] };
};

module.exports = { PLAN_ENTITLEMENTS, resolveEntitlements };
