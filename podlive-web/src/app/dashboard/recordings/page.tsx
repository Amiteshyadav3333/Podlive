"use client";

import { useEffect, useState } from "react";
import { Video, Play, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Recordings() {
    const router = useRouter();
    const [recordings, setRecordings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchRecordings();
    }, []);

    const fetchRecordings = async () => {
        try {
            const token = localStorage.getItem("accessToken");
            if (!token) {
                router.push("/login");
                return;
            }

            const res = await fetch(`http://${window.location.hostname}:5005/api/user/recordings`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setRecordings(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevents triggering the card click
        if (confirm("Are you sure you want to delete this podcast video? This action cannot be undone.")) {
            try {
                const token = localStorage.getItem("accessToken");
                if (!token) return;

                const res = await fetch(`http://${window.location.hostname}:5005/api/live/${id}`, {
                    method: 'DELETE',
                    headers: { "Authorization": `Bearer ${token}` }
                });

                if (res.ok) {
                    setRecordings(prev => prev.filter(rec => rec.id !== id));
                    alert("Video deleted successfully.");
                } else {
                    const data = await res.json();
                    alert(data.error || "Failed to delete video");
                }
            } catch (error) {
                console.error("Delete error:", error);
            }
        }
    };

    return (
        <div className="md:ml-64 p-8 max-w-5xl min-h-screen">
            <header className="mb-10 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight mb-2 text-white">My Recordings</h1>
                    <p className="text-zinc-400">View and manage your past live streams and podcasts.</p>
                </div>
                <button onClick={() => router.push('/dashboard')} className="px-4 py-2 border border-zinc-700 rounded-lg hover:bg-zinc-800 text-white transition-colors">
                    Back to Live Setup
                </button>
            </header>

            {loading ? (
                <div className="flex items-center justify-center p-12">
                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                </div>
            ) : recordings.length === 0 ? (
                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[400px]">
                    <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center mb-6">
                        <Video className="w-8 h-8 text-indigo-400" />
                    </div>
                    <h2 className="text-xl font-semibold text-white mb-2">No recordings yet</h2>
                    <p className="text-zinc-400 max-w-sm mb-6">
                        When you broadcast a live session, it will be automatically recorded and appear here.
                    </p>
                    <button onClick={() => router.push('/dashboard')} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-medium transition-colors">
                        <Play className="w-4 h-4" />
                        Start First Broadcast
                    </button>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recordings.map((recording, i) => (
                        <div key={recording.id} onClick={() => router.push(`/watch/${recording.id}`)} className="bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden hover:border-indigo-500/50 transition-colors cursor-pointer group">
                            <div className="aspect-video bg-zinc-800 relative">
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-black/40 transition-opacity">
                                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                                        <Play className="text-black w-5 h-5 ml-1" />
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => handleDelete(recording.id, e)}
                                    className="absolute top-3 right-3 p-2 bg-red-600/90 text-white rounded-lg hover:bg-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                    title="Delete Recording"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="p-4">
                                <h3 className="font-semibold text-white truncate text-lg">{recording.title}</h3>
                                <p className="text-sm text-zinc-400 mb-3">{recording.ended_at ? new Date(recording.ended_at).toLocaleDateString() : 'Unknown date'}</p>
                                <div className="flex justify-between items-center text-xs font-medium">
                                    <span className="bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded-md">{recording.category || 'General'}</span>
                                    <span className="text-zinc-500">{recording.viewer_count_peak} peak viewers</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
