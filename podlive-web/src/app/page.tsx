"use client";

import { useEffect, useState } from "react";
import { Mic, Radio, Users, Play, Video, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";

export default function Home() {
  const [lives, setLives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const fetchLives = async () => {
      try {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || "http://" + window.location.hostname + ":5005"}/api/live/active`);
        setLives(res.data);
      } catch (err) {
        console.error("Failed to fetch lives", err);
      } finally {
        setLoading(false);
      }
    };
    fetchLives();

    // Auto refresh every 10 seconds to keep the live list updated
    const interval = setInterval(fetchLives, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white selection:bg-indigo-500 selection:text-white pb-20">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight">PodLive</span>
          </Link>
          <div className="flex-1 max-w-lg mx-6">
            <form onSubmit={(e) => { e.preventDefault(); if (searchQuery.trim()) router.push(`/search?q=${searchQuery}`) }} className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search podcasts or creators..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors text-white"
              />
            </form>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Log in
            </Link>
            <Link
              href="/register"
              className="text-sm font-medium bg-white text-black px-4 py-2 rounded-full hover:bg-zinc-200 transition-colors"
            >
              Sign up
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-32 px-6">
        <div className="max-w-7xl mx-auto text-center mt-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-8">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-xs font-medium text-zinc-300">Har Awaaz Ko Ek Stage</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-zinc-500">
              Next-Generation
            </span>
            <br />
            Live Podcast Platform
          </h1>

          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10">
            Host ultra-low latency live streams. Invite any viewer to the stage instantly. Record and auto-upload your sessions easily.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-full font-semibold transition-all hover:scale-105 active:scale-95"
            >
              <Radio className="w-5 h-5" />
              Go Live Now
            </Link>
          </div>
        </div>

        {/* Live Podcasts Section */}
        <div className="max-w-7xl mx-auto mt-24">
          <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span>
              Live Now
            </h2>
            <Link href="/discover" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
              View All
            </Link>
          </div>

          {loading ? (
            <div className="text-zinc-500 flex items-center justify-center p-12 bg-white/5 rounded-2xl border border-white/10">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : lives.length === 0 ? (
            <div className="text-zinc-500 text-center p-12 bg-zinc-900/50 rounded-2xl border border-white/5">
              <Radio className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
              <h3 className="text-xl font-bold text-white mb-2">No active live sessions right now</h3>
              <p>Be the first to go live and start your podcast!</p>
              <Link href="/dashboard" className="inline-block mt-6 bg-indigo-600 px-6 py-3 rounded-full font-bold hover:bg-indigo-500 text-white transition-colors">
                Start Broadcasting
              </Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {lives.slice(0, 8).map((session) => (
                <div onClick={() => { window.location.href = `/live/${session.id}` }} key={session.id} className="group relative rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 cursor-pointer hover:border-indigo-500/50 transition-all hover:-translate-y-1">
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
                        <Play className="w-5 h-5 text-white ml-1" />
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-lg mb-1 truncate">{session.title}</h3>
                    <p className="text-zinc-400 text-sm truncate mb-4">{session.description || "Join the conversation"}</p>
                    <div onClick={(e) => { e.stopPropagation(); window.location.href = `/creator/${session.host?.id || "1"}`; }} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                        <span className="text-xs font-bold text-white uppercase">{session.host?.username?.charAt(0) || "H"}</span>
                      </div>
                      <span className="text-sm font-medium text-zinc-300 truncate hover:text-indigo-400">@{session.host?.unique_handle || session.host?.username}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Features Preview */}
        <div className="max-w-7xl mx-auto mt-24 grid md:grid-cols-3 gap-8">
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center mb-6">
              <Radio className="w-6 h-6 text-indigo-400" />
            </div>
            <h3 className="text-xl font-bold mb-3">Ultra-Low Latency</h3>
            <p className="text-zinc-400">Powered by WebRTC, get sub-second latency for true real-time interactions with your audience.</p>
          </div>
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mb-6">
              <Users className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-bold mb-3">Audience to Stage</h3>
            <p className="text-zinc-400">Invite anyone from your viewers to join the stage live as a speaker with a single click.</p>
          </div>
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center mb-6">
              <Video className="w-6 h-6 text-orange-400" />
            </div>
            <h3 className="text-xl font-bold mb-3">Auto Recording</h3>
            <p className="text-zinc-400">Your live streams are automatically recorded in high quality and published to your profile.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
