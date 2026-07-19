"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";

import { useParams, useRouter } from "next/navigation";
import { Mic, MicOff, VideoIcon, VideoOff, PhoneOff, Users, MessageSquare, Loader2, Share2, Circle, UserX, Maximize, Eye, EyeOff, ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen } from "lucide-react";
import {
    LiveKitRoom,
    RoomAudioRenderer,
    PreJoin,
    useParticipants,
    useTracks,
    GridLayout,
    ParticipantTile,
    ControlBar,
    StartAudio,
    useLocalParticipant
} from "@livekit/components-react";

import { createLocalScreenTracks, Track, type LocalTrack } from "livekit-client";
import "@livekit/components-styles";
import axios from "axios";
import { useSocket } from "@/providers/SocketProvider";
import { buildApiUrl, fetchLiveKitWsUrl } from "@/lib/api";




// ─────────────────────────────────────────────────────────────
// RoomHeader
// ─────────────────────────────────────────────────────────────
function RoomHeader({
    roomName,
    isHost,
    id,
}: {
    roomName: string;
    isHost: boolean;
    id: string;
}) {
    const router = useRouter();
    const participants = useParticipants();
    const viewerCount = Math.max(0, participants.length - 1);
    const [isSaving, setIsSaving] = useState(false);

    const handleShare = async () => {
        const shareData = {
            title: `Live Podcast: ${roomName}`,
            text: `Join my live podcast on PodLive: ${roomName}!`,
            url: window.location.href,
        };
        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(window.location.href);
                alert("Link copied to clipboard!");
            }
        } catch (err) {
            console.error("Share failed:", err);
        }
    };

        const handleEndStream = async () => {
        if (!isHost) {
            router.push("/dashboard");
            return;
        }

        setIsSaving(true);
        const lsToken = localStorage.getItem("accessToken");

        try {
            // Mark session as ended on backend (no video upload)
            await axios.post(
                buildApiUrl(`/api/live/${id}/end`),
                {},
                { headers: { Authorization: `Bearer ${lsToken}` } }
            );
        } catch (err) {
            console.error("Failed to end stream:", err);
        } finally {
            router.push("/dashboard");
        }
    };

    return (
        <header className="h-16 px-3 sm:px-6 border-b border-white/10 flex flex-row items-center justify-between shrink-0 bg-zinc-950 z-50 relative">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                <div className="flex items-center gap-1.5 bg-red-500/20 text-red-500 px-2 py-1 sm:px-3 sm:py-1.5 rounded-md text-xs sm:text-sm font-bold shrink-0">
                    <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-red-500 animate-pulse"></span>
                    LIVE
                </div>
                <span className="font-semibold px-2 sm:px-4 border-l border-white/10 text-zinc-300 text-xs sm:text-sm truncate max-w-[100px] sm:max-w-[200px] md:max-w-none">
                    {roomName || id}
                </span>



            </div>

            <div className="flex items-center gap-2 sm:gap-4 md:gap-6 shrink-0">
                <button
                    onClick={handleShare}
                    className="flex items-center gap-1.5 px-2 py-1.5 sm:px-3 sm:py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 rounded-lg font-medium text-indigo-400 transition-all border border-indigo-500/20 text-xs sm:text-sm"
                >
                    <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Share</span>
                </button>
                <div className="flex items-center gap-1.5 text-zinc-400 font-semibold px-2 py-1.5 sm:px-4 sm:py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs sm:text-sm">
                    <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400" />
                    <span>{viewerCount}</span>
                </div>
                <button
                    onClick={handleEndStream}
                    disabled={isSaving}
                    className="bg-red-600 hover:bg-red-500 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg font-bold flex items-center gap-1.5 transition-colors border-none cursor-pointer disabled:opacity-50 text-xs sm:text-sm"
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                            <span>Saving…</span>
                        </>
                    ) : isHost ? (
                        <>
                            <span className="hidden sm:inline">End Podcast</span>
                            <span className="sm:hidden">End</span>
                        </>
                    ) : (
                        <>
                            <span className="hidden sm:inline">Leave Room</span>
                            <span className="sm:hidden">Leave</span>
                        </>
                    )}
                </button>
            </div>
        </header>
    );
}

// ─────────────────────────────────────────────────────────────
// StageLayout
// ─────────────────────────────────────────────────────────────
function StageLayout({
    isBroadcaster,
    allTracks,
    hiddenTracks,
    setHiddenTracks,
    focusedTrackId,
    setFocusedTrackId
}: {
    isBroadcaster: boolean;
    allTracks: any[];
    hiddenTracks: string[];
    setHiddenTracks: React.Dispatch<React.SetStateAction<string[]>>;
    focusedTrackId: string | null;
    setFocusedTrackId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
    const { localParticipant } = useLocalParticipant();
    const [screenTracks, setScreenTracks] = useState<LocalTrack[]>([]);
    const screenTracksRef = useRef<LocalTrack[]>([]);
    const [isScreenShareStarting, setIsScreenShareStarting] = useState(false);
    const [screenShareError, setScreenShareError] = useState("");
    const isScreenShareEnabled = screenTracks.length > 0;

    const stopScreenShare = useCallback(async () => {
        const tracksToStop = [...screenTracksRef.current];
        screenTracksRef.current = [];
        setScreenTracks([]);
        setScreenShareError("");

        await Promise.allSettled(
            tracksToStop.map((track) => localParticipant.unpublishTrack(track, true))
        );
        tracksToStop.forEach((track) => track.stop());
    }, [localParticipant]);

    const startScreenShare = useCallback(async () => {
        setIsScreenShareStarting(true);
        setScreenShareError("");

        try {
            const tracks = await createLocalScreenTracks({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                },
                video: true,
                systemAudio: "include",
                selfBrowserSurface: "include",
                surfaceSwitching: "include",
                contentHint: "motion",
            });

            const streamName = `screen-${localParticipant.identity}`;
            await Promise.all(
                tracks.map((track) =>
                    localParticipant.publishTrack(track, {
                        source: track.source,
                        stream: streamName,
                    })
                )
            );

            tracks.forEach((track) => {
                track.mediaStreamTrack.onended = () => {
                    void stopScreenShare();
                };
            });

            screenTracksRef.current = tracks;
            setScreenTracks(tracks);

            const hasScreenAudio = tracks.some((track) => track.source === Track.Source.ScreenShareAudio);
            if (!hasScreenAudio) {
                setScreenShareError("Screen audio share nahi hua. Chrome Tab/Entire Screen choose karke Share audio tick karein.");
            }
        } catch (error: any) {
            setScreenShareError(error?.message || "Screen share start nahi ho paya.");
        } finally {
            setIsScreenShareStarting(false);
        }
    }, [localParticipant, stopScreenShare]);

    const handleScreenShareToggle = useCallback(() => {
        if (isScreenShareEnabled) {
            void stopScreenShare();
        } else {
            void startScreenShare();
        }
    }, [isScreenShareEnabled, startScreenShare, stopScreenShare]);

    useEffect(() => {
        return () => {
            screenTracksRef.current.forEach((track) => {
                localParticipant.unpublishTrack(track, true).catch(() => {});
                track.stop();
            });
            screenTracksRef.current = [];
        };
    }, [localParticipant]);

    const activeTracks = allTracks.filter((t) => {
        const p = t.participant;
        let role = "viewer";
        try {
            if (p.metadata) {
                const meta = typeof p.metadata === "string" ? JSON.parse(p.metadata) : p.metadata;
                if (meta && meta.role) role = meta.role;
            }
        } catch {}

        if (role === "host" || role === "stage") return true;
        if (t.publication && !t.publication.isMuted) return true;
        if (p.isSpeaking) return true;
        return false;
    });

    const visibleTracks = activeTracks.filter((t) => {
        const trackId = `${t.participant.identity}-${t.source}`;
        return !hiddenTracks.includes(trackId);
    });

    const focusedTrack = visibleTracks.find(
        (t) => `${t.participant.identity}-${t.source}` === focusedTrackId
    );

    const toggleHide = (trackId: string) => {
        setHiddenTracks((prev) => [...prev, trackId]);
        if (focusedTrackId === trackId) {
            setFocusedTrackId(null);
        }
    };

    const toggleFocus = (trackId: string) => {
        if (focusedTrackId === trackId) {
            setFocusedTrackId(null);
        } else {
            setFocusedTrackId(trackId);
        }
    };

    const isFocusedMode = !!focusedTrack;
    const otherTracks = visibleTracks.filter(
        (t) => `${t.participant.identity}-${t.source}` !== focusedTrackId
    );

    const renderTileOverlay = (t: any) => {
        const trackId = `${t.participant.identity}-${t.source}`;
        const isFocused = focusedTrackId === trackId;
        return (
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30 flex items-center gap-1.5 bg-zinc-950/80 p-1 rounded-lg border border-white/10 backdrop-blur-md">
                <button
                    onClick={() => toggleFocus(trackId)}
                    title={isFocused ? "Unpin Stream" : "Pin Stream"}
                    className={`p-1.5 rounded-md hover:bg-zinc-800 transition-colors cursor-pointer ${
                        isFocused ? "text-indigo-400" : "text-zinc-400"
                    }`}
                >
                    <Maximize className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={() => toggleHide(trackId)}
                    title="Hide Stream"
                    className="p-1.5 rounded-md hover:bg-red-500/20 hover:text-red-400 text-zinc-400 transition-colors cursor-pointer"
                >
                    <Eye className="w-3.5 h-3.5" />
                </button>
            </div>
        );
    };

    return (
        <div className="flex-1 p-2 sm:p-4 md:p-6 flex flex-col relative border-r border-white/10 bg-black/50 overflow-hidden h-[38vh] lg:h-auto w-full shrink-0 border-r-0 lg:border-r border-b lg:border-b-0">
            <div className="flex-1 relative w-full h-full min-h-0 flex items-center justify-center mb-16 lg:mb-20">
                {isFocusedMode ? (
                    <div className="w-full h-full relative flex items-center justify-center">
                        {/* Focused Main Stream */}
                        <div className="w-full h-full relative group rounded-2xl overflow-hidden border border-white/10 bg-zinc-950">
                            <ParticipantTile trackRef={focusedTrack} className="w-full h-full object-contain" />
                            {renderTileOverlay(focusedTrack)}
                        </div>

                        {/* Other Streams Carousel overlayed at the bottom */}
                        {otherTracks.length > 0 && (
                            <div className="absolute bottom-4 left-4 right-4 flex flex-row gap-2 overflow-x-auto p-1.5 bg-black/60 border border-white/10 rounded-2xl z-30 max-h-24 scrollbar-hide backdrop-blur-md max-w-fit mx-auto shadow-2xl">
                                {otherTracks.map((t) => {
                                    const tId = `${t.participant.identity}-${t.source}`;
                                    return (
                                        <div
                                            key={tId}
                                            className="w-24 sm:w-28 aspect-video shrink-0 relative rounded-xl overflow-hidden border border-white/10 group bg-zinc-900"
                                        >
                                            <ParticipantTile trackRef={t} className="w-full h-full object-cover" />
                                            {renderTileOverlay(t)}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    /* Custom responsive grid */
                    <div className="w-full h-full min-h-0 flex items-center justify-center">
                        {visibleTracks.length === 0 ? (
                            <div className="text-center text-zinc-500">
                                <VideoIcon className="w-12 h-12 mx-auto mb-2 opacity-30 animate-pulse" />
                                <p className="text-sm">No visible video streams.</p>
                            </div>
                        ) : (
                            <div className={`grid gap-3 w-full h-full items-center justify-center auto-rows-fr ${
                                visibleTracks.length === 1 ? 'grid-cols-1 max-w-3xl aspect-video' :
                                visibleTracks.length === 2 ? 'grid-cols-1 sm:grid-cols-2 max-w-5xl' :
                                visibleTracks.length <= 4 ? 'grid-cols-2 max-w-5xl' :
                                'grid-cols-2 md:grid-cols-3'
                            }`}>
                                {visibleTracks.map((t) => {
                                    const tId = `${t.participant.identity}-${t.source}`;
                                    return (
                                        <div
                                            key={tId}
                                            className="w-full h-full relative group rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 shadow-lg aspect-video sm:aspect-auto"
                                        >
                                            <ParticipantTile trackRef={t} className="w-full h-full object-cover" />
                                            {renderTileOverlay(t)}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {isBroadcaster && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 w-full max-w-sm sm:max-w-md">
                    {!isScreenShareEnabled && (
                        <div className="bg-zinc-950/90 text-zinc-300 text-xs px-4 py-2.5 rounded-2xl border border-indigo-500/30 shadow-2xl text-center backdrop-blur-md max-w-[90%] transition-all duration-300 select-none animate-bounce hidden sm:block">
                            <p className="font-semibold text-indigo-400 mb-0.5">Video Sound Tip</p>
                            <p className="text-[11px] leading-relaxed text-zinc-400 mb-0">
                                Screenshare par video sound sunane ke liye <span className="text-white font-medium">"Chrome Tab"</span> ya <span className="text-white font-medium">"Entire Screen"</span> select karein aur popup me <span className="text-white font-medium">"Share audio"</span> ko tick karein.
                            </p>
                        </div>
                    )}
                    {screenShareError && (
                        <div className="bg-amber-500/15 text-amber-200 text-xs px-4 py-2 rounded-2xl border border-amber-500/30 shadow-2xl text-center backdrop-blur-md max-w-[90%]">
                            {screenShareError}
                        </div>
                    )}

                    <div className="flex items-center gap-2 bg-zinc-900/90 p-1.5 rounded-xl border border-white/10 shadow-2xl backdrop-blur-md">
                        <ControlBar controls={{ camera: true, microphone: true, screenShare: false, leave: false, chat: false }} />
                        <button
                            type="button"
                            onClick={handleScreenShareToggle}
                            disabled={isScreenShareStarting}
                            className="lk-button"
                            data-lk-source={Track.Source.ScreenShare}
                            data-lk-enabled={isScreenShareEnabled}
                        >
                            {isScreenShareStarting ? "Starting..." : isScreenShareEnabled ? "Stop screen share" : "Share screen"}
                        </button>
                    </div>
                </div>
            )}

            {!isBroadcaster && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40">
                    <StartAudio
                        label="Click here to Hear Podcast 🔈"
                        className="bg-indigo-600 px-6 py-3 rounded-full font-bold shadow-2xl hover:bg-indigo-500 cursor-pointer text-white animate-bounce"
                    />
                </div>
            )}

            <RoomAudioRenderer />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// CustomChat
// ─────────────────────────────────────────────────────────────
function CustomChat({ socket, sessionId }: { socket: any; sessionId: string }) {
    const [chatMessages, setChatMessages] = useState<any[]>([]);
    const [message, setMessage] = useState("");
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        if (!socket) return;
        socket.emit("join_chat_room", sessionId);
        const handleReceiveChat = (data: any) => {
            setChatMessages((prev) => [...prev, data]);
        };
        socket.on("receive_chat_message", handleReceiveChat);
        return () => {
            socket.emit("leave_chat_room", sessionId);
            socket.off("receive_chat_message", handleReceiveChat);
        };
    }, [socket, sessionId]);

    const handleSend = () => {
        if (!message.trim() || isSending || !socket) return;
        setIsSending(true);
        const userData = localStorage.getItem("user");
        const user = userData ? JSON.parse(userData) : null;
        socket.emit("send_chat_message", {
            sessionId,
            senderHandle: user?.unique_handle || "Anonymous",
            message: message.trim(),
        });
        setMessage("");
        setIsSending(false);
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-zinc-950">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col-reverse">
                <div className="flex flex-col space-y-4">
                    {chatMessages.map((msg, idx) => (
                        <div key={idx} className="flex flex-col">
                            <span className="text-xs font-bold text-indigo-400 mb-1">{msg.senderHandle}</span>
                            <div className="bg-zinc-900 rounded-xl rounded-tl-none p-3 text-sm text-zinc-200 w-fit max-w-[90%]">
                                {msg.message}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="p-4 border-t border-white/10 bg-zinc-950 flex-shrink-0">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Say something..."
                        value={message}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                        onChange={(e) => setMessage(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-4 pr-12 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                        disabled={isSending || !socket}
                    />
                    <button
                        onClick={handleSend}
                        disabled={isSending || !message.trim() || !socket}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-indigo-600 rounded-full text-white flex items-center justify-center hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <MessageSquare className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// GuestSocketListener — listens for host commands on guest side
// ─────────────────────────────────────────────────────────────
function GuestSocketListener({ socket }: { socket: any }) {
    const { localParticipant } = useLocalParticipant();

    useEffect(() => {
        if (!socket) return;
        const handleRemoved = () => {
            alert("The host dropped your stage connection.");
            window.location.reload();
        };
        const handleMuted = () => {
            if (localParticipant) {
                localParticipant.setMicrophoneEnabled(false);
                alert("🔇 The host has muted your microphone.");
            }
        };
        const handleCameraDisabled = () => {
            if (localParticipant) {
                localParticipant.setCameraEnabled(false);
                alert("📷 The host has turned off your camera.");
            }
        };
        socket.on("guest_removed", handleRemoved);
        socket.on("guest_muted", handleMuted);
        socket.on("guest_camera_disabled", handleCameraDisabled);
        return () => {
            socket.off("guest_removed", handleRemoved);
            socket.off("guest_muted", handleMuted);
            socket.off("guest_camera_disabled", handleCameraDisabled);
        };
    }, [socket, localParticipant]);

    return null;
}


// ─────────────────────────────────────────────────────────────
// GuestManager — host control panel for on-stage guests
// ─────────────────────────────────────────────────────────────
function GuestManager({ sessionId, isHost, socket }: { sessionId: string; isHost: boolean; socket: any }) {
    const [guests, setGuests] = useState<any[]>([]);
    const [busy, setBusy] = useState<Record<string, string>>({}); // guestId -> action
    const [toast, setToast] = useState<string>("");
    const participants = useParticipants();

    // Map handle → LiveKit participant
    const participantMap = useMemo(() => {
        const map = new Map<string, any>();
        participants.forEach((p) => map.set(p.identity, p));
        return map;
    }, [participants]);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(""), 2500);
    };

    const fetchGuests = async () => {
        try {
            const lsToken = localStorage.getItem("accessToken");
            if (!lsToken) return;
            const res = await axios.get(buildApiUrl(`/api/stage/${sessionId}/guests`), {
                headers: { Authorization: `Bearer ${lsToken}` },
            });
            setGuests(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        if (!isHost) return;
        fetchGuests();
        const interval = setInterval(fetchGuests, 4000);
        return () => clearInterval(interval);
    }, [sessionId, isHost]);

    // Listen for guest join/leave to refresh list
    useEffect(() => {
        if (!socket || !isHost) return;
        const handler = () => fetchGuests();
        socket.on("invite_accepted", handler);
        return () => socket.off("invite_accepted", handler);
    }, [socket, isHost]);

    const muteMic = async (g: any) => {
        setBusy(p => ({ ...p, [g.invitee_id]: "mic" }));
        try {
            const token = localStorage.getItem("accessToken");
            await axios.post(buildApiUrl(`/api/stage/guest/${sessionId}/${g.invitee_id}/mute`), {}, {
                headers: { Authorization: `Bearer ${token}` },
            });
            socket?.emit("mute_guest", { guestId: g.invitee_id });
            showToast(`🔇 Muted @${g.invitee?.unique_handle?.replace("@","")}`);
        } catch { showToast("Failed to mute"); }
        finally { setBusy(p => { const n = {...p}; delete n[g.invitee_id]; return n; }); }
    };

    const disableCamera = async (g: any) => {
        setBusy(p => ({ ...p, [g.invitee_id]: "cam" }));
        try {
            const token = localStorage.getItem("accessToken");
            await axios.post(buildApiUrl(`/api/stage/guest/${sessionId}/${g.invitee_id}/disable-camera`), {}, {
                headers: { Authorization: `Bearer ${token}` },
            });
            socket?.emit("disable_camera_guest", { guestId: g.invitee_id });
            showToast(`📷 Camera off for @${g.invitee?.unique_handle?.replace("@","")}`);
        } catch { showToast("Failed to disable camera"); }
        finally { setBusy(p => { const n = {...p}; delete n[g.invitee_id]; return n; }); }
    };

    const removeGuest = async (g: any) => {
        setBusy(p => ({ ...p, [g.invitee_id]: "remove" }));
        try {
            const token = localStorage.getItem("accessToken");
            await axios.delete(buildApiUrl(`/api/stage/guest/${sessionId}/${g.invitee_id}`), {
                headers: { Authorization: `Bearer ${token}` },
            });
            socket?.emit("remove_guest", { guestId: g.invitee_id });
            showToast(`❌ Removed @${g.invitee?.unique_handle?.replace("@","")}`);
            fetchGuests();
        } catch { showToast("Failed to remove"); }
        finally { setBusy(p => { const n = {...p}; delete n[g.invitee_id]; return n; }); }
    };

    if (!isHost) return null;

    return (
        <div className="border-b border-zinc-800/60">
            {/* Toast */}
            {toast && (
                <div className="mx-3 mt-3 px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-xs text-zinc-200 text-center">
                    {toast}
                </div>
            )}

            <div className="px-4 pt-3 pb-1">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        On Stage ({guests.length})
                    </h4>
                </div>

                {guests.length === 0 ? (
                    <p className="text-xs text-zinc-600 italic pb-3">No guests on stage. Invite someone above.</p>
                ) : (
                    <div className="space-y-2 pb-3">
                        {guests.map((g) => {
                            const handle = (g.invitee?.unique_handle ?? "").replace("@", "");
                            const participant = participantMap.get(g.invitee?.unique_handle ?? "");
                            const micOn  = participant?.isMicrophoneEnabled ?? false;
                            const camOn  = participant?.isCameraEnabled ?? false;
                            const online = !!participant;
                            const action = busy[g.invitee_id];

                            return (
                                <div
                                    key={g.id}
                                    className="rounded-xl border border-white/[0.07] bg-zinc-900/80 overflow-hidden"
                                >
                                    {/* Guest header row */}
                                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                                        {/* Avatar */}
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 text-xs font-bold text-white">
                                            {handle.charAt(0).toUpperCase()}
                                        </div>

                                        {/* Name + status */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm font-semibold text-white truncate">@{handle}</span>
                                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                    online ? "bg-green-500" : "bg-zinc-600"
                                                }`} />
                                            </div>
                                            <div className="flex gap-2 mt-0.5">
                                                <span className={`text-[10px] font-medium ${
                                                    micOn ? "text-green-400" : "text-red-400"
                                                }`}>
                                                    {micOn ? "🎤 Mic on" : "🔇 Mic off"}
                                                </span>
                                                <span className={`text-[10px] font-medium ${
                                                    camOn ? "text-green-400" : "text-zinc-500"
                                                }`}>
                                                    {camOn ? "📷 Cam on" : "📷 Cam off"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Control buttons */}
                                    <div className="grid grid-cols-3 border-t border-white/[0.05]">
                                        {/* Mute Mic */}
                                        <button
                                            onClick={() => muteMic(g)}
                                            disabled={!!action || !micOn}
                                            className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold transition-all border-r border-white/[0.05] ${
                                                !micOn
                                                    ? "text-zinc-600 cursor-not-allowed"
                                                    : "text-zinc-300 hover:bg-red-500/15 hover:text-red-400 active:scale-95"
                                            }`}
                                        >
                                            {action === "mic" ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : micOn ? (
                                                <Mic className="w-4 h-4" />
                                            ) : (
                                                <MicOff className="w-4 h-4 text-red-400" />
                                            )}
                                            {micOn ? "Mute" : "Muted"}
                                        </button>

                                        {/* Disable Camera */}
                                        <button
                                            onClick={() => disableCamera(g)}
                                            disabled={!!action || !camOn}
                                            className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold transition-all border-r border-white/[0.05] ${
                                                !camOn
                                                    ? "text-zinc-600 cursor-not-allowed"
                                                    : "text-zinc-300 hover:bg-orange-500/15 hover:text-orange-400 active:scale-95"
                                            }`}
                                        >
                                            {action === "cam" ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : camOn ? (
                                                <VideoIcon className="w-4 h-4" />
                                            ) : (
                                                <VideoOff className="w-4 h-4 text-orange-400" />
                                            )}
                                            {camOn ? "Cam Off" : "Off"}
                                        </button>

                                        {/* Remove */}
                                        <button
                                            onClick={() => removeGuest(g)}
                                            disabled={!!action}
                                            className="flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold text-zinc-300 hover:bg-red-600/20 hover:text-red-400 transition-all active:scale-95 disabled:opacity-40"
                                        >
                                            {action === "remove" ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <UserX className="w-4 h-4" />
                                            )}
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}


// ─────────────────────────────────────────────────────────────
// HostPanel — tabbed panel: Controls | Chat
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// StreamsPanel — lists active/hidden streams & handles pin/hide
// ─────────────────────────────────────────────────────────────
function StreamsPanel({
    allTracks,
    hiddenTracks,
    setHiddenTracks,
    focusedTrackId,
    setFocusedTrackId
}: {
    allTracks: any[];
    hiddenTracks: string[];
    setHiddenTracks: React.Dispatch<React.SetStateAction<string[]>>;
    focusedTrackId: string | null;
    setFocusedTrackId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
    const activeTracks = allTracks.filter((t) => {
        const p = t.participant;
        let role = "viewer";
        try {
            if (p.metadata) {
                const meta = typeof p.metadata === "string" ? JSON.parse(p.metadata) : p.metadata;
                if (meta && meta.role) role = meta.role;
            }
        } catch {}

        if (role === "host" || role === "stage") return true;
        if (t.publication && !t.publication.isMuted) return true;
        if (p.isSpeaking) return true;
        return false;
    });

    const hiddenList = activeTracks.filter(t => {
        const trackId = `${t.participant.identity}-${t.source}`;
        return hiddenTracks.includes(trackId);
    });

    const visibleList = activeTracks.filter(t => {
        const trackId = `${t.participant.identity}-${t.source}`;
        return !hiddenTracks.includes(trackId);
    });

    const toggleHide = (trackId: string) => {
        if (hiddenTracks.includes(trackId)) {
            setHiddenTracks(prev => prev.filter(id => id !== trackId));
        } else {
            setHiddenTracks(prev => [...prev, trackId]);
            if (focusedTrackId === trackId) {
                setFocusedTrackId(null);
            }
        }
    };

    const toggleFocus = (trackId: string) => {
        if (focusedTrackId === trackId) {
            setFocusedTrackId(null);
        } else {
            setFocusedTrackId(trackId);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-zinc-950 p-4 overflow-y-auto space-y-6">
            <div>
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
                    Active Streams ({visibleList.length})
                </h4>
                {visibleList.length === 0 ? (
                    <p className="text-xs text-zinc-600 italic">No active streams on stage.</p>
                ) : (
                    <div className="space-y-2">
                        {visibleList.map(t => {
                            const trackId = `${t.participant.identity}-${t.source}`;
                            const isFocused = focusedTrackId === trackId;
                            const handle = t.participant.identity.replace("@", "");
                            const isScreen = t.source === Track.Source.ScreenShare;

                            return (
                                <div key={trackId} className="flex items-center justify-between p-2.5 bg-zinc-900 border border-white/[0.05] rounded-xl">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {isScreen ? (
                                            <Share2 className="w-4 h-4 text-indigo-400 shrink-0" />
                                        ) : (
                                            <VideoIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                                        )}
                                        <span className="text-sm font-semibold text-zinc-200 truncate">
                                            {isScreen ? `@${handle}'s Screen` : `@${handle}`}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => toggleFocus(trackId)}
                                            title={isFocused ? "Unpin Stream" : "Pin Stream"}
                                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                                isFocused 
                                                    ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                                                    : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                                            }`}
                                        >
                                            <Maximize className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => toggleHide(trackId)}
                                            title="Hide Stream"
                                            className="p-1.5 rounded-lg text-zinc-500 hover:bg-red-500/15 hover:text-red-400 transition-colors cursor-pointer"
                                        >
                                            <Eye className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {hiddenList.length > 0 && (
                <div>
                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
                        Hidden Streams ({hiddenList.length})
                    </h4>
                    <div className="space-y-2">
                        {hiddenList.map(t => {
                            const trackId = `${t.participant.identity}-${t.source}`;
                            const handle = t.participant.identity.replace("@", "");
                            const isScreen = t.source === Track.Source.ScreenShare;

                            return (
                                <div key={trackId} className="flex items-center justify-between p-2.5 bg-zinc-900/40 border border-white/[0.03] rounded-xl opacity-60">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {isScreen ? (
                                            <Share2 className="w-4 h-4 text-zinc-500 shrink-0" />
                                        ) : (
                                            <VideoIcon className="w-4 h-4 text-zinc-500 shrink-0" />
                                        )}
                                        <span className="text-sm font-semibold text-zinc-400 truncate">
                                            {isScreen ? `@${handle}'s Screen` : `@${handle}`}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => toggleHide(trackId)}
                                        title="Show Stream"
                                        className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                                    >
                                        <EyeOff className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// ListenerPanel — tabbed panel for normal viewers: Chat | Streams
// ─────────────────────────────────────────────────────────────
function ListenerPanel({
    sessionId,
    socket,
    allTracks,
    hiddenTracks,
    setHiddenTracks,
    focusedTrackId,
    setFocusedTrackId
}: {
    sessionId: string;
    socket: any;
    allTracks: any[];
    hiddenTracks: string[];
    setHiddenTracks: React.Dispatch<React.SetStateAction<string[]>>;
    focusedTrackId: string | null;
    setFocusedTrackId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
    const [tab, setTab] = useState<"chat" | "streams">("chat");

    return (
        <div className="flex flex-col h-full">
            {/* Tab bar */}
            <div className="flex border-b border-white/[0.07] shrink-0">
                {(["chat", "streams"] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors relative cursor-pointer ${
                            tab === t ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                        }`}
                    >
                        {t === "chat" ? "💬 Chat" : "🎥 Streams"}
                        {tab === t && (
                            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t-full" />
                        )}
                    </button>
                ))}
            </div>

            {tab === "chat" ? (
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    <CustomChat socket={socket} sessionId={sessionId} />
                </div>
            ) : (
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    <StreamsPanel
                        allTracks={allTracks}
                        hiddenTracks={hiddenTracks}
                        setHiddenTracks={setHiddenTracks}
                        focusedTrackId={focusedTrackId}
                        setFocusedTrackId={setFocusedTrackId}
                    />
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// HostPanel — tabbed panel: Controls | Streams | Chat
// ─────────────────────────────────────────────────────────────
function HostPanel({
    sessionId,
    socket,
    inviteHandle,
    setInviteHandle,
    handleSendInvite,
    allTracks,
    hiddenTracks,
    setHiddenTracks,
    focusedTrackId,
    setFocusedTrackId
}: {
    sessionId: string;
    socket: any;
    inviteHandle: string;
    setInviteHandle: (v: string) => void;
    handleSendInvite: () => void;
    allTracks: any[];
    hiddenTracks: string[];
    setHiddenTracks: React.Dispatch<React.SetStateAction<string[]>>;
    focusedTrackId: string | null;
    setFocusedTrackId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
    const [tab, setTab] = useState<"controls" | "streams" | "chat">("controls");
    const [inviteStatus, setInviteStatus] = useState<{ ok: boolean; msg: string } | null>(null);

    // Show invite status from socket
    useEffect(() => {
        if (!socket) return;
        const handler = (data: any) => {
            setInviteStatus({ ok: data.success, msg: data.message });
            setTimeout(() => setInviteStatus(null), 3000);
            if (data.success) setInviteHandle("");
        };
        socket.on("invite_status", handler);
        return () => socket.off("invite_status", handler);
    }, [socket]);

    const sendInvite = () => {
        if (!inviteHandle.trim()) return;
        handleSendInvite();
    };

    return (
        <div className="flex flex-col h-full">
            {/* Tab bar */}
            <div className="flex border-b border-white/[0.07] shrink-0">
                {(["controls", "streams", "chat"] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors relative cursor-pointer ${
                            tab === t ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                        }`}
                    >
                        {t === "controls" ? "🎤 Controls" : t === "streams" ? "🎥 Streams" : "💬 Chat"}
                        {tab === t && (
                            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t-full" />
                        )}
                    </button>
                ))}
            </div>

            {tab === "controls" ? (
                <div className="flex-1 overflow-y-auto">
                    {/* Invite section */}
                    <div className="p-4 border-b border-zinc-800/60">
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Invite to Stage</p>

                        {inviteStatus && (
                            <div className={`text-xs px-3 py-2 rounded-lg mb-2 ${
                                inviteStatus.ok
                                    ? "bg-green-500/10 border border-green-500/20 text-green-400"
                                    : "bg-red-500/10 border border-red-500/20 text-red-400"
                            }`}>
                                {inviteStatus.msg}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={inviteHandle}
                                onChange={(e) => setInviteHandle(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") sendInvite(); }}
                                placeholder="Enter @username or User ID"
                                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                            <button
                                onClick={sendInvite}
                                disabled={!inviteHandle.trim()}
                                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-sm px-4 rounded-lg transition-colors cursor-pointer"
                            >
                                Invite
                            </button>
                        </div>
                        <p className="text-[11px] text-zinc-600 mt-2">
                            User must be online and watching to receive invite.
                        </p>
                    </div>

                    {/* Guest controls */}
                    <GuestManager sessionId={sessionId} isHost={true} socket={socket} />
                </div>
            ) : tab === "streams" ? (
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    <StreamsPanel
                        allTracks={allTracks}
                        hiddenTracks={hiddenTracks}
                        setHiddenTracks={setHiddenTracks}
                        focusedTrackId={focusedTrackId}
                        setFocusedTrackId={setFocusedTrackId}
                    />
                </div>
            ) : (
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    <CustomChat socket={socket} sessionId={sessionId} />
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// LiveRoomContent wrapper — runs inside LiveKitRoom
// ─────────────────────────────────────────────────────────────
function LiveRoomContent({
    id,
    roomName,
    isHost,
    onStage,
    socket,
    inviteHandle,
    setInviteHandle,
    handleSendInvite
}: {
    id: string;
    roomName: string;
    isHost: boolean;
    onStage: boolean;
    socket: any;
    inviteHandle: string;
    setInviteHandle: React.Dispatch<React.SetStateAction<string>>;
    handleSendInvite: () => void;
}) {
    const [hiddenTracks, setHiddenTracks] = useState<string[]>([]);
    const [focusedTrackId, setFocusedTrackId] = useState<string | null>(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    const allTracks = useTracks(
        [
            { source: Track.Source.Camera, withPlaceholder: true },
            { source: Track.Source.ScreenShare, withPlaceholder: false },
        ],
        { onlySubscribed: false }
    );

    // Auto-focus screenshare when screenshare starts. If stops, reset.
    const autoPinnedScreenshares = useRef<Set<string>>(new Set());
    useEffect(() => {
        const screenshareTrack = allTracks.find(t => t.source === Track.Source.ScreenShare);
        if (screenshareTrack) {
            const trackId = `${screenshareTrack.participant.identity}-${Track.Source.ScreenShare}`;
            if (!autoPinnedScreenshares.current.has(trackId)) {
                autoPinnedScreenshares.current.add(trackId);
                setFocusedTrackId(trackId);
            }
        } else {
            autoPinnedScreenshares.current.clear();
            if (focusedTrackId && focusedTrackId.endsWith(`-${Track.Source.ScreenShare}`)) {
                setFocusedTrackId(null);
            }
        }
    }, [allTracks, focusedTrackId]);

    const isBroadcaster = isHost || onStage;

    return (
        <div className="min-h-screen bg-black text-white flex flex-col w-full h-full">
            {!isHost && onStage && <GuestSocketListener socket={socket} />}

            <RoomHeader
                roomName={roomName}
                isHost={isHost}
                id={id}
            />

            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
                {/* Left Stage — grows when sidebar collapses */}
                <div className={`relative flex-1 flex flex-col transition-all duration-500 ease-in-out`}>
                    <StageLayout
                        isBroadcaster={isBroadcaster}
                        allTracks={allTracks}
                        hiddenTracks={hiddenTracks}
                        setHiddenTracks={setHiddenTracks}
                        focusedTrackId={focusedTrackId}
                        setFocusedTrackId={setFocusedTrackId}
                    />

                    {/* Floating Sidebar Toggle Button — always visible on stage edge */}
                    <button
                        onClick={() => setSidebarCollapsed(prev => !prev)}
                        title={sidebarCollapsed ? "Open Panel" : "Close Panel"}
                        className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 z-50 items-center justify-center w-7 h-16 rounded-l-xl bg-zinc-800/90 hover:bg-indigo-600 border border-white/10 hover:border-indigo-500/50 text-zinc-400 hover:text-white transition-all duration-300 shadow-2xl backdrop-blur-sm cursor-pointer group"
                        style={{ right: sidebarCollapsed ? 0 : 0 }}
                    >
                        <div className="flex flex-col items-center gap-0.5">
                            {sidebarCollapsed ? (
                                <>
                                    <ChevronLeft className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                </>
                            ) : (
                                <>
                                    <ChevronRight className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                </>
                            )}
                        </div>
                    </button>
                </div>

                {/* Right Panel — slides in/out */}
                <div
                    className={`
                        bg-zinc-950 flex flex-col z-20 flex-shrink-0
                        transition-all duration-500 ease-in-out overflow-hidden
                        w-full lg:flex-none
                        ${
                            sidebarCollapsed
                                ? 'lg:w-0 lg:opacity-0 lg:pointer-events-none'
                                : 'lg:w-96 lg:opacity-100'
                        }
                    `}
                >
                    {/* Inner wrapper prevents content jump during animation */}
                    <div className="w-full lg:w-96 flex flex-col h-full min-h-0">
                        {isHost ? (
                            <HostPanel
                                sessionId={id}
                                socket={socket}
                                inviteHandle={inviteHandle}
                                setInviteHandle={setInviteHandle}
                                handleSendInvite={handleSendInvite}
                                allTracks={allTracks}
                                hiddenTracks={hiddenTracks}
                                setHiddenTracks={setHiddenTracks}
                                focusedTrackId={focusedTrackId}
                                setFocusedTrackId={setFocusedTrackId}
                            />
                        ) : (
                            <ListenerPanel
                                sessionId={id}
                                socket={socket}
                                allTracks={allTracks}
                                hiddenTracks={hiddenTracks}
                                setHiddenTracks={setHiddenTracks}
                                focusedTrackId={focusedTrackId}
                                setFocusedTrackId={setFocusedTrackId}
                            />
                        )}
                    </div>
                </div>

                {/* Mobile toggle button — bottom bar on small screens */}
                <button
                    onClick={() => setSidebarCollapsed(prev => !prev)}
                    className="lg:hidden fixed bottom-20 right-4 z-50 flex items-center gap-2 px-4 py-2.5 bg-indigo-600/90 hover:bg-indigo-500 text-white font-semibold text-xs rounded-full shadow-2xl backdrop-blur-sm border border-indigo-400/30 transition-all duration-300 cursor-pointer"
                >
                    {sidebarCollapsed ? (
                        <><PanelRightOpen className="w-4 h-4" /> Open Panel</>
                    ) : (
                        <><PanelRightClose className="w-4 h-4" /> Close Panel</>
                    )}
                </button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Main LiveRoom page
// ─────────────────────────────────────────────────────────────
export default function LiveRoom() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { socket } = useSocket();

    const [token, setToken] = useState("");
    const [roomName, setRoomName] = useState("");
    const [loading, setLoading] = useState(true);
    const [isHost, setIsHost] = useState(false);
    const [onStage, setOnStage] = useState(false);
    const [preJoinComplete, setPreJoinComplete] = useState(false);
    const [liveKitServerUrl, setLiveKitServerUrl] = useState("");




    // Stage invite state
    const [inviteHandle, setInviteHandle] = useState("");
    const [receivedInvite, setReceivedInvite] = useState<any>(null);

    useEffect(() => {
        const initRoom = async () => {
            try {
                const wsUrl = await fetchLiveKitWsUrl();
                setLiveKitServerUrl(wsUrl);

                try {
                    const lsToken = localStorage.getItem("accessToken");

                    if (lsToken) {
                        // Logged-in user: get proper token (host or viewer)
                        const tokenAttempt = await axios.get(buildApiUrl(`/api/live/${id}/token`), {
                            headers: { Authorization: `Bearer ${lsToken}` },
                        });
                        setToken(tokenAttempt.data.token);
                        setRoomName(tokenAttempt.data.roomName);
                        const isUserHost = !!tokenAttempt.data.isHost;
                        const isUserStage = !!tokenAttempt.data.isStage;
                        setIsHost(isUserHost);
                        setOnStage(isUserStage);
                        setPreJoinComplete(!isUserHost && !isUserStage); // viewers skip prejoin
                    } else {
                        // Anonymous viewer: use public guest token
                        const guestAttempt = await axios.get(buildApiUrl(`/api/live/${id}/guest-token`));
                        setToken(guestAttempt.data.token);
                        setRoomName(guestAttempt.data.roomName);
                        setIsHost(false);
                        setOnStage(false);
                        setPreJoinComplete(true); // viewers skip prejoin
                    }
                } catch (tokenError: any) {
                    if (tokenError.response?.status === 404) {
                        try {
                            const stats = await axios.get(buildApiUrl(`/api/live/${id}/stats`));
                            if (stats.data?.status === "ended") {
                                router.push(`/watch/${id}`);
                                return;
                            }
                        } catch { }
                    }
                    router.push("/");
                }
            } catch {
                router.push("/dashboard");
            } finally {
                setLoading(false);
            }
        };
        initRoom();
    }, [id, router]);

    // Socket events
    useEffect(() => {
        if (!socket) return;
        const userData = localStorage.getItem("user");
        if (userData) {
            const user = JSON.parse(userData);
            socket.emit("register_user", user.id);
        }

        const handleReceiveInvite = (data: any) => {
            if (data.sessionId === id) setReceivedInvite(data);
        };
        const handleInviteAccepted = (data: any) => {
            if (isHost) setInviteHandle(""); // clear input on accept
        };
        const handleInviteRejected = (data: any) => {
            console.log(`${data.inviteeHandle} declined invite`);
        };
        const handlePodcastEnded = () => {
            if (!isHost) {
                alert("The host has ended this podcast session.");
                router.push(`/watch/${id}`);
            }
        };

        socket.on("receive_invite", handleReceiveInvite);
        socket.on("invite_accepted", handleInviteAccepted);
        socket.on("invite_rejected", handleInviteRejected);
        socket.on("podcast_ended", handlePodcastEnded);

        return () => {
            socket.off("receive_invite", handleReceiveInvite);
            socket.off("invite_accepted", handleInviteAccepted);
            socket.off("invite_rejected", handleInviteRejected);
            socket.off("podcast_ended", handlePodcastEnded);
        };
    }, [socket, id, isHost, router]);

    const handleSendInvite = () => {
        if (!inviteHandle || !socket) return;
        const userData = localStorage.getItem("user");
        const user = userData ? JSON.parse(userData) : null;
        socket.emit("send_invite", { sessionId: id, inviteeHandle: inviteHandle, hostId: user.id });
    };

    const handleAcceptInvite = async () => {
        try {
            const lsToken = localStorage.getItem("accessToken");
            if (!lsToken) return;
            const res = await axios.get(buildApiUrl(`/api/live/${id}/upgrade`), {
                headers: { Authorization: `Bearer ${lsToken}` },
            });
            setToken(res.data.token);
            setOnStage(true);
            setPreJoinComplete(false);
            if (socket) {
                const userData = localStorage.getItem("user");
                const user = userData ? JSON.parse(userData) : null;
                socket.emit("accept_invite", {
                    sessionId: id,
                    hostId: receivedInvite?.host?.id,
                    inviteeHandle: user?.unique_handle,
                });
            }
            setReceivedInvite(null);
        } catch {
            alert("Failed to join the stage.");
        }
    };

    if (loading || !token) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-zinc-400">Connecting to PodLive Server...</p>
            </div>
        );
    }

    if (!liveKitServerUrl) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white px-6 text-center">
                <h1 className="text-2xl font-bold mb-3">Could not connect to LiveKit</h1>
                <p className="text-zinc-400 max-w-xl">
                    The server could not provide a LiveKit configuration. Please ensure{" "}
                    <code className="text-indigo-400">LIVEKIT_URL</code> is set in the backend environment.
                </p>
            </div>
        );
    }

    const isBroadcaster = isHost || onStage;

    if (isBroadcaster && !preJoinComplete) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white" data-lk-theme="default">
                <h2 className="text-2xl font-bold mb-6">Camera & Microphone Setup</h2>
                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-[500px]">
                    <PreJoin onSubmit={() => setPreJoinComplete(true)} onValidate={() => true} />
                </div>
            </div>
        );
    }

    return (
        <>
            {/* Stage Invite Modal */}
            {receivedInvite && !onStage && (
                <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-indigo-500/30 p-8 rounded-2xl max-w-sm text-center">
                        <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Mic className="text-indigo-500 w-8 h-8" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Stage Invite</h2>
                        <p className="text-zinc-400 mb-8">
                            The host has invited you to join the stage. You can turn on your mic and camera to speak.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    if (socket) {
                                        const userData = localStorage.getItem("user");
                                        const user = userData ? JSON.parse(userData) : null;
                                        socket.emit("reject_invite", {
                                            sessionId: id,
                                            hostId: receivedInvite?.host?.id,
                                            inviteeHandle: user?.unique_handle,
                                        });
                                    }
                                    setReceivedInvite(null);
                                }}
                                className="flex-1 px-4 py-2 rounded-lg bg-zinc-800 text-white font-medium hover:bg-zinc-700 transition"
                            >
                                Decline
                            </button>
                            <button
                                onClick={handleAcceptInvite}
                                className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition"
                            >
                                Accept & Join
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <LiveKitRoom
                video={isBroadcaster}
                audio={isBroadcaster}
                token={token}
                connect={isBroadcaster ? preJoinComplete : true}
                serverUrl={liveKitServerUrl}
                data-lk-theme="default"
                style={{ height: "100vh", display: "flex", flexDirection: "column", backgroundColor: "#000" }}
            >
                <LiveRoomContent
                    id={id}
                    roomName={roomName}
                    isHost={isHost}
                    onStage={onStage}
                    socket={socket}
                    inviteHandle={inviteHandle}
                    setInviteHandle={setInviteHandle}
                    handleSendInvite={handleSendInvite}
                />
            </LiveKitRoom>
        </>
    );
}
