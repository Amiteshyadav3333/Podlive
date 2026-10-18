"use client";

import { useEffect, useState } from "react";
import { Mic, Search, Play, Users, Radio, ChevronRight, Home, Compass, Video, BookOpen, Menu, Bell, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import axios from "axios";
import { buildApiUrl } from "@/lib/api";

const CATEGORIES = ["All", "Technology", "Music", "Comedy", "Education", "Finance", "Gaming", "General"];

type LiveSession = {
  id: string;
  title: string;
  thumbnail_url?: string | null;
  category?: string | null;
  viewer_count_peak?: number;
  host?: { id?: string; avatar_url?: string | null; display_name?: string; unique_handle?: string; username?: string };
};

function avatarFor(session: LiveSession) {
  const name = session.host?.display_name || "PodLive creator";
  return session.host?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=292524&color=fff`;
}

export default function Discover() {
  const router = useRouter();
  const [lives, setLives] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  useEffect(() => {
    let mounted = true;
    const loadLives = async () => {
      try {
        const response = await axios.get(buildApiUrl("/api/live/active"));
        if (mounted) setLives(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error("Unable to load live streams", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadLives();
    const interval = window.setInterval(loadLives, 15000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, []);

  const filtered = lives.filter((live) => {
    const categoryMatches = activeCategory === "All" || live.category === activeCategory;
    const query = searchQuery.trim().toLowerCase();
    const searchMatches = !query || live.title.toLowerCase().includes(query) ||
      live.host?.unique_handle?.toLowerCase().includes(query) || live.host?.display_name?.toLowerCase().includes(query);
    return categoryMatches && searchMatches;
  });

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-white/[.07] bg-[#0f0f0f]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-[1600px] items-center gap-5 px-4 sm:px-6">
          <button aria-label="Open menu" className="hidden size-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10 md:flex"><Menu className="size-5" /></button>
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="PodLive home">
            <span className="grid size-9 place-items-center rounded-xl bg-red-600"><Mic className="size-5" /></span>
            <span className="text-lg font-extrabold tracking-tight">PodLive</span>
            <span className="-mt-3 text-[10px] text-zinc-500">IN</span>
          </Link>
          <form onSubmit={(event) => { event.preventDefault(); if (searchQuery.trim()) router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`); }} className="mx-auto flex w-full max-w-2xl">
            <label className="relative flex min-w-0 flex-1">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search live streams and creators" className="h-11 w-full rounded-l-full border border-white/15 bg-[#121212] pl-11 pr-4 text-sm outline-none transition focus:border-sky-500" />
            </label>
            <button className="grid h-11 w-16 shrink-0 place-items-center rounded-r-full border border-l-0 border-white/15 bg-white/[.07] hover:bg-white/[.12]" aria-label="Search"><Search className="size-5" /></button>
          </form>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link href="/dashboard/setup" className="hidden h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold hover:bg-white/15 sm:flex"><Plus className="size-4" />Create</Link>
            <Link href="/dashboard" aria-label="Creator studio" className="grid size-10 place-items-center rounded-full hover:bg-white/10"><Bell className="size-5" /></Link>
            <Link href="/login" className="grid size-9 place-items-center rounded-full bg-sky-700 text-sm font-bold" aria-label="Sign in">P</Link>
          </div>
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-16 z-40 hidden w-[224px] border-r border-white/[.07] bg-[#0f0f0f] px-3 py-5 md:block">
        <nav className="space-y-1">
          {[[Home, "Home", "/"], [Compass, "Discover", "/discover"], [Radio, "Live", "/discover"], [Video, "Videos", "/"], [BookOpen, "Courses", "/courses"]].map(([Icon, label, href]) => {
            const NavIcon = Icon as typeof Home;
            return <Link key={String(label)} href={String(href)} className={`flex h-11 items-center gap-5 rounded-xl px-4 text-sm ${label === "Discover" ? "bg-white/10 font-semibold" : "text-zinc-300 hover:bg-white/[.08]"}`}><NavIcon className="size-5" />{String(label)}</Link>;
          })}
        </nav>
        <div className="my-5 border-t border-white/[.1]" />
        <div className="px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Your space</div>
        <Link href="/dashboard" className="mt-2 flex h-11 items-center gap-5 rounded-xl px-4 text-sm text-zinc-300 hover:bg-white/[.08]"><Users className="size-5" />Creator studio</Link>
        <div className="absolute inset-x-6 bottom-6 rounded-2xl border border-white/[.08] bg-gradient-to-br from-red-500/15 to-transparent p-4">
          <Sparkles className="size-5 text-red-300" />
          <p className="mt-3 text-sm font-bold">Your voice, live</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">Start a conversation with your community.</p>
          <Link href="/dashboard/setup" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-red-300">Set up a stream <ChevronRight className="size-3" /></Link>
        </div>
      </aside>

      <main className="mx-auto max-w-[1600px] px-4 pb-16 pt-20 sm:px-6 md:ml-[224px] md:px-8">
        <div className="sticky top-16 z-30 -mx-4 border-b border-white/[.06] bg-[#0f0f0f]/95 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
          <div className="scrollbar-hide flex gap-3 overflow-x-auto">
            {CATEGORIES.map((category) => <button key={category} onClick={() => setActiveCategory(category)} className={`rounded-lg px-3.5 py-2 text-sm font-medium whitespace-nowrap transition ${activeCategory === category ? "bg-white text-black" : "bg-white/[.08] text-zinc-200 hover:bg-white/[.14]"}`}>{category}</button>)}
          </div>
        </div>

        <section className="pb-6 pt-7">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-red-300"><span className="size-2 rounded-full bg-red-500" /> happening now</p><h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Live conversations</h1><p className="mt-1 text-sm text-zinc-400">Join creators and communities streaming right now.</p></div>
            <span className="hidden rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400 sm:inline-flex">{filtered.length} {filtered.length === 1 ? "stream" : "streams"}</span>
          </div>

          {loading ? <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index}><div className="aspect-video animate-pulse rounded-2xl bg-white/[.08]" /><div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-white/[.08]" /></div>)}</div>
            : filtered.length === 0 ? <div className="rounded-3xl border border-white/[.08] bg-[#161616] px-6 py-16 text-center sm:py-20"><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-white/[.06]"><Radio className="size-7 text-zinc-400" /></div><h2 className="mt-5 text-xl font-bold">{lives.length ? "No streams match those filters" : "It’s quiet on stage right now"}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">{lives.length ? "Try a different category or search for another creator." : "Check back soon, or kick things off and invite your community to join."}</p><Link href="/dashboard/setup" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black hover:bg-zinc-200">Start a live stream <ChevronRight className="size-4" /></Link></div>
              : <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{filtered.map((session) => <article key={session.id} onClick={() => router.push(`/live/${session.id}`)} className="group min-w-0 cursor-pointer">
                <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#242424] ring-1 ring-white/[.08] transition group-hover:ring-white/25">
                  {session.thumbnail_url ? <Image unoptimized fill sizes="(max-width: 640px) 100vw, (max-width: 1200px) 50vw, 25vw" src={session.thumbnail_url} alt="" className="object-cover transition duration-500 group-hover:scale-[1.04]" /> : <div className="grid size-full place-items-center bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-red-950 via-[#211b1c] to-[#111111]"><Radio className="size-10 text-white/40" /></div>}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1 text-[10px] font-extrabold tracking-wide"><span className="size-1.5 animate-pulse rounded-full bg-white" />LIVE</span>
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold backdrop-blur"><Users className="size-3.5" />{session.viewer_count_peak || 0}</span>
                  {session.category && <span className="absolute bottom-3 left-3 rounded-md bg-black/65 px-2 py-1 text-[11px] font-medium backdrop-blur">{session.category}</span>}
                  <span className="absolute bottom-3 right-3 grid size-10 translate-y-2 place-items-center rounded-full bg-white text-black opacity-0 shadow-xl transition group-hover:translate-y-0 group-hover:opacity-100"><Play className="ml-0.5 size-4 fill-current" /></span>
                </div>
                <div className="mt-3 flex gap-3">
                  <Image unoptimized width={40} height={40} src={avatarFor(session)} alt="" className="size-10 shrink-0 rounded-full bg-zinc-800 object-cover" />
                  <div className="min-w-0 flex-1"><h2 className="line-clamp-2 text-[15px] font-bold leading-5 group-hover:text-red-200">{session.title}</h2><Link onClick={(event) => event.stopPropagation()} href={session.host?.id ? `/creator/${session.host.id}` : "/discover"} className="mt-1 block truncate text-[13px] text-zinc-400 hover:text-white">{session.host?.display_name || session.host?.unique_handle || "PodLive creator"}{session.host?.unique_handle ? ` · @${session.host.unique_handle}` : ""}</Link><p className="mt-1 text-xs text-zinc-500">Streaming now · {session.viewer_count_peak || 0} watching</p></div>
                </div>
              </article>)}</div>}
        </section>
      </main>
    </div>
  );
}
