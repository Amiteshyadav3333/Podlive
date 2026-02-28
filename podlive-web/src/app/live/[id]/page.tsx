"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Mic, MicOff, VideoIcon, VideoOff, Users, MessageSquare, PhoneOff, Settings, Loader2 } from "lucide-react";
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
    useChat
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import axios from "axios";
import { useSocket } from "@/providers/SocketProvider";

function RoomHeader({ roomName, isHost, id }: { roomName: string, isHost: boolean, id: string }) {
    const router = useRouter();
    const participants = useParticipants();
    const viewerCount = Math.max(0, participants.length - 1);

    const [isSaving, setIsSaving] = useState(false);

    const handleEndStream = async () => {
        if (!isHost) {
            router.push("/dashboard/recordings");
            return;
        }

        setIsSaving(true);
        const lsToken = localStorage.getItem("accessToken");

        try {
            await axios.post(`${process.env.NEXT_PUBLIC_API_URL || "http://" + window.location.hostname + ":5005"}/api/live/${id}/end`, {}, {
                headers: { Authorization: `Bearer ${lsToken}` }
            });

            if (window.confirm("Podcast Ended! Do you want to upload a high-quality local recording of this video now?")) {
                router.push(`/dashboard/upload?sessionId=${id}`);
            } else {
                router.push("/dashboard/recordings");
            }
        } catch (err) {
            console.error('Failed to end stream', err);
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
                <span className="font-semibold px-4 border-l border-white/10 text-zinc-300">Room: {roomName || id}</span>
            </div>

            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-zinc-400 font-semibold px-4 py-1.5 rounded-full bg-zinc-900 border border-zinc-800">
                    <Users className="w-4 h-4 text-indigo-400" />
                    <span>{viewerCount}</span>
                </div>
                <button
                    onClick={handleEndStream}
                    disabled={isSaving}
                    className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors border-none cursor-pointer disabled:opacity-50">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "End Podcast"}
                </button>
            </div>
        </header>
    );
}

function StageLayout({ isBroadcaster }: { isBroadcaster: boolean }) {
    const allTracks = useTracks(
        [
            { source: Track.Source.Camera, withPlaceholder: true },
            { source: Track.Source.ScreenShare, withPlaceholder: false },
        ],
        { onlySubscribed: false }
    );

    // Filter out viewers from rendering as ghost dummy boxes on the main stage
    const activeTracks = allTracks.filter((t) => {
        const p = t.participant;
        // Easiest is to only show participants who actually have publish permissions (is a host/guest via token).
        if (p.permissions?.canPublish) return true;
        // Or if they managed to sneak in audio/video somehow.
        if (p.isSpeaking) return true;
        return false;
    });

    return (
        <div className="flex-1 p-6 flex flex-col relative border-r border-white/10 bg-black/50 overflow-hidden">
            <GridLayout tracks={activeTracks} style={{ height: 'calc(100% - 60px)', width: '100%' }}>
                <ParticipantTile />
            </GridLayout>

            {isBroadcaster && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
                    <ControlBar controls={{ camera: true, microphone: true, screenShare: true, leave: false, chat: false }} />
                </div>
            )}

            {/* Viewer Audio Playback Required Override */}
            {!isBroadcaster && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50">
                    <StartAudio label="Click here to Hear Podcast 🔈" className="bg-indigo-600 px-6 py-3 rounded-full font-bold shadow-2xl hover:bg-indigo-500 cursor-pointer text-white animate-bounce" />
                </div>
            )}

            <RoomAudioRenderer />
        </div>
    );
}

function CustomChat({ socket, sessionId }: { socket: any, sessionId: string }) {
    const [chatMessages, setChatMessages] = useState<any[]>([]);
    const [message, setMessage] = useState("");
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        if (!socket) return;

        socket.emit('join_chat_room', sessionId);

        const handleReceiveChat = (data: any) => {
            setChatMessages(prev => [...prev, data]);
        };

        socket.on('receive_chat_message', handleReceiveChat);

        return () => {
            socket.emit('leave_chat_room', sessionId);
            socket.off('receive_chat_message', handleReceiveChat);
        };
    }, [socket, sessionId]);

    const handleSend = () => {
        if (!message.trim() || isSending || !socket) return;
        setIsSending(true);

        const userData = localStorage.getItem('user');
        const user = userData ? JSON.parse(userData) : null;

        socket.emit('send_chat_message', {
            sessionId,
            senderHandle: user?.unique_handle || 'Anonymous',
            message: message.trim()
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
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSend();
                        }}
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

function GuestManager({ sessionId, isHost }: { sessionId: string, isHost: boolean }) {
    const [guests, setGuests] = useState<any[]>([]);

    const fetchGuests = async () => {
        try {
            const lsToken = localStorage.getItem("accessToken");
            if (!lsToken) return;
            const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || "http://" + window.location.hostname + ":5005"}/api/stage/${sessionId}/guests`, {
                headers: { Authorization: `Bearer ${lsToken}` }
            });
            setGuests(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        if (!isHost) return;
        fetchGuests();
        const interval = setInterval(fetchGuests, 5000); // refresh every 5s
        return () => clearInterval(interval);
    }, [sessionId, isHost]);

    const handleMute = async (userId: string) => {
        try {
            const lsToken = localStorage.getItem("accessToken");
            await axios.post(`${process.env.NEXT_PUBLIC_API_URL || "http://" + window.location.hostname + ":5005"}/api/stage/guest/${sessionId}/${userId}/mute`, { muted: true }, {
                headers: { Authorization: `Bearer ${lsToken}` }
            });
            alert("Muted guest successfully. (They will be muted instantly)");
        } catch (e) { console.error(e) }
    };

    const handleRemove = async (userId: string) => {
        try {
            const lsToken = localStorage.getItem("accessToken");
            await axios.delete(`${process.env.NEXT_PUBLIC_API_URL || "http://" + window.location.hostname + ":5005"}/api/stage/guest/${sessionId}/${userId}`, {
                headers: { Authorization: `Bearer ${lsToken}` }
            });
            alert("Guest removed from stage.");
            fetchGuests();
        } catch (e) { console.error(e) }
    };

    if (!isHost) return null;

    return (
        <div className="p-4 border-b border-zinc-800">
            <h4 className="text-sm font-bold text-zinc-400 mb-2">Stage Guests</h4>
            {guests.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">No guests currently on stage.</p>
            ) : (
                <div className="flex flex-col gap-2">
                    {guests.map(g => (
                        <div key={g.id} className="flex items-center justify-between bg-zinc-900 p-2 rounded-lg text-sm border border-white/5">
                            <span className="font-semibold text-white max-w-[120px] truncate" title={g.invitee?.unique_handle}>
                                @{g.invitee?.unique_handle}
                            </span>
                            <div className="flex items-center gap-2">
                                <button onClick={() => handleMute(g.invitee_id)} className="p-1.5 bg-zinc-800 rounded hover:bg-zinc-700 text-indigo-400" title="Mute Mic">
                                    <MicOff className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleRemove(g.invitee_id)} className="p-1.5 bg-red-500/10 rounded hover:bg-red-500/20 text-red-500" title="Remove from Stage">
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

export default function LiveRoom() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { socket } = useSocket();

    const [token, setToken] = useState("");
    const [roomName, setRoomName] = useState("");
    const [loading, setLoading] = useState(true);
    const [isHost, setIsHost] = useState(false);
    const [onStage, setOnStage] = useState(false); // viewers who have accepted the invite
    const [preJoinComplete, setPreJoinComplete] = useState(false);

    // Stage Invites State
    const [inviteHandle, setInviteHandle] = useState("");
    const [receivedInvite, setReceivedInvite] = useState<any>(null); // For viewers

    useEffect(() => {
        const initRoom = async () => {
            try {
                const lsToken = localStorage.getItem("accessToken");
                if (!lsToken) {
                    router.push("/login");
                    return;
                }

                try {
                    // Try to start as host first
                    const hostAttempt = await axios.post(`${process.env.NEXT_PUBLIC_API_URL || "http://" + window.location.hostname + ":5005"}/api/live/${id}/start`, {}, {
                        headers: { Authorization: `Bearer ${lsToken}` }
                    });
                    setToken(hostAttempt.data.token);
                    setRoomName(hostAttempt.data.roomName);
                    setIsHost(true);
                } catch (hostError: any) {
                    // If forbidden, join as viewer
                    if (hostError.response?.status === 403) {
                        try {
                            const viewerAttempt = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || "http://" + window.location.hostname + ":5005"}/api/live/${id}/token`, {
                                headers: { Authorization: `Bearer ${lsToken}` }
                            });
                            setToken(viewerAttempt.data.token);
                            setRoomName(viewerAttempt.data.roomName);
                            setIsHost(false);
                            setPreJoinComplete(true);
                        } catch (viewerError) {
                            console.error("Failed to get viewer token", viewerError);
                            router.push("/dashboard");
                        }
                    } else {
                        console.error("Failed to get host token", hostError);
                        router.push("/dashboard");
                    }
                }

            } catch (err) {
                console.error("Init room error", err);
                router.push("/dashboard");
            } finally {
                setLoading(false);
            }
        };

        initRoom();
    }, [id, router]);

    // Handle incoming socket events
    useEffect(() => {
        if (!socket) return;

        // Ensure user is registered for socket events even if SocketProvider mounted before login
        const userData = localStorage.getItem('user');
        if (userData) {
            const user = JSON.parse(userData);
            socket.emit('register_user', user.id);
        }

        const handleReceiveInvite = (data: any) => {
            if (data.sessionId === id) {
                setReceivedInvite(data);
            }
        };

        const handleInviteStatus = (data: any) => {
            alert(data.message);
            if (data.success) {
                setInviteHandle("");
            }
        };

        const handleInviteAccepted = (data: any) => {
            if (isHost) alert(`🎤 ${data.inviteeHandle} joined the stage!`);
        };

        const handleInviteRejected = (data: any) => {
            if (isHost) alert(`❌ ${data.inviteeHandle} declined your stage invite.`);
        };

        socket.on('receive_invite', handleReceiveInvite);
        socket.on('invite_status', handleInviteStatus);
        socket.on('invite_accepted', handleInviteAccepted);
        socket.on('invite_rejected', handleInviteRejected);

        return () => {
            socket.off('receive_invite', handleReceiveInvite);
            socket.off('invite_status', handleInviteStatus);
            socket.off('invite_accepted', handleInviteAccepted);
            socket.off('invite_rejected', handleInviteRejected);
        };
    }, [socket, id, isHost]);

    const handleSendInvite = () => {
        if (!inviteHandle || !socket) return;

        const userData = localStorage.getItem('user');
        const user = userData ? JSON.parse(userData) : null;

        socket.emit('send_invite', {
            sessionId: id,
            inviteeHandle: inviteHandle,
            hostId: user.id
        });
    };

    const handleAcceptInvite = async () => {
        try {
            const lsToken = localStorage.getItem("accessToken");
            if (!lsToken) return;

            // Call the created upgrade route to get a new publish-enabled token
            const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || "http://" + window.location.hostname + ":5005"}/api/live/${id}/upgrade`, {
                headers: { Authorization: `Bearer ${lsToken}` }
            });

            setToken(res.data.token);
            setOnStage(true);
            setPreJoinComplete(false); // Make them go through camera prep before pushing them online

            if (socket) {
                const userData = localStorage.getItem('user');
                const user = userData ? JSON.parse(userData) : null;
                socket.emit('accept_invite', {
                    sessionId: id,
                    hostId: receivedInvite?.host?.id,
                    inviteeHandle: user?.unique_handle
                });
            }

            setReceivedInvite(null);

        } catch (err) {
            console.error("Failed to upgrade token and join stage", err);
            alert("Failed to join the stage.");
        }
    }

    if (loading || !token) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-zinc-400">Connecting to PodLive Server...</p>
            </div>
        );
    }

    // Is Broadcaster (Host or Stage Guest)
    const isBroadcaster = isHost || onStage;

    if (isBroadcaster && !preJoinComplete) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white" data-lk-theme="default">
                <h2 className="text-2xl font-bold mb-6">Camera & Microphone Setup</h2>
                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-[500px]">
                    <PreJoin
                        onSubmit={() => setPreJoinComplete(true)}
                        onValidate={() => true}
                    />
                </div>
            </div>
        );
    }

    return (
        <>
            {/* Stage Invite Modal logic */}
            {receivedInvite && !onStage && (
                <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-indigo-500/30 p-8 rounded-2xl max-w-sm text-center">
                        <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Mic className="text-indigo-500 w-8 h-8" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Stage Invite</h2>
                        <p className="text-zinc-400 mb-8">
                            The host has invited you to join the stage. You can turn on your mic and camera to speak to the audience.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    if (socket) {
                                        const userData = localStorage.getItem('user');
                                        const user = userData ? JSON.parse(userData) : null;
                                        socket.emit('reject_invite', {
                                            sessionId: id,
                                            hostId: receivedInvite?.host?.id,
                                            inviteeHandle: user?.unique_handle
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
                serverUrl={typeof window !== 'undefined' ? `ws://${window.location.hostname}:7880` : ''}
                data-lk-theme="default"
                style={{ height: "100vh", display: 'flex', flexDirection: 'column', backgroundColor: '#000' }}
            >
                <div className="min-h-screen bg-black text-white flex flex-col w-full h-full">
                    <RoomHeader roomName={roomName} isHost={isHost} id={id} />

                    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
                        {/* Left Stage */}
                        <StageLayout isBroadcaster={isBroadcaster} />

                        {/* Right Side */}
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
                                        <p className="text-xs text-zinc-600 mt-2">Enter the viewer's exact handle to pop an invite on their screen.</p>
                                    </div>
                                    <GuestManager sessionId={id} isHost={isHost} />
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
