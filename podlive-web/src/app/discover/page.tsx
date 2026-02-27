"use client";

import { useEffect, useState } from "react";
import { Mic, Search, Play, Users } from "lucide-react";
import Link from "next/link";
import axios from "axios";

export default function Discover() {
    const [lives, setLives] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLives = async () => {
            try {
                const res = await axios.get(`http://${window.location.hostname}:5005/api/live/active`);
                setLives(res.data);
            } catch (err) {
                console.error("Failed to fetch lives", err);
            } finally {
                setLoading(false);
            }
        };

        fetchLives();
    }, []);

    return (
        <div className="min-h-screen bg-zinc-950 text-white selection:bg-indigo-500 selection:text-white">
            {/* Navbar */}
            <nav className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/50 backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                            <Mic className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-bold text-xl tracking-tight">PodLive</span>
                    </Link>
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="text-sm font-medium bg-white text-black px-4 py-2 rounded-full hover:bg-zinc-200 transition-colors">
                            Go Live
                        </Link>
                    </div>
                </div>
            </nav>

            <main className="pt-32 pb-16 px-6 max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight mb-2">Discover Lives</h1>
                        <p className="text-zinc-400">Find and join interesting live podcasts right now.</p>
                    </div>

                    <div className="relative w-full md:w-96">
                        <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-zinc-500">
                            <Search className="w-5 h-5" />
                        </span>
                        <input
                            type="text"
                            placeholder="Search podcasts or hosts..."
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-12 pr-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                    </div>
                </div>

                {/* Categories */}
                <div className="flex overflow-x-auto gap-3 pb-4 mb-8 scrollbar-hide">
                    {['All', 'Technology', 'Music', 'Comedy', 'Education', 'Gaming', 'Business'].map((cat) => (
                        <button key={cat} className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${cat === 'All' ? 'bg-white text-black' : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'}`}>
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Live Grid */}
                {loading ? (
                    <div className="text-zinc-500 flex items-center justify-center p-12">
                        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : lives.length === 0 ? (
                    <div className="text-zinc-500 text-center p-12 bg-zinc-900/50 rounded-2xl border border-white/5">
                        <Users className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
                        <h3 className="text-xl font-bold text-white mb-2">No active live sessions right now</h3>
                        <p>Be the first to go live and start your podcast!</p>
                        <Link href="/dashboard" className="inline-block mt-6 bg-indigo-600 px-6 py-3 rounded-full font-bold hover:bg-indigo-500 transition-colors">
                            Start Broadcasting
                        </Link>
                    </div>
                ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {lives.map((session) => (
                            <Link href={`/live/${session.id}`} key={session.id} className="group relative rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 cursor-pointer hover:border-indigo-500/50 transition-all">
                                <div className="aspect-video bg-zinc-800 relative">
                                    <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                                        LIVE
                                    </div>
                                    <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1">
                                        <Users className="w-3 h-3" />
                                        {session.viewer_count_peak || 0}
                                    </div>
                                    {/* Play overlay on hover */}
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                                            <Play className="w-5 h-5 text-black ml-1" />
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4">
                                    <h3 className="font-bold text-lg mb-1 truncate">{session.title}</h3>
                                    <p className="text-zinc-400 text-sm truncate mb-4">{session.description || "Join the conversation"}</p>
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500"></div>
                                        <span className="text-sm font-medium text-zinc-300 truncate">@{session.host.unique_handle}</span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
