const calculateViewProgress = ({ previousWatchTime = 0, submittedWatchTime = 0, duration = 0, completionRate = 0, wasQualified = false }) => {
    const safeDuration = Math.max(Number(duration || 0), 0);
    const cappedWatchTime = Math.round(Math.min(Math.max(Number(submittedWatchTime || 0), 0), safeDuration || 12 * 60 * 60));
    const nextWatchTime = Math.max(Math.max(Number(previousWatchTime || 0), 0), cappedWatchTime);
    const normalizedCompletion = Math.min(Math.max(Number(completionRate || (safeDuration ? nextWatchTime / safeDuration : 0)), 0), 1);
    const thresholdSeconds = safeDuration ? Math.min(30, Math.max(3, safeDuration * 0.3)) : 30;
    const qualified = Boolean(wasQualified || nextWatchTime >= thresholdSeconds || normalizedCompletion >= 0.8);

    return {
        nextWatchTime,
        watchDelta: Math.max(nextWatchTime - Math.max(Number(previousWatchTime || 0), 0), 0),
        completionRate: normalizedCompletion,
        thresholdSeconds,
        qualified,
        becameQualified: qualified && !wasQualified
    };
};

module.exports = { calculateViewProgress };
