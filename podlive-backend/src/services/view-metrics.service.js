const calculateViewProgress = ({ previousWatchTime = 0, elapsedSeconds = 0, duration = 0, wasQualified = false }) => {
    const safeDuration = Math.max(Number(duration || 0), 0);
    const previous = Math.max(Number(previousWatchTime || 0), 0);
    const watchDelta = Math.min(Math.max(Number(elapsedSeconds || 0), 0), 30);
    const nextWatchTime = Math.min(previous + watchDelta, safeDuration || 12 * 60 * 60);
    const normalizedCompletion = Math.min(safeDuration ? nextWatchTime / safeDuration : 0, 1);
    const thresholdSeconds = safeDuration ? Math.min(30, Math.max(3, safeDuration * 0.3)) : 30;
    const qualified = Boolean(wasQualified || nextWatchTime >= thresholdSeconds || normalizedCompletion >= 0.8);

    return {
        nextWatchTime,
        watchDelta: Math.max(nextWatchTime - previous, 0),
        completionRate: normalizedCompletion,
        thresholdSeconds,
        qualified,
        becameQualified: qualified && !wasQualified
    };
};

module.exports = { calculateViewProgress };
