"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Mic, MicOff, PhoneOff, Users, MessageSquare, Loader2, Share2, Circle } from "lucide-react";
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
import { Track } from "livekit-client";
import "@livekit/components-styles";
import axios from "axios";
import { useSocket } from "@/providers/SocketProvider";
import { buildApiUrl, fetchLiveKitWsUrl } from "@/lib/api";

// ─────────────────────────────────────────────────────────────
// LocalRecorder — runs inside LiveKitRoom, captures host's
// camera + mic via MediaRecorder and downloads on stop.
// Nothing is uploaded to the server.
// ─────────────────────────────────────────────────────────────
function LocalRecorder({
    isHost,
    onRecorderReady,
    onRecordingStart,
}: {
    isHost: boolean;
    onRecorderReady: (stopFn: () => Promise<void>) => void;
    onRecordingStart: () => void;
}) {
    const { localParticipant } = useLocalParticipant();
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const startedRef = useRef(false);
    const onRecorderReadyRef = useRef(onRecorderReady);
    const onRecordingStartRef = useRef(onRecordingStart);

    useEffect(() => {
        onRecorderReadyRef.current = onRecorderReady;
        onRecordingStartRef.current = onRecordingStart;
    });

    const stopFn = useCallback((): Promise<void> => {
        return new Promise((resolve) => {
            const recorder = recorderRef.current;
            if (!recorder || recorder.state === "inactive") {
                resolve();
                return;
            }
            recorder.onstop = () => {
                const mimeType = recorder.mimeType || "video/webm";
                const ext = mimeType.includes("mp4") ? "mp4" : "webm";
                const blob = new Blob(chunksRef.current, { type: mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `podlive-${new Date()
                    .toISOString()
                    .slice(0, 19)
                    .replace(/:/g, "-")}.${ext}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                resolve();
            };
            recorder.stop();
        });
    }, []);

    // Register the stop function as soon as host is known
    useEffect(() => {
        if (!isHost) return;
        onRecorderReadyRef.current(stopFn);
    }, [isHost, stopFn]);

    // Start recording once local tracks become available
    useEffect(() => {
        if (!isHost || !localParticipant || startedRef.current) return;

        const tryStart = () => {
            const tracks: MediaStreamTrack[] = [];
            localParticipant.getTrackPublications().forEach((pub) => {
                const mst = pub.track?.mediaStreamTrack;
                if (mst && mst.readyState === "live") {
                    tracks.push(mst.clone()); // clone so recorder stop ≠ LiveKit track stop
                }
            });
            if (tracks.length === 0) return false;

            const mimeTypes = [
                "video/webm;codecs=vp9,opus",
                "video/webm;codecs=vp8,opus",
                "video/webm",
                "video/mp4",
            ];
            const mimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";

            try {
                const stream = new MediaStream(tracks);
                const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
                chunksRef.current = [];
                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunksRef.current.push(e.data);
                };
                recorder.start(2000); // chunk every 2s
                recorderRef.current = recorder;
                startedRef.current = true;
                onRecordingStartRef.current();
                console.log("🔴 Local recording started:", mimeType || "default");
                return true;
            } catch (e) {
                console.error("MediaRecorder init failed:", e);
                return false;
            }
        };

        if (!tryStart()) {
            const interval = setInterval(() => {
                if (tryStart()) clearInterval(interval);
            }, 2000);
            return () => clearInterval(interval);
        }

        return () => {
            if (recorderRef.current && recorderRef.current.state !== "inactive") {
                recorderRef.current.stop();
            }
        };
    }, [localParticipant, isHost, stopFn]);

    return null;
}

// ─────────────────────────────────────────────────────────────
// RoomHeader
// ─────────────────────────────────────────────────────────────
function RoomHeader({
    roomName,
    isHost,
    id,
    isRecording,
    stopRecording,
}: {
    roomName: string;
    isHost: boolean;
    id: string;
    isRecording: boolean;
    stopRecording: () => Promise<void>;
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
            router.push("/dashboard/recordings");
            return;
        }

        setIsSaving(true);
        const lsToken = localStorage.getItem("accessToken");

        try {
            // 1️⃣ Stop local recording → browser auto-downloads the file
            if (isRecording) {
                await stopRecording();
            }

            // 2️⃣ Mark session as ended on backend (no video upload)
            await axios.post(
                buildApiUrl(`/api/live/${id}/end`),
                {},
                { headers: { Authorization: `Bearer ${lsToken}` } }
            );
        } catch (err) {
            console.error("Failed to end stream:", err);
        } finally {
            router.push("/dashboard/recordings");
        }
    };

    return (
        <header className="h-16 px-6 border-b border-white/10 flex flex-row items-center justify-between shrink-0 bg-zinc-950 z-50 relative">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-red-500/20 text-red-500 px-3 py-1.5 rounded-md text-sm font-bold">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    LIVE
                </div>
                <span className="font-semibold px-4 border-l border-white/10 text-zinc-300">
                    Room: {roomName || id}
                </span>

                {/* Recording indicator — only visible to host when recording */}
                {isHost && isRecording && (
                    <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-3 py-1 rounded-full text-xs font-semibold">
                        <Circle className="w-2.5 h-2.5 fill-rose-500 text-rose-500 animate-pulse" />
                        Recording locally
                    </div>
                )}
            </div>

            <div className="flex items-center gap-6">
                <button
                    onClick={handleShare}
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 rounded-lg font-medium text-indigo-400 transition-all border border-indigo-500/20 text-sm"
                >
                    <Share2 className="w-4 h-4" />
                    Share
                </button>
                <div className="flex items-center gap-2 text-zinc-400 font-semibold px-4 py-1.5 rounded-full bg-zinc-900 border border-zinc-800">
                    <Users className="w-4 h-4 text-indigo-400" />
                    <span>{viewerCount}</span>
                </div>
                <button
                    onClick={handleEndStream}
                    disabled={isSaving}
                    className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors border-none cursor-pointer disabled:opacity-50"
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Saving…
                        </>
                    ) : (
                        "End Podcast"
                    )}
                </button>
            </div>
        </header>
    );
}

// ─────────────────────────────────────────────────────────────
// StageLayout
// ─────────────────────────────────────────────────────────────
function StageLayout({ isBroadcaster }: { isBroadcaster: boolean }) {
    const allTracks = useTracks(
        [
            { source: Track.Source.Camera, withPlaceholder: true },
            { source: Track.Source.ScreenShare, withPlaceholder: false },
        ],
        { onlySubscribed: false }
    );

    const activeTracks = allTracks.filter((t) => {
        const p = t.participant;
        if (p.permissions?.canPublish) return true;
        if (p.isSpeaking) return true;
        return false;
    });

    return (
        <div className="flex-1 p-6 flex flex-col relative border-r border-white/10 bg-black/50 overflow-hidden">
            <GridLayout tracks={activeTracks} style={{ height: "calc(100% - 60px)", width: "100%" }}>
                <ParticipantTile />
            </GridLayout>

            {isBroadcaster && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
                    <ControlBar controls={{ camera: true, microphone: true, screenShare: true, leave: false, chat: false }} />
                </div>
            )}

            {!isBroadcaster && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50">
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
// GuestSocketListener
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
                alert("The host has muted your microphone forcefully.");
            }
        };
        socket.on("guest_removed", handleRemoved);
        socket.on("guest_muted", handleMuted);
        return () => {
            socket.off("guest_removed", handleRemoved);
            socket.off("guest_muted", handleMuted);
        };
    }, [socket, localParticipant]);

    return null;
}

// ─────────────────────────────────────────────────────────────
// GuestManager
// ─────────────────────────────────────────────────────────────
function GuestManager({ sessionId, isHost, socket }: { sessionId: string; isHost: boolean; socket: any }) {
    const [guests, setGuests] = useState<any[]>([]);

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
        const interval = setInterval(fetchGuests, 5000);
        return () => clearInterval(interval);
    }, [sessionId, isHost]);

    const handleMute = async (userId: string) => {
        try {
            const lsToken = localStorage.getItem("accessToken");
            await axios.post(
                buildApiUrl(`/api/stage/guest/${sessionId}/${userId}/mute`),
                { muted: true },
                { headers: { Authorization: `Bearer ${lsToken}` } }
            );
            if (socket) socket.emit("mute_guest", { guestId: userId });
        } catch (e) { console.error(e); }
    };

    const handleRemove = async (userId: string) => {
        try {
            const lsToken = localStorage.getItem("accessToken");
            await axios.delete(buildApiUrl(`/api/stage/guest/${sessionId}/${userId}`), {
                headers: { Authorization: `Bearer ${lsToken}` },
            });
            if (socket) socket.emit("remove_guest", { guestId: userId });
            fetchGuests();
        } catch (e) { console.error(e); }
    };

    if (!isHost) return null;

    return (
        <div className="p-4 border-b border-zinc-800">
            <h4 className="text-sm font-bold text-zinc-400 mb-2">Stage Guests</h4>
            {guests.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">No guests currently on stage.</p>
            ) : (
                <div className="flex flex-col gap-2">
                    {guests.map((g) => (
                        <div key={g.id} className="flex items-center justify-between bg-zinc-900 p-2 rounded-lg text-sm border border-white/5">
                            <span className="font-semibold text-white max-w-[120px] truncate" title={g.invitee?.unique_handle}>
                                @{g.invitee?.unique_handle}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleMute(g.invitee_id)}
                                    className="p-1.5 bg-zinc-800 rounded hover:bg-zinc-700 text-indigo-400"
                                    title="Mute Mic"
                                >
                                    <MicOff className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleRemove(g.invitee_id)}
                                    className="p-1.5 bg-red-500/10 rounded hover:bg-red-500/20 text-red-500"
                                    title="Remove from Stage"
                                >
                                    <PhoneOff className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
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

    // ── Local recording state ──────────────────────────────
    const [isRecording, setIsRecording] = useState(false);
    const stopRecordingRef = useRef<(() => Promise<void>) | null>(null);

    // Stage invite state
    const [inviteHandle, setInviteHandle] = useState("");
    const [receivedInvite, setReceivedInvite] = useState<any>(null);

    useEffect(() => {
        const initRoom = async () => {
            try {
                const lsToken = localStorage.getItem("accessToken");
                if (!lsToken) { router.push("/login"); return; }

                const wsUrl = await fetchLiveKitWsUrl();
                setLiveKitServerUrl(wsUrl);

                try {
                    const tokenAttempt = await axios.get(buildApiUrl(`/api/live/${id}/token`), {
                        headers: { Authorization: `Bearer ${lsToken}` },
                    });
                    setToken(tokenAttempt.data.token);
                    setRoomName(tokenAttempt.data.roomName);
                    setIsHost(!!tokenAttempt.data.isHost);
                    setPreJoinComplete(!tokenAttempt.data.isHost);
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
                    router.push("/dashboard");
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
        const handleInviteStatus = (data: any) => {
            alert(data.message);
            if (data.success) setInviteHandle("");
        };
        const handleInviteAccepted = (data: any) => {
            if (isHost) alert(`🎤 ${data.inviteeHandle} joined the stage!`);
        };
        const handleInviteRejected = (data: any) => {
            if (isHost) alert(`❌ ${data.inviteeHandle} declined your stage invite.`);
        };
        const handlePodcastEnded = () => {
            if (!isHost) {
                alert("The host has ended this podcast session.");
                router.push(`/watch/${id}`);
            }
        };

        socket.on("receive_invite", handleReceiveInvite);
        socket.on("invite_status", handleInviteStatus);
        socket.on("invite_accepted", handleInviteAccepted);
        socket.on("invite_rejected", handleInviteRejected);
        socket.on("podcast_ended", handlePodcastEnded);

        return () => {
            socket.off("receive_invite", handleReceiveInvite);
            socket.off("invite_status", handleInviteStatus);
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
                {/* 🔴 Background local recorder — host only, no server upload */}
                <LocalRecorder
                    isHost={isHost}
                    onRecorderReady={(fn) => { stopRecordingRef.current = fn; }}
                    onRecordingStart={() => setIsRecording(true)}
                />

                <div className="min-h-screen bg-black text-white flex flex-col w-full h-full">
                    {!isHost && onStage && <GuestSocketListener socket={socket} />}

                    <RoomHeader
                        roomName={roomName}
                        isHost={isHost}
                        id={id}
                        isRecording={isRecording}
                        stopRecording={async () => {
                            if (stopRecordingRef.current) await stopRecordingRef.current();
                        }}
                    />

                    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
                        {/* Left Stage */}
                        <StageLayout isBroadcaster={isBroadcaster} />

                        {/* Right Panel */}
                        <div className="w-full lg:w-96 bg-zinc-950 flex flex-col z-20">
                            <div className="py-4 border-b border-white/10 flex">
                                <h3 className="px-4 font-semibold">Live Chat & Controls</h3>
                            </div>

                            {isHost && (
                                <>
                                    <div className="p-4 border-b border-zinc-800">
                                        <h4 className="text-sm font-bold text-zinc-400 mb-2">Stage Invite</h4>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="@user_handle"
                                                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                                                value={inviteHandle}
                                                onChange={(e) => setInviteHandle(e.target.value)}
                                            />
                                            <button
                                                onClick={handleSendInvite}
                                                className="bg-indigo-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-500"
                                            >
                                                Invite
                                            </button>
                                        </div>
                                        <p className="text-xs text-zinc-600 mt-2">
                                            Enter the viewer's exact handle to pop an invite on their screen.
                                        </p>
                                    </div>
                                    <GuestManager sessionId={id} isHost={isHost} socket={socket} />
                                </>
                            )}

                            <div className="flex-1 overflow-hidden relative flex flex-col min-h-0 h-full">
                                <CustomChat socket={socket} sessionId={id} />
                            </div>
                        </div>
                    </div>
                </div>
            </LiveKitRoom>
        </>
    );
}
