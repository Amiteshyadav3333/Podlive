const createViewerCountUpdater = ({
    prisma,
    io,
    getViewerCount,
    delayMs = 1500,
    setTimer = setTimeout
}) => {
    const timers = new Map();

    return (sessionId) => {
        if (timers.has(sessionId)) return;

        const timer = setTimer(async () => {
            timers.delete(sessionId);
            try {
                const count = await getViewerCount(sessionId);
                const session = await prisma.liveSession.findUnique({
                    where: { id: sessionId },
                    select: { id: true, host_user_id: true, viewer_count_peak: true }
                });
                if (!session) return;
                const newPeak = Math.max(session.viewer_count_peak || 0, count);
                await prisma.liveSession.update({
                    where: { id: sessionId },
                    data: { viewer_count: count, viewer_count_peak: newPeak }
                });

                // Viewer counts are only useful to the creator. Broadcasting this event
                // to every viewer makes join/leave bursts quadratic in room size.
                io.to(session.host_user_id).emit('viewer_count_update', {
                    sessionId,
                    viewerCount: count,
                    viewerCountPeak: newPeak
                });
            } catch (err) {
                console.error('[Socket] Viewer count update error:', err.message);
            }
        }, delayMs);
        timer.unref?.();
        timers.set(sessionId, timer);
    };
};

module.exports = createViewerCountUpdater;
