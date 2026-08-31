const PLAN_ENTITLEMENTS = Object.freeze({
    // This is not a trial. Free accounts can open a live room for five minutes;
    // an approved subscription is required for a full live podcast.
    free: { adFree: false, maxVideoHeight: 720, personalizedFeed: false, podcastLimit: 0, liveMinutes: 5, fullAccess: false },
    plus: { adFree: true, maxVideoHeight: 1080, personalizedFeed: true, podcastLimit: 10, liveMinutes: null, fullAccess: true },
    max: { adFree: true, maxVideoHeight: null, personalizedFeed: true, podcastLimit: null, liveMinutes: null, fullAccess: true }
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
