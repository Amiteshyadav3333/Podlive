"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize,
    Minimize,
    Heart,
    Share2,
    MoreVertical,
    MessageSquare,
    CheckCircle2,
    Users,
    Clock,
    ArrowLeft,
    Loader2,
    Send,
    Settings,
    Activity,
    Trash2,
    Bookmark,
    ThumbsDown,
    Flag
} from "lucide-react";
import Hls from "hls.js";
import { buildApiUrl } from "@/lib/api";

// Custom HLS Player Component with YouTube-like Video Player Controls
function HlsPlayer({ url, poster, subtitles }: { url: string, poster: string, subtitles: any[] }) {
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const progressBarRef = React.useRef<HTMLDivElement>(null);

    const [qualities, setQualities] = useState<any[]>([]);
    const [currentQuality, setCurrentQuality] = useState<number>(-1); // -1 is Auto
    const [hlsInstance, setHlsInstance] = useState<Hls | null>(null);

    // Player States
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !url) return;

        let hls: Hls;

        if (Hls.isSupported() && url.includes('.m3u8')) {
            hls = new Hls({
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
            });
            hls.loadSource(url);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
                setQualities(data.levels);
            });

            hls.on(Hls.Events.LEVEL_SWITCHED, function (event, data) {
                setCurrentQuality(hls.currentLevel);
            });

            setHlsInstance(hls);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
        } else {
            video.src = url;
            setQualities([{ height: 'Original (MP4)' }]);
        }

        return () => {
            if (hls) {
                hls.destroy();
            }
        };
    }, [url]);

    const handleTogglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    };

    const handleVolumeSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setVolume(val);
        setIsMuted(val === 0);
        if (videoRef.current) {
            videoRef.current.volume = val;
            videoRef.current.muted = val === 0;
        }
    };

    const handleToggleMute = () => {
        const video = videoRef.current;
        if (!video) return;
        const nextMute = !isMuted;
        setIsMuted(nextMute);
        video.muted = nextMute;
        if (!nextMute && volume === 0) {
            setVolume(0.5);
            video.volume = 0.5;
        }
    };

    const formatTime = (secs: number) => {
        if (isNaN(secs)) return "00:00";
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        const h = Math.floor(m / 60);

        const mStr = String(m % 60).padStart(2, "0");
        const sStr = String(s).padStart(2, "0");

        if (h > 0) {
            return `${String(h).padStart(2, "0")}:${mStr}:${sStr}`;
        }
        return `${mStr}:${sStr}`;
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const bar = progressBarRef.current;
        const video = videoRef.current;
        if (!bar || !video || duration === 0) return;

        const rect = bar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const pct = Math.max(0, Math.min(1, clickX / width));
        
        video.currentTime = pct * duration;
        setCurrentTime(pct * duration);
    };

    const handleProgressDrag = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.buttons !== 1) return;
        handleProgressClick(e);
    };

    const handleToggleFullscreen = () => {
        const container = containerRef.current;
        if (!container) return;

        if (!document.fullscreenElement) {
            container.requestFullscreen().then(() => setIsFullscreen(true)).catch(err => {
                console.error("Fullscreen failed:", err);
            });
        } else {
            document.exitFullscreen().then(() => setIsFullscreen(false));
        }
    };

    useEffect(() => {
        const onFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener("fullscreenchange", onFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
    }, []);

    // Auto-hide controls
    useEffect(() => {
        let timer: NodeJS.Timeout;
        const handleMouseMove = () => {
            setShowControls(true);
            clearTimeout(timer);
            if (isPlaying) {
                timer = setTimeout(() => {
                    setShowControls(false);
                    setShowSettings(false);
                }, 3000);
            }
        };

        const container = containerRef.current;
        if (container) {
            container.addEventListener("mousemove", handleMouseMove);
            container.addEventListener("mouseleave", () => {
                if (isPlaying) {
                    setShowControls(false);
                    setShowSettings(false);
                }
            });
        }

        return () => {
            if (container) {
                container.removeEventListener("mousemove", handleMouseMove);
            }
            clearTimeout(timer);
        };
    }, [isPlaying]);

    const handleQualityChange = (levelIndex: number) => {
        if (hlsInstance) {
            hlsInstance.currentLevel = levelIndex;
            setCurrentQuality(levelIndex);
            setShowSettings(false);
        }
    };

    const handleSpeedChange = (rate: number) => {
        const video = videoRef.current;
        if (video) {
            video.playbackRate = rate;
            setPlaybackRate(rate);
            setShowSettings(false);
        }
    };

    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div
            ref={containerRef}
            className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl group/player select-none"
        >
            <video
                ref={videoRef}
                autoPlay
                crossOrigin="anonymous"
                className="w-full h-full object-contain cursor-pointer"
                poster={poster}
                onClick={handleTogglePlay}
                onDoubleClick={handleToggleFullscreen}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
                onDurationChange={() => videoRef.current && setDuration(videoRef.current.duration)}
                onVolumeChange={() => {
                    if (videoRef.current) {
                        setVolume(videoRef.current.volume);
                        setIsMuted(videoRef.current.muted);
                    }
                }}
            >
                {subtitles && subtitles.map((sub: any, idx: number) => (
                    <track
                        key={sub.id}
                        kind="subtitles"
                        srcLang={sub.language}
                        label={sub.label}
                        src={sub.vtt_url}
                        default={idx === 0}
                    />
                ))}
            </video>

            {/* Custom Play/Pause Large Center Icon Overlay */}
            <div
                onClick={handleTogglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 active:opacity-100 hover:bg-black/10 transition-all duration-300 cursor-pointer z-10"
            >
                <div className="w-16 h-16 bg-black/60 rounded-full flex items-center justify-center text-white scale-90 group-active/player:scale-100 transition-transform">
                    {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
                </div>
            </div>

            {/* YouTube-like controls container */}
            <div
                className={`absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-4 flex flex-col gap-3 transition-opacity duration-300 ${
                    showControls ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
            >
                {/* 1. Progress Bar / Red Scrubber */}
                <div
                    ref={progressBarRef}
                    onClick={handleProgressClick}
                    onMouseMove={handleProgressDrag}
                    className="w-full h-1.5 hover:h-2 bg-white/20 rounded-full cursor-pointer relative group/scrubber transition-all"
                >
                    {/* Played progress fill (YouTube Red) */}
                    <div
                        className="absolute top-0 left-0 h-full bg-red-600 rounded-full flex items-center justify-end"
                        style={{ width: `${progressPercent}%` }}
                    >
                        {/* Scrubber Knob */}
                        <div className="w-3.5 h-3.5 bg-red-600 rounded-full scale-0 group-hover/scrubber:scale-100 group-hover/player:scale-100 absolute right-[-7px] top-1/2 -translate-y-1/2 shadow-lg transition-transform duration-100" />
                    </div>
                </div>

                {/* 2. Control bar items */}
                <div className="flex items-center justify-between">
                    {/* Left: Play/Pause, Volume, Time */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleTogglePlay}
                            className="text-white hover:text-red-500 transition-colors cursor-pointer border-none bg-transparent outline-none"
                        >
                            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                        </button>

                        <div className="flex items-center gap-2 group/volume">
                            <button
                                onClick={handleToggleMute}
                                className="text-white hover:text-red-500 transition-colors cursor-pointer border-none bg-transparent outline-none"
                            >
                                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                            </button>
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                value={isMuted ? 0 : volume}
                                onChange={handleVolumeSliderChange}
                                className="w-0 group-hover/volume:w-16 hover:w-16 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-red-600 transition-all duration-300"
                            />
                        </div>

                        <div className="text-xs font-mono text-zinc-300">
                            <span>{formatTime(currentTime)}</span>
                            <span className="mx-1.5 text-zinc-500">/</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Right: Settings (Speed / Quality), Fullscreen */}
                    <div className="flex items-center gap-4 relative">
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`text-white hover:text-red-500 transition-colors cursor-pointer border-none bg-transparent outline-none ${
                                showSettings ? "text-red-500 rotate-45" : ""
                            } transition-transform duration-300`}
                        >
                            <Settings className="w-5 h-5" />
                        </button>

                        <button
                            onClick={handleToggleFullscreen}
                            className="text-white hover:text-red-500 transition-colors cursor-pointer border-none bg-transparent outline-none"
                        >
                            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                        </button>

                        {/* Custom Quality / Speed Settings menu overlay */}
                        {showSettings && (
                            <div className="absolute bottom-10 right-0 bg-zinc-950/95 border border-white/10 rounded-xl overflow-hidden w-52 shadow-2xl z-30 backdrop-blur-md animate-fade-in text-white">
                                <div className="px-3 py-2 border-b border-white/10 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                    Quality
                                </div>
                                <div className="max-h-36 overflow-y-auto">
                                    <button
                                        onClick={() => handleQualityChange(-1)}
                                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer border-none bg-transparent outline-none ${
                                            currentQuality === -1 ? "text-red-500 font-bold bg-red-500/10" : "text-zinc-200"
                                        }`}
                                    >
                                        Auto
                                        {currentQuality === -1 && <CheckCircle2 className="w-3.5 h-3.5 text-red-500" />}
                                    </button>
                                    {qualities.length === 1 && qualities[0].height === "Original (MP4)" ? (
                                        <button className="w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-white/5 transition-colors border-t border-white/5 text-red-500 font-bold bg-red-500/10 cursor-pointer border-none bg-transparent outline-none">
                                            Original (MP4)
                                            <CheckCircle2 className="w-3.5 h-3.5 text-red-500" />
                                        </button>
                                    ) : (
                                        [...qualities].reverse().map((level, i) => {
                                            const actualIndex = qualities.length - 1 - i;
                                            const isActive = currentQuality === actualIndex;
                                            return (
                                                <button
                                                    key={actualIndex}
                                                    onClick={() => handleQualityChange(actualIndex)}
                                                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-white/5 transition-colors border-t border-white/5 cursor-pointer border-none bg-transparent outline-none ${
                                                        isActive ? "text-red-500 font-bold bg-red-500/10" : "text-zinc-200"
                                                    }`}
                                                >
                                                    {level.height}p
                                                    {isActive && <CheckCircle2 className="w-3.5 h-3.5 text-red-500" />}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>

                                <div className="px-3 py-2 border-t border-b border-white/10 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                    Speed
                                </div>
                                <div className="flex flex-col">
                                    {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
                                        <button
                                            key={rate}
                                            onClick={() => handleSpeedChange(rate)}
                                            className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer border-none bg-transparent outline-none ${
                                                playbackRate === rate ? "text-red-500 font-bold bg-red-500/10" : "text-zinc-200"
                                            }`}
                                        >
                                            {rate === 1 ? "Normal" : `${rate}x`}
                                            {playbackRate === rate && <CheckCircle2 className="w-3.5 h-3.5 text-red-500" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function WatchPage() {
    const router = useRouter();
    const params = useParams();
    const [recording, setRecording] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isLiked, setIsLiked] = useState(false);
    const [isDisliked, setIsDisliked] = useState(false);
    const [isFollowing, setIsFollowing] = useState(false);
    const [newComment, setNewComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Playlist & Report & Menu states
    const [isBookmarked, setIsBookmarked] = useState(false);
    const [showPlaylistModal, setShowPlaylistModal] = useState(false);
    const [playlists, setPlaylists] = useState<any[]>([]);
    const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportReason, setReportReason] = useState("");
    const [reportDetails, setReportDetails] = useState("");
    const [showMenu, setShowMenu] = useState(false);

    // Suggested videos states
    const [recommendedVideos, setRecommendedVideos] = useState<any[]>([]);
    const [recommendedLoading, setRecommendedLoading] = useState(true);
    const [recommendedFilter, setRecommendedFilter] = useState<'all' | 'creator' | 'related'>('all');

    useEffect(() => {
        if (typeof window !== "undefined") {
            const u = localStorage.getItem("user");
            if (u) {
                try {
                    setCurrentUser(JSON.parse(u));
                } catch (e) {
                    console.error("Failed to parse user data", e);
                }
            }
        }
    }, []);

    useEffect(() => {
        const fetchRecording = async () => {
            try {
                const res = await fetch(buildApiUrl(`/api/live/${params.id}/recording`));
                const data = await res.json();
                if (res.ok) {
                    setRecording(data);
                }
            } catch (err) {
                console.error("Failed to fetch recording:", err);
            } finally {
                setLoading(false);
            }
        };

        const checkLikeStatus = async () => {
            try {
                const token = localStorage.getItem("accessToken");
                if (!token) return;
                const res = await fetch(buildApiUrl(`/api/live/${params.id}/like-status`), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (res.ok) {
                    setIsLiked(data.liked);
                    setIsDisliked(data.disliked);
                }
            } catch (err) {
                console.error("Failed to fetch like status", err);
            }
        };

        if (params.id) {
            fetchRecording();
            checkLikeStatus();
        }
    }, [params.id]);

    useEffect(() => {
        const checkFollowStatus = async () => {
            try {
                const token = localStorage.getItem("accessToken");
                if (!token || !recording?.host?.id) return;
                const res = await fetch(buildApiUrl(`/api/user/follow-status/${recording.host.id}`), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (res.ok) {
                    setIsFollowing(data.following);
                }
            } catch (err) {
                console.error("Failed to fetch follow status", err);
            }
        };

        const checkBookmarkStatus = async () => {
            try {
                const token = localStorage.getItem("accessToken");
                if (!token || !recording?.video?.id) return;
                const res = await fetch(buildApiUrl("/api/videos/playlists"), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (res.ok && Array.isArray(data.playlists)) {
                    const watchLater = data.playlists.find((p: any) => p.kind === 'watch_later');
                    if (watchLater) {
                        const hasVideo = watchLater.videos?.some((v: any) => v.video?.id === recording.video.id);
                        setIsBookmarked(!!hasVideo);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch bookmark status", err);
            }
        };

        if (recording && recording.host) {
            checkFollowStatus();
            checkBookmarkStatus();
        }
    }, [recording]);

    useEffect(() => {
        const fetchRecommendations = async () => {
            if (!recording) return;
            setRecommendedLoading(true);
            try {
                const res = await fetch(buildApiUrl("/api/live/vods?limit=30"));
                const data = await res.json();
                if (res.ok) {
                    const filtered = data.filter((vod: any) => vod.id !== params.id);
                    setRecommendedVideos(filtered);
                }
            } catch (err) {
                console.error("Failed to fetch recommended videos:", err);
            } finally {
                setRecommendedLoading(false);
            }
        };

        if (recording) {
            fetchRecommendations();
        }
    }, [recording, params.id]);

    const displayedVideos = recommendedVideos.filter((vod) => {
        if (recommendedFilter === 'creator') return vod.host?.id === recording.host?.id;
        if (recommendedFilter === 'related') return vod.category === recording.category;
        return true;
    });

    const handleFollowToggle = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const token = localStorage.getItem("accessToken");
            if (!token) {
                alert("Please login to follow creators");
                return;
            }

            const res = await fetch(buildApiUrl("/api/user/follow"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ creatorId: recording.host.id })
            });
            const data = await res.json();
            if (res.ok) {
                setIsFollowing(data.following);
                setRecording((prev: any) => ({
                    ...prev,
                    host: {
                        ...prev.host,
                        follower_count: data.following ? prev.host.follower_count + 1 : prev.host.follower_count - 1
                    }
                }));
            }
        } catch (error) {
            console.error("Error toggling follow:", error);
        }
    };

    const handleReactionToggle = async (type: 'like' | 'dislike') => {
        try {
            const token = localStorage.getItem("accessToken");
            if (!token) {
                alert(`Please log in to ${type} videos.`);
                return;
            }

            const res = await fetch(buildApiUrl(`/api/live/${params.id}/like`), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ type })
            });

            const data = await res.json();
            if (res.ok) {
                setIsLiked(data.liked);
                setIsDisliked(data.disliked);
                setRecording((prev: any) => ({
                    ...prev,
                    like_count: data.like_count,
                    dislike_count: data.dislike_count
                }));
            }
        } catch (error) {
            console.error(`Error toggling ${type}:`, error);
        }
    };

    const handleBookmarkToggle = async () => {
        try {
            const token = localStorage.getItem("accessToken");
            if (!token) {
                alert("Please log in to bookmark videos.");
                return;
            }
            if (!recording?.video?.id) {
                alert("This recording is still processing and cannot be bookmarked yet.");
                return;
            }

            const playlistsRes = await fetch(buildApiUrl("/api/videos/playlists"), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const playlistsData = await playlistsRes.json();
            if (!playlistsRes.ok) throw new Error(playlistsData.error || "Failed to fetch playlists");

            let watchLater = playlistsData.playlists?.find((p: any) => p.kind === 'watch_later');

            if (!watchLater) {
                const createRes = await fetch(buildApiUrl("/api/videos/playlists"), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({ title: "Watch Later", kind: "watch_later" })
                });
                const createData = await createRes.json();
                if (!createRes.ok) throw new Error(createData.error || "Failed to create Watch Later playlist");
                watchLater = createData.playlist;
            }

            const videoId = recording.video.id;
            if (isBookmarked) {
                const removeRes = await fetch(buildApiUrl(`/api/videos/playlists/${watchLater.id}/videos/${videoId}`), {
                    method: "DELETE",
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (removeRes.ok) {
                    setIsBookmarked(false);
                }
            } else {
                const addRes = await fetch(buildApiUrl(`/api/videos/playlists/${watchLater.id}/videos`), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({ videoId })
                });
                if (addRes.ok) {
                    setIsBookmarked(true);
                }
            }
        } catch (error: any) {
            console.error("Bookmark toggle failed:", error);
            alert(error.message || "Failed to toggle bookmark");
        }
    };

    const handleAddToPlaylistClick = async () => {
        try {
            const token = localStorage.getItem("accessToken");
            if (!token) {
                alert("Please log in to manage playlists.");
                return;
            }
            if (!recording?.video?.id) {
                alert("This recording is still processing and cannot be added to playlists yet.");
                return;
            }

            const res = await fetch(buildApiUrl("/api/videos/playlists"), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setPlaylists(data.playlists || []);
                setShowPlaylistModal(true);
            }
        } catch (err) {
            console.error("Failed to fetch playlists:", err);
        }
    };

    const handleTogglePlaylistVideo = async (playlistId: string, isAlreadyIn: boolean) => {
        try {
            const token = localStorage.getItem("accessToken");
            const videoId = recording.video.id;

            if (isAlreadyIn) {
                const res = await fetch(buildApiUrl(`/api/videos/playlists/${playlistId}/videos/${videoId}`), {
                    method: "DELETE",
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    setPlaylists(prev => prev.map(p => p.id === playlistId ? {
                        ...p,
                        videos: p.videos?.filter((v: any) => v.video?.id !== videoId)
                    } : p));
                }
            } else {
                const res = await fetch(buildApiUrl(`/api/videos/playlists/${playlistId}/videos`), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({ videoId })
                });
                if (res.ok) {
                    setPlaylists(prev => prev.map(p => p.id === playlistId ? {
                        ...p,
                        videos: [...(p.videos || []), { video: { id: videoId } }]
                    } : p));
                }
            }
        } catch (err) {
            console.error("Playlist toggle failed:", err);
        }
    };

    const handleCreatePlaylist = async () => {
        if (!newPlaylistTitle.trim()) return;
        try {
            const token = localStorage.getItem("accessToken");
            const res = await fetch(buildApiUrl("/api/videos/playlists"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ title: newPlaylistTitle.trim() })
            });
            const data = await res.json();
            if (res.ok) {
                setPlaylists(prev => [data.playlist, ...prev]);
                setNewPlaylistTitle("");
            }
        } catch (err) {
            console.error("Create playlist failed:", err);
        }
    };

    const handleReportVideo = async () => {
        if (!reportReason.trim()) {
            alert("Please select or enter a reason for reporting.");
            return;
        }
        try {
            const token = localStorage.getItem("accessToken");
            if (!token) {
                alert("Please log in to report videos.");
                return;
            }
            if (!recording?.video?.id) {
                alert("Cannot report this video yet.");
                return;
            }

            const res = await fetch(buildApiUrl(`/api/videos/${recording.video.id}/report`), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ reason: reportReason, details: reportDetails })
            });
            if (res.ok) {
                alert("Thank you! The video has been reported to the moderators.");
                setShowReportModal(false);
                setReportReason("");
                setReportDetails("");
            } else {
                const data = await res.json();
                alert(data.error || "Failed to submit report.");
            }
        } catch (err) {
            console.error("Report failed:", err);
        }
    };

    const handleDeleteRecording = async () => {
        if (!confirm("Are you sure you want to delete this podcast video? This action cannot be undone.")) return;
        try {
            const token = localStorage.getItem("accessToken");
            const res = await fetch(buildApiUrl(`/api/live/${params.id}`), {
                method: "DELETE",
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                alert("Podcast deleted successfully.");
                router.push("/dashboard");
            } else {
                const data = await res.json();
                alert(data.error || "Failed to delete podcast.");
            }
        } catch (err) {
            console.error("Delete failed:", err);
        }
    };

    const handleToggleComments = async () => {
        try {
            const token = localStorage.getItem("accessToken");
            const nextState = !recording.chat_enabled;
            const res = await fetch(buildApiUrl(`/api/live/${params.id}/settings`), {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ chat_enabled: nextState })
            });
            if (res.ok) {
                setRecording((prev: any) => ({ ...prev, chat_enabled: nextState }));
            }
        } catch (err) {
            console.error("Failed to toggle comments:", err);
        }
    };

    const handleShare = async () => {
        const shareData = {
            title: recording.title,
            text: `Check out this podcast: ${recording.title} on PodLive!`,
            url: window.location.href,
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(window.location.href);
                } else {
                    const textArea = document.createElement("textarea");
                    textArea.value = window.location.href;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand("copy");
                    document.body.removeChild(textArea);
                }
                alert("Link copied to clipboard!");
            }
        } catch (err) {
            console.error("Share failed:", err);
        }
    };

    useEffect(() => {
        if (params.id && !loading) {
            // Increment view count on video playback
            fetch(buildApiUrl(`/api/live/${params.id}/view`), { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                    if (data.views) {
                        setRecording((prev: any) => prev ? ({ ...prev, views: data.views }) : null);
                    }
                })
                .catch(err => console.error("View count increment failed", err));
        }
    }, [params.id, loading]);

    const handlePostComment = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!newComment.trim()) return;

        setIsSubmitting(true);
        try {
            const token = localStorage.getItem("accessToken");
            if (!token) {
                alert("Please log in to post a comment.");
                setIsSubmitting(false);
                return;
            }

            const res = await fetch(buildApiUrl(`/api/live/${params.id}/comment`), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ message: newComment })
            });

            const data = await res.json();
            if (res.ok) {
                setRecording((prev: any) => ({
                    ...prev,
                    chat_messages: [...(prev.chat_messages || []), data.comment]
                }));
                setNewComment("");
            } else {
                alert(data.error || 'Failed to post comment');
            }
        } catch (err) {
            console.error("Error posting comment", err);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (!recording) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-white">
                <h1 className="text-2xl font-bold mb-2">Video Not Found</h1>
                <p className="text-zinc-400 mb-6">This recording may have been deleted or is unavailable.</p>
                <button onClick={() => router.push('/')} className="px-6 py-2 bg-indigo-600 rounded-full font-medium hover:bg-indigo-500 transition-colors">
                    Go Home
                </button>
            </div>
        );
    }

    const host = recording.host;
    const avatarUrl = host.avatar_url || `https://ui-avatars.com/api/?name=${host.display_name}&background=random`;
    const isOwner = currentUser && host?.id === currentUser.id;

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-indigo-500/30 font-sans pb-20">

            {/* ===== NAVBAR ===== */}
            <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span className="font-medium">Back</span>
                    </button>

                    <div className="flex flex-col items-center">
                        <span className="text-xs font-bold uppercase tracking-widest text-indigo-500">Recorded Broadcast</span>
                    </div>

                    <div className="w-16"></div> {/* Spacer for centering */}
                </div>
            </nav>

            <main className="pt-20 px-4 md:px-8 max-w-7xl mx-auto">
                <div className="flex flex-col lg:flex-row gap-8">

                    {/* ===== LEFT COLUMN (VIDEO & INFO) ===== */}
                    <div className="flex-1 w-full">

                        {/* VIDEO PLAYER CONTAINER */}
                        {recording.is_processing ? (
                            <div className="relative aspect-video w-full bg-zinc-900 rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col items-center justify-center p-8 text-center">
                                <Activity className="w-12 h-12 text-indigo-500 animate-pulse mb-6" />
                                <h2 className="text-2xl font-bold text-white mb-2">Processing High-Quality Video</h2>
                                <p className="text-zinc-400 max-w-md">
                                    We're currently converting this video into multiple resolutions (1080p, 720p, 480p) for smooth, buffer-free adaptive streaming.
                                </p>
                                <div className="mt-8 flex items-center gap-2 text-indigo-400 text-sm font-semibold bg-indigo-500/10 px-4 py-2 rounded-full">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Please check back in a few moments...
                                </div>
                            </div>
                        ) : (
                            <HlsPlayer
                                url={recording.recording_url}
                                poster={recording.thumbnail_url || "https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&q=80&w=1200"}
                                subtitles={recording.subtitles}
                            />
                        )}

                        {/* VIDEO INFO */}
                        <div className="mt-6">
                            <div className="flex flex-wrap gap-2 mb-3">
                                <span className="px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-400 text-xs font-bold uppercase tracking-wider border border-indigo-500/20">
                                    {recording.category || 'Podcast'}
                                </span>
                                <span className="px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 text-xs font-medium flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatDistanceToNow(new Date(recording.ended_at || recording.created_at), { addSuffix: true })}
                                </span>
                            </div>

                            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
                                {recording.title}
                            </h1>

                            {/* ACTION BAR */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 border-y border-white/10">
                                <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                                    <div className="flex items-center gap-1.5 bg-white/5 py-1.5 px-3 rounded-lg border border-white/5">
                                        <Users className="w-4 h-4 text-indigo-400" />
                                        <span className="font-medium text-white">{recording.views || 0} Views</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 bg-white/5 py-1.5 px-3 rounded-lg border border-white/5">
                                        <Activity className="w-4 h-4 text-zinc-300" />
                                        <span className="font-medium text-white">{recording.viewer_count_peak || 25} Peak</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="flex items-center bg-white/5 rounded-full border border-white/10 p-0.5">
                                        <button
                                            onClick={() => handleReactionToggle('like')}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${isLiked ? 'bg-pink-500/20 text-pink-500 border border-pink-500/30' : 'hover:bg-white/5 text-white'}`}
                                        >
                                            <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
                                            <span>{recording.like_count || 0}</span>
                                        </button>
                                        <div className="w-[1px] h-5 bg-white/10 mx-1" />
                                        <button
                                            onClick={() => handleReactionToggle('dislike')}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${isDisliked ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 'hover:bg-white/5 text-white'}`}
                                        >
                                            <ThumbsDown className={`w-4 h-4 ${isDisliked ? 'fill-current' : ''}`} />
                                            <span>{recording.dislike_count || 0}</span>
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleShare}
                                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 rounded-full font-medium text-indigo-400 transition-all border border-indigo-500/20"
                                    >
                                        <Share2 className="w-5 h-5" />
                                        Share
                                    </button>
                                    <button
                                        onClick={handleBookmarkToggle}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${isBookmarked ? 'bg-amber-500/20 text-amber-500 border border-amber-500/50' : 'bg-white/5 hover:bg-white/10 text-white border border-transparent'}`}
                                    >
                                        <Bookmark className={`w-5 h-5 ${isBookmarked ? 'fill-current' : ''}`} />
                                        <span>{isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
                                    </button>
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowMenu(!showMenu)}
                                            className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-white transition-colors"
                                        >
                                            <MoreVertical className="w-5 h-5" />
                                        </button>
                                        {showMenu && (
                                            <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 p-1">
                                                <button
                                                    onClick={() => {
                                                        setShowMenu(false);
                                                        handleAddToPlaylistClick();
                                                    }}
                                                    className="w-full text-left px-4 py-2 hover:bg-white/5 text-sm rounded-lg text-zinc-300 hover:text-white transition-colors flex items-center gap-2"
                                                >
                                                    Add to Playlist
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setShowMenu(false);
                                                        setShowReportModal(true);
                                                    }}
                                                    className="w-full text-left px-4 py-2 hover:bg-white/5 text-sm rounded-lg text-red-400 hover:text-red-300 transition-colors flex items-center gap-2"
                                                >
                                                    <Flag className="w-4 h-4" />
                                                    Report Video
                                                </button>
                                                {isOwner && (
                                                    <button
                                                        onClick={() => {
                                                            setShowMenu(false);
                                                            handleDeleteRecording();
                                                        }}
                                                        className="w-full text-left px-4 py-2 hover:bg-red-500/10 text-sm rounded-lg text-red-500 hover:text-red-400 transition-colors flex items-center gap-2 border-t border-white/5"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                        Delete Video
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* HOST PROFILE BANNER */}
                            <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-zinc-900 to-zinc-950 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div
                                    className="flex items-center gap-4 cursor-pointer group"
                                    onClick={() => router.push(`/creator/${host.id}`)}
                                >
                                    <div className="relative">
                                        <img src={avatarUrl} alt={host.display_name} className="w-14 h-14 rounded-full object-cover border-2 border-transparent group-hover:border-indigo-500 transition-colors" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-lg text-white group-hover:text-indigo-400 transition-colors">{host.display_name}</h3>
                                            {host.is_verified && <CheckCircle2 className="w-4 h-4 text-blue-500" fill="currentColor" stroke="white" />}
                                        </div>
                                        <p className="text-sm text-zinc-400 font-medium">@{host.unique_handle} • {host.follower_count || 0} Followers</p>
                                    </div>
                                </div>

                                <button
                                    onClick={handleFollowToggle}
                                    className={`px-6 py-2.5 rounded-full font-bold transition-all duration-300 w-full sm:w-auto ${isFollowing
                                        ? "bg-zinc-800 text-white hover:bg-zinc-700"
                                        : "bg-white text-black hover:bg-zinc-200 shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                                        }`}
                                >
                                    {isFollowing ? "Following" : "Follow"}
                                </button>
                            </div>                            {/* DESCRIPTION SECTION */}
                            <div className="mt-6 p-5 rounded-xl bg-zinc-900/50 border border-white/5">
                                <h4 className="font-semibold text-white mb-2">Description</h4>
                                <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap text-sm md:text-base">
                                    {recording.description || "No description provided for this broadcast."}
                                </p>
                            </div>

                            {/* COMMENTS SECTION (YouTube-style wider section) */}
                            <div className="mt-8 bg-zinc-900/30 border border-white/5 rounded-2xl flex flex-col overflow-hidden">
                                <div className="p-4 border-b border-white/5 flex items-center justify-between bg-zinc-950/20">
                                    <h3 className="font-bold flex items-center gap-2">
                                        <MessageSquare className="w-5 h-5 text-indigo-400" />
                                        Comments ({recording.chat_messages?.length || 0})
                                    </h3>
                                </div>

                                {isOwner && (
                                    <div className="flex items-center justify-between p-3 mx-4 mt-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                                        <div className="flex items-center gap-2">
                                            <Settings className="w-4 h-4 text-indigo-400" />
                                            <span className="text-sm font-semibold text-white">Creator comment control</span>
                                        </div>
                                        <button
                                            onClick={handleToggleComments}
                                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${recording.chat_enabled ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}
                                        >
                                            {recording.chat_enabled ? "Disable Comments" : "Enable Comments"}
                                        </button>
                                    </div>
                                )}

                                {recording.chat_enabled ? (
                                    <>
                                        {/* Comment Input */}
                                        <div className="p-4 bg-zinc-950/10 border-b border-white/5">
                                            <form onSubmit={handlePostComment} className="flex items-center gap-3">
                                                <input
                                                    type="text"
                                                    value={newComment}
                                                    onChange={(e) => setNewComment(e.target.value)}
                                                    placeholder="Add a public comment..."
                                                    className="w-full bg-zinc-900/80 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 placeholder:text-zinc-500 text-white"
                                                    disabled={isSubmitting}
                                                />
                                                <button
                                                    type="submit"
                                                    disabled={!newComment.trim() || isSubmitting}
                                                    className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 text-sm shrink-0 flex items-center gap-2"
                                                >
                                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                    Comment
                                                </button>
                                            </form>
                                        </div>

                                        {/* Comment List */}
                                        <div className="p-5 max-h-[400px] overflow-y-auto space-y-4">
                                            {(!recording.chat_messages || recording.chat_messages.length === 0) ? (
                                                <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
                                                    <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
                                                    <p className="text-sm">No comments yet. Share your thoughts!</p>
                                                </div>
                                            ) : (
                                                recording.chat_messages.map((chat: any) => {
                                                    const hash = [...chat.sender_handle].reduce((acc, char) => acc + char.charCodeAt(0), 0);
                                                    const colors = ['bg-orange-500', 'bg-green-500', 'bg-blue-500', 'bg-pink-500', 'bg-purple-500', 'bg-indigo-500'];
                                                    const textColor = colors[hash % colors.length].replace('bg-', 'text-');
                                                    const bgColor = colors[hash % colors.length];

                                                    return (
                                                        <div key={chat.id} className="flex gap-3">
                                                            <div className={`w-9 h-9 rounded-full ${bgColor} flex items-center justify-center shrink-0`}>
                                                                <span className="text-sm font-bold text-white uppercase">{chat.sender_handle.charAt(0)}</span>
                                                            </div>
                                                            <div>
                                                                <div className="flex items-baseline gap-2">
                                                                    <span className={`font-semibold text-sm ${textColor}`}>{chat.sender_handle}</span>
                                                                    <span className="text-[10px] text-zinc-500 font-medium">
                                                                        {new Date(chat.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                    </span>
                                                                </div>
                                                                <p className="text-sm text-zinc-300 mt-1 whitespace-pre-wrap break-words">{chat.message}</p>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                                        <MessageSquare className="w-12 h-12 mb-3 opacity-30 text-indigo-400" />
                                        <p className="text-zinc-400 font-medium text-sm">Comments are disabled for this video.</p>
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>

                    {/* ===== RIGHT COLUMN (SUGGESTED VIDEOS) ===== */}
                    <div className="w-full lg:w-[400px] shrink-0">
                        <div className="space-y-4">
                            {/* Header & Filter Pills */}
                            <div>
                                <h3 className="font-bold text-lg mb-3 text-white flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-indigo-400" />
                                    Suggested Videos
                                </h3>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    <button
                                        onClick={() => setRecommendedFilter('all')}
                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                                            recommendedFilter === 'all'
                                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                                        }`}
                                    >
                                        All
                                    </button>
                                    <button
                                        onClick={() => setRecommendedFilter('creator')}
                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                                            recommendedFilter === 'creator'
                                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                                        }`}
                                    >
                                        From Creator
                                    </button>
                                    <button
                                        onClick={() => setRecommendedFilter('related')}
                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                                            recommendedFilter === 'related'
                                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                                        }`}
                                    >
                                        Related (Category)
                                    </button>
                                </div>
                            </div>

                            {/* Videos Stack */}
                            <div className="space-y-3">
                                {recommendedLoading ? (
                                    [...Array(6)].map((_, i) => (
                                        <div key={i} className="flex gap-3 animate-pulse">
                                            <div className="w-32 aspect-video bg-zinc-900 rounded-lg shrink-0" />
                                            <div className="flex-1 space-y-2 py-1">
                                                <div className="h-3.5 bg-zinc-900 rounded w-11/12" />
                                                <div className="h-3 bg-zinc-900 rounded w-2/3" />
                                            </div>
                                        </div>
                                    ))
                                ) : displayedVideos.length === 0 ? (
                                    <p className="text-sm text-zinc-500 text-center py-8">No matching recommendations.</p>
                                ) : (
                                    displayedVideos.map((vod: any) => {
                                        return (
                                            <div
                                                key={vod.id}
                                                onClick={() => router.push(`/watch/${vod.id}`)}
                                                className="flex gap-3 group cursor-pointer hover:bg-white/[0.02] p-1.5 rounded-xl transition-all duration-200"
                                            >
                                                {/* Thumbnail */}
                                                <div className="relative w-32 aspect-video shrink-0 bg-zinc-900 rounded-lg overflow-hidden border border-white/5">
                                                    <img
                                                        src={vod.thumbnail_url || "https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&q=80&w=600"}
                                                        alt={vod.title}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                    />
                                                    {vod.video?.duration_seconds && (
                                                        <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 py-0.5 rounded font-mono font-bold z-10">
                                                            {(() => {
                                                                const secs = vod.video.duration_seconds;
                                                                if (isNaN(secs)) return "0:00";
                                                                const h = Math.floor(secs / 3600);
                                                                const m = Math.floor((secs % 3600) / 60);
                                                                const s = Math.floor(secs % 60);
                                                                const formattedS = s < 10 ? `0${s}` : s;
                                                                if (h > 0) {
                                                                    const formattedM = m < 10 ? `0${m}` : m;
                                                                    return `${h}:${formattedM}:${formattedS}`;
                                                                }
                                                                return `${m}:${formattedS}`;
                                                            })()}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Metadata */}
                                                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                                                    <div>
                                                        <h4 className="text-xs font-bold text-zinc-100 group-hover:text-indigo-400 line-clamp-2 transition-colors leading-snug duration-150">
                                                            {vod.title}
                                                        </h4>
                                                    </div>
                                                    <p className="text-[10px] text-zinc-500 truncate mt-1">
                                                        {vod.views || 0} views • {formatDistanceToNow(new Date(vod.ended_at || vod.created_at), { addSuffix: true })}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Playlists Modal */}
            {showPlaylistModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md p-6 relative">
                        <button
                            onClick={() => setShowPlaylistModal(false)}
                            className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
                        >
                            ✕
                        </button>
                        <h3 className="text-xl font-bold text-white mb-4">Save to Playlist</h3>
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                            {playlists.length === 0 ? (
                                <p className="text-zinc-500 text-sm">No playlists found. Create one below!</p>
                            ) : (
                                playlists.map((p) => {
                                    const isAlreadyIn = p.videos?.some((v: any) => v.video?.id === recording?.video?.id);
                                    return (
                                        <label key={p.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={!!isAlreadyIn}
                                                onChange={() => handleTogglePlaylistVideo(p.id, !!isAlreadyIn)}
                                                className="rounded border-white/20 bg-zinc-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-zinc-900"
                                            />
                                            <span className="text-sm font-semibold text-white">{p.title}</span>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                        <div className="border-t border-white/5 mt-5 pt-4">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="New playlist name..."
                                    value={newPlaylistTitle}
                                    onChange={(e) => setNewPlaylistTitle(e.target.value)}
                                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/70"
                                />
                                <button
                                    onClick={handleCreatePlaylist}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-colors"
                                >
                                    Create
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Report Modal */}
            {showReportModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md p-6 relative">
                        <button
                            onClick={() => setShowReportModal(false)}
                            className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
                        >
                            ✕
                        </button>
                        <h3 className="text-xl font-bold text-white mb-4">Report Video</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Reason</label>
                                <select
                                    value={reportReason}
                                    onChange={(e) => setReportReason(e.target.value)}
                                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/70"
                                >
                                    <option value="">Select a reason...</option>
                                    <option value="Spam or misleading">Spam or misleading</option>
                                    <option value="Sexual content">Sexual content</option>
                                    <option value="Violent or repulsive content">Violent or repulsive content</option>
                                    <option value="Hateful or abusive content font-medium">Hateful or abusive content</option>
                                    <option value="Harmful or dangerous acts">Harmful or dangerous acts</option>
                                    <option value="Child abuse">Child abuse</option>
                                    <option value="Infringes my rights">Infringes my rights</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Details (Optional)</label>
                                <textarea
                                    placeholder="Provide additional details..."
                                    value={reportDetails}
                                    onChange={(e) => setReportDetails(e.target.value)}
                                    rows={3}
                                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/70 resize-none"
                                />
                            </div>
                            <button
                                onClick={handleReportVideo}
                                className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-sm transition-colors mt-2"
                            >
                                Submit Report
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
