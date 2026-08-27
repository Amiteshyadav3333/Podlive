"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock3, Eye, Loader2, Play, Radio, Search, TrendingUp, Upload, Users, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { buildApiUrl } from "@/lib/api";
import DashboardSidebar from "@/components/DashboardSidebar";

interface Creator { id: string; display_name?: string; unique_handle?: string; avatar_url?: string | null }
interface LivePodcast { id: string; title: string; thumbnail_url?: string | null; viewer_count?: number; viewer_count_peak?: number; host?: Creator }
interface FeedVideo { id: string; title: string; thumbnail?: string | null; duration_seconds?: number | null; views: string | number; upload_date: string; owner?: Creator; category?: { name?: string; slug?: string } | null }
interface AudienceStats { followers?: number; totalViews?: string | number; totalLives?: number }
interface StoredUser { display_name?: string; avatar_url?: string | null }

const avatarFor = (creator?: Creator | StoredUser | null) => creator?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(creator?.display_name || "U")}&background=6366f1&color=fff`;
const duration = (seconds?: number | null) => !seconds ? "" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function VideoCard({ video, prominent = false }: { video: FeedVideo; prominent?: boolean }) {
  return <Link href={`/watch/${video.id}`} className="group min-w-0"><div className={`relative overflow-hidden rounded-2xl border border-white/[.07] bg-zinc-900 ${prominent ? "aspect-[16/10]" : "aspect-video"}`}>{video.thumbnail ? <Image unoptimized fill sizes={prominent ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 640px) 100vw, 33vw"} src={video.thumbnail} alt={video.title} className="object-cover transition duration-500 group-hover:scale-105"/> : <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10"><Video className="size-10 text-white/20"/></div>}<div className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/35"><span className="grid size-12 scale-75 place-items-center rounded-full bg-white text-black opacity-0 transition group-hover:scale-100 group-hover:opacity-100"><Play className="size-5 fill-current"/></span></div>{video.duration_seconds ? <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold">{duration(video.duration_seconds)}</span> : null}</div><div className="mt-3 flex gap-3"><Image unoptimized width={36} height={36} src={avatarFor(video.owner)} alt="" className="size-9 shrink-0 rounded-full border border-white/10 object-cover"/><div className="min-w-0"><h3 className="line-clamp-2 text-sm font-bold leading-5 group-hover:text-indigo-300">{video.title}</h3><p className="mt-1 truncate text-xs text-zinc-500">@{video.owner?.unique_handle || "creator"}</p><p className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-600"><Eye className="size-3"/>{Number(video.views || 0).toLocaleString()} views · {new Date(video.upload_date).toLocaleDateString()}</p></div></div></Link>;
}

export default function DashboardHome() {
  const router = useRouter();
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingPage = useRef(false);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [lives, setLives] = useState<LivePodcast[]>([]);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [stats, setStats] = useState<AudienceStats | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadVideos = useCallback(async (nextPage: number, replace = false) => {
    if (loadingPage.current) return;
    loadingPage.current = true;
    try {
      const response = await fetch(buildApiUrl(`/api/videos?page=${nextPage}&limit=16&sort=latest`));
      if (!response.ok) throw new Error("Feed unavailable");
      const data = await response.json() as { videos: FeedVideo[]; page: number; limit: number; total: number };
      setVideos(previous => replace ? data.videos : [...previous, ...data.videos.filter(item => !previous.some(existing => existing.id === item.id))]);
      setPage(data.page);
      setHasMore(data.page * data.limit < data.total);
    } finally { loadingPage.current = false; setLoading(false); }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    const stored = localStorage.getItem("user");
    if (!token || !stored) { router.replace("/login"); return; }
    try { setUser(JSON.parse(stored) as StoredUser); } catch { router.replace("/login"); return; }
    void loadVideos(1, true);
    const loadHeader = async () => {
      const [liveResponse, statsResponse] = await Promise.all([fetch(buildApiUrl("/api/live/active")), fetch(buildApiUrl("/api/user/audience"), { headers: { Authorization: `Bearer ${token}` } })]);
      if (liveResponse.ok) setLives(await liveResponse.json());
      if (statsResponse.ok) setStats(await statsResponse.json());
    };
    void loadHeader();
    const timer = window.setInterval(loadHeader, 15000);
    return () => window.clearInterval(timer);
  }, [loadVideos, router]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target) return;
    const observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting && hasMore && !loadingPage.current) void loadVideos(page + 1); }, { rootMargin: "600px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadVideos, page]);

  const newUploads = videos.slice(0, 4);
  const endlessFeed = videos.slice(4);
  const statCards: Array<{ label: string; value: string | number; icon: LucideIcon }> = [
    { label: "Followers", value: stats?.followers || 0, icon: Users },
    { label: "Total views", value: stats?.totalViews || 0, icon: Eye },
    { label: "Your lives", value: stats?.totalLives || 0, icon: Radio },
    { label: "Live now", value: lives.length, icon: TrendingUp }
  ];
  return <div className="min-h-screen bg-[#080808] text-white"><DashboardSidebar/><main className="pb-28 md:ml-60 md:pb-10"><header className="sticky top-0 z-40 border-b border-white/[.06] bg-[#080808]/90 px-4 py-3 backdrop-blur-xl sm:px-6"><div className="mx-auto flex max-w-7xl items-center gap-3"><form onSubmit={event=>{event.preventDefault();if(search.trim())router.push(`/search?q=${encodeURIComponent(search.trim())}`)}} className="relative min-w-0 flex-1 sm:max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search videos, podcasts, creators" className="h-10 w-full rounded-full border border-white/[.08] bg-zinc-900 pl-9 pr-4 text-sm outline-none focus:border-indigo-500"/></form><Link href="/dashboard/upload" className="hidden min-h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-black text-black sm:flex"><Upload className="size-4"/>Upload</Link><Link href="/dashboard/setup" className="flex min-h-10 items-center gap-2 rounded-full bg-red-600 px-4 text-sm font-black"><Radio className="size-4"/><span className="hidden sm:inline">Go Live</span></Link>{user&&<Image unoptimized width={36} height={36} src={avatarFor(user)} alt={user.display_name||"User"} className="size-9 rounded-full object-cover"/>}</div></header>
    <div className="mx-auto max-w-7xl space-y-10 p-4 sm:p-6 lg:p-8"><section><p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-400">Studio Home</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">Welcome back, {user?.display_name || "Creator"}</h1><div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{statCards.map(({label,value,icon:Icon})=><div key={label} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><Icon className="size-5 text-indigo-400"/><p className="mt-4 text-2xl font-black tabular-nums">{Number(value).toLocaleString()}</p><p className="mt-1 text-xs text-zinc-500">{label}</p></div>)}</div></section>
      <section><div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-red-400">Happening now</p><h2 className="mt-1 text-xl font-black">Live podcasts</h2></div><Link href="/discover" className="text-xs text-indigo-400">View all →</Link></div>{lives.length?<div className="flex snap-x gap-4 overflow-x-auto pb-3 scrollbar-hide">{lives.map(live=><Link href={`/live/${live.id}`} key={live.id} className="w-[82vw] max-w-sm shrink-0 snap-start"><div className="relative aspect-video overflow-hidden rounded-2xl border border-red-500/20 bg-zinc-900">{live.thumbnail_url&&<Image unoptimized fill sizes="384px" src={live.thumbnail_url} alt={live.title} className="object-cover"/>}<div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent"/><span className="absolute left-3 top-3 rounded bg-red-600 px-2 py-1 text-[10px] font-black">● LIVE</span><span className="absolute bottom-3 left-3 right-3"><b className="line-clamp-2">{live.title}</b><small className="mt-1 flex items-center gap-1 text-zinc-300"><Users className="size-3"/>{live.viewer_count||live.viewer_count_peak||0} watching · @{live.host?.unique_handle}</small></span></div></Link>)}</div>:<div className="rounded-2xl border border-dashed border-white/10 p-8 text-center"><Radio className="mx-auto size-8 text-zinc-700"/><p className="mt-3 text-sm text-zinc-500">No live podcast right now.</p></div>}</section>
      <section><div className="mb-4"><p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Just published</p><h2 className="mt-1 text-xl font-black">New uploaded videos</h2></div>{loading&&!videos.length?<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({length:4},(_,index)=><div key={index} className="aspect-video animate-pulse rounded-2xl bg-zinc-900"/>)}</div>:<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{newUploads.map(video=><VideoCard key={video.id} video={video} prominent/>)}</div>}</section>
      <section><div className="mb-5 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-indigo-500/10"><Clock3 className="size-5 text-indigo-400"/></span><div><p className="text-xs text-zinc-500">Keep scrolling</p><h2 className="text-xl font-black">Endless video feed</h2></div></div><div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{endlessFeed.map(video=><VideoCard key={video.id} video={video}/>)}</div><div ref={sentinel} className="grid min-h-28 place-items-center">{hasMore?<Loader2 className="size-6 animate-spin text-indigo-400"/>:videos.length?<p className="text-xs text-zinc-600">You’re caught up for now. New uploads will appear automatically.</p>:null}</div></section>
    </div></main></div>;
}
