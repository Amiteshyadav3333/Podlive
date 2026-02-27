"use client";

import { useEffect, useState } from "react";
import { Mic, Radio, Settings, Users, Video, Home as HomeIcon, Play, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";

export default function DashboardHome() {
    const router = useRouter();
    const [lives, setLives] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

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
        const interval = setInterval(fetchLives, 10000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-zinc-950 text-white selection:bg-indigo-500 selection:text-white">
            {/* Sidebar */}
            <aside className="fixed left-0 top-0 h-screen w-64 border-r border-white/10 bg-black/50 p-6 flex flex-col hidden md:flex z-50">
                <div className="flex items-center gap-2 mb-12">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                        <Mic className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-bold text-xl tracking-tight">PodLive</span>
                </div>

                <nav className="flex-1 space-y-2">
                    <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 rounded-lg bg-indigo-500/10 text-indigo-400 font-medium transition-colors">
                        <HomeIcon className="w-5 h-5" />
                        Home
                    </Link>
                    <Link href="/dashboard/setup" className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-medium transition-colors">
                        <Radio className="w-5 h-5" />
                        Live Setup
                    </Link>
                    <Link href="/dashboard/upload" className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-medium transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        Upload Video
                    </Link>
                    <Link href="/dashboard/recordings" className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-medium transition-colors">
                        <Video className="w-5 h-5" />
                        My Recordings
                    </Link>
                    <Link href="/dashboard/audience" className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-medium transition-colors">
                        <Users className="w-5 h-5" />
                        Audience
                    </Link>
                </nav>

                <div className="pt-6 border-t border-white/10 mt-auto">
                    <Link href="/dashboard/settings" className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-medium transition-colors">
                        <Settings className="w-5 h-5" />
                        Settings
                    </Link>
                </div>
            </aside>

            {/* Main Content */}
            <main className="md:ml-64 p-8 max-w-6xl">
                <header className="mb-10 flex md:flex-row flex-col items-start md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight mb-2">Home Feed</h1>
                        <p className="text-zinc-400">Discover active live podcasts and join the conversation.</p>
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); if (searchQuery.trim()) router.push(`/search?q=${searchQuery}`) }} className="relative w-full md:w-auto md:min-w-[300px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search platform..."
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors text-white"
                        />
                    </form>
                </header>

                {loading ? (
                    <div className="flex items-center justify-center p-20">
                        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
                    </div>
                ) : lives.length === 0 ? (
                    <div className="bg-zinc-900 border border-white/10 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
                        <Radio className="w-12 h-12 mb-4 text-zinc-600" />
                        <h2 className="text-2xl font-bold text-white mb-2">No Podcasts Are Live Right Now</h2>
                        <p className="text-zinc-400 max-w-md mb-6">
                            Be the first one to host a podcast and gather an audience!
                        </p>
                        <button onClick={() => router.push('/dashboard/setup')} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-medium transition-colors">
                            <Radio className="w-5 h-5" />
                            Start Broadcasting
                        </button>
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {lives.map((session) => (
                            <div onClick={() => router.push(`/live/${session.id}`)} key={session.id} className="group relative rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 cursor-pointer hover:border-indigo-500/50 transition-all hover:-translate-y-1">
                                <div className="aspect-video bg-zinc-800 relative">
                                    <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                                        LIVE
                                    </div>
                                    <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1">
                                        <Users className="w-3 h-3" />
                                        {session.viewer_count_peak || 0}
                                    </div>
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                                            <Play className="w-5 h-5 text-black ml-1" />
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4">
                                    <h3 className="font-bold text-lg mb-1 truncate group-hover:text-indigo-400 transition-colors">{session.title}</h3>
                                    <p className="text-zinc-400 text-sm truncate mb-4">{session.description || "Join the conversation"}</p>
                                    <div onClick={(e) => { e.stopPropagation(); router.push(`/creator/${session.host?.id || "1"}`); }} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                                        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                                            <span className="text-xs font-bold text-white uppercase">{session.host?.username?.charAt(0) || "H"}</span>
                                        </div>
                                        <span className="text-sm font-medium text-zinc-300 truncate hover:text-indigo-400">
                                            @{session.host?.username || session.host?.unique_handle || "host"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
