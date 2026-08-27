const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

const SHORTCUTS = Object.freeze([
    { keys: ['Space', 'K'], action: 'toggle_playback' },
    { keys: ['J'], action: 'seek_backward', value: 10 },
    { keys: ['L'], action: 'seek_forward', value: 10 },
    { keys: ['ArrowLeft'], action: 'seek_backward', value: 5 },
    { keys: ['ArrowRight'], action: 'seek_forward', value: 5 },
    { keys: ['ArrowUp'], action: 'volume_up', value: 5 },
    { keys: ['ArrowDown'], action: 'volume_down', value: 5 },
    { keys: ['M'], action: 'toggle_mute' },
    { keys: ['F'], action: 'toggle_fullscreen' },
    { keys: ['T'], action: 'toggle_theater_mode' },
    { keys: ['I'], action: 'toggle_picture_in_picture' },
    { keys: ['C'], action: 'toggle_captions' },
    { keys: ['Shift', '>'], action: 'increase_speed' },
    { keys: ['Shift', '<'], action: 'decrease_speed' },
    { keys: ['0', 'Home'], action: 'seek_percent', value: 0 },
    { keys: ['1-9'], action: 'seek_percent', value: '10-90' },
    { keys: ['End'], action: 'seek_percent', value: 100 },
    { keys: [','], action: 'previous_frame', when: 'paused' },
    { keys: ['.'], action: 'next_frame', when: 'paused' },
    { keys: ['R'], action: 'toggle_loop' },
    { keys: ['['], action: 'set_loop_start' },
    { keys: [']'], action: 'set_loop_end' },
    { keys: ['S'], action: 'open_settings' },
    { keys: ['?'], action: 'show_shortcuts' },
    { keys: ['Escape'], action: 'close_overlay_or_fullscreen' }
]);

const buildPlayerConfig = ({ video, history = null }) => {
    const files = [...(video.files || [])].sort((a, b) => (a.height || 0) - (b.height || 0));
    const adaptiveSource = video.hls_master_url ? {
        type: 'application/vnd.apple.mpegurl',
        url: video.hls_master_url,
        quality: 'auto'
    } : null;

    return {
        version: 1,
        media: {
            id: video.id,
            title: video.title,
            poster: video.thumbnail || video.thumbnails?.find((item) => item.kind === 'thumbnail')?.url || null,
            durationSeconds: video.duration_seconds,
            sources: [
                ...(adaptiveSource ? [adaptiveSource] : []),
                ...files.map((file) => ({
                    id: file.id,
                    quality: file.quality,
                    url: file.playlist_url || file.url,
                    width: file.width,
                    height: file.height,
                    bitrate: file.bitrate,
                    codec: file.codec,
                    container: file.container
                })),
                ...(!adaptiveSource && !files.length && video.source_url ? [{ quality: 'source', url: video.source_url }] : [])
            ],
            textTracks: (video.subtitles || []).map((track, index) => ({
                id: track.id,
                kind: 'subtitles',
                language: track.language,
                label: track.label,
                url: track.vtt_url,
                default: index === 0 && track.language === video.language
            })),
            previews: (video.thumbnails || [])
                .filter((item) => ['preview', 'gif', 'waveform'].includes(item.kind))
                .map((item) => ({ kind: item.kind, url: item.url, width: item.width, height: item.height }))
        },
        resume: {
            positionSeconds: history?.completed ? 0 : (history?.position_seconds || 0),
            completed: Boolean(history?.completed)
        },
        controls: {
            playbackRates: PLAYBACK_RATES,
            seekSeconds: { short: 5, standard: 10, long: 30 },
            quality: { automatic: Boolean(adaptiveSource), manual: files.length > 0 },
            captions: (video.subtitles || []).length > 0,
            fullscreen: true,
            theaterMode: true,
            pictureInPicture: true,
            miniPlayer: true,
            casting: true,
            airplay: true,
            loop: true,
            segmentLoop: true,
            frameStep: true,
            sleepTimer: true,
            controlLock: true,
            aspectRatio: true,
            zoomAndPan: true,
            mediaSession: true
        },
        gestures: {
            doubleTapSeek: { leftSeconds: -10, rightSeconds: 10 },
            doubleTapCenter: 'toggle_playback',
            horizontalSwipe: 'seek',
            verticalSwipeLeft: 'brightness',
            verticalSwipeRight: 'volume',
            pinch: 'zoom',
            longPress: { action: 'temporary_speed', rate: 2 }
        },
        shortcuts: SHORTCUTS
    };
};

module.exports = { buildPlayerConfig, PLAYBACK_RATES, SHORTCUTS };
