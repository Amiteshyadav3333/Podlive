const FOLLOWER_REQUIREMENT = 1000;
const WATCH_HOUR_REQUIREMENT = 5000;
const WATCH_SECONDS_REQUIREMENT = WATCH_HOUR_REQUIREMENT * 60 * 60;

const clampProgress = (value, target) => Math.min(Math.max(value / target, 0), 1);

const calculateEligibility = ({ followers, watchSeconds, currentStatus = 'ineligible' }) => {
    const safeFollowers = Math.max(Number(followers || 0), 0);
    const safeWatchSeconds = Math.max(Number(watchSeconds || 0), 0);
    const criteriaMet = safeFollowers >= FOLLOWER_REQUIREMENT && safeWatchSeconds >= WATCH_SECONDS_REQUIREMENT;
    const protectedStatus = ['suspended'].includes(currentStatus);
    const status = protectedStatus ? currentStatus : (criteriaMet ? 'active' : 'ineligible');

    return {
        status,
        eligible: criteriaMet,
        requirements: {
            followers: FOLLOWER_REQUIREMENT,
            watchHours: WATCH_HOUR_REQUIREMENT
        },
        progress: {
            followers: safeFollowers,
            followersPercent: Math.floor(clampProgress(safeFollowers, FOLLOWER_REQUIREMENT) * 100),
            watchSeconds: safeWatchSeconds,
            watchHours: Number((safeWatchSeconds / 3600).toFixed(1)),
            watchHoursPercent: Math.floor(clampProgress(safeWatchSeconds, WATCH_SECONDS_REQUIREMENT) * 100)
        }
    };
};

const syncMonetizationAccount = async (prisma, userId) => {
    const [user, videoTotals, existing] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { follower_count: true } }),
        prisma.video.aggregate({
            where: { owner_id: userId, visibility: 'public', processing_status: 'ready' },
            _sum: { watch_time: true }
        }),
        prisma.monetizationAccount.findUnique({ where: { user_id: userId } })
    ]);

    if (!user) return null;
    const watchSeconds = videoTotals._sum.watch_time || BigInt(0);
    const eligibility = calculateEligibility({
        followers: user.follower_count,
        watchSeconds: watchSeconds.toString(),
        currentStatus: existing?.status
    });
    const becameActive = eligibility.status === 'active' && existing?.status !== 'active';

    const account = await prisma.monetizationAccount.upsert({
        where: { user_id: userId },
        create: {
            user_id: userId,
            status: eligibility.status,
            followers_snapshot: eligibility.progress.followers,
            watch_seconds_snapshot: watchSeconds,
            eligible_at: eligibility.eligible ? new Date() : null,
            activated_at: eligibility.status === 'active' ? new Date() : null
        },
        update: {
            status: eligibility.status,
            followers_snapshot: eligibility.progress.followers,
            watch_seconds_snapshot: watchSeconds,
            last_evaluated_at: new Date(),
            ...(becameActive ? { eligible_at: new Date(), activated_at: new Date() } : {})
        }
    });

    return {
        ...eligibility,
        account: {
            status: account.status,
            activatedAt: account.activated_at,
            lastEvaluatedAt: account.last_evaluated_at,
            suspensionReason: account.suspension_reason
        }
    };
};

module.exports = {
    FOLLOWER_REQUIREMENT,
    WATCH_HOUR_REQUIREMENT,
    WATCH_SECONDS_REQUIREMENT,
    calculateEligibility,
    syncMonetizationAccount
};
