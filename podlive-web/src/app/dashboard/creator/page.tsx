"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { BarChart3, Clock3, Eye, Heart, IndianRupee, Loader2, MessageSquare, Upload, Users } from "lucide-react";
import DashboardSidebar from "@/components/DashboardSidebar";
import { buildApiUrl } from "@/lib/api";

interface CreatorData {
  overview: { videos: number; views: number; likes: number; comments: number; watchHours: number; estimatedBalanceRupees: number; lifetimeEarningsRupees: number; monetizationStatus: string };
  audience: { ageGroups: Array<{ ageGroup: string; viewers: number }> };
  videos: Array<{ id: string; title: string; thumbnail?: string | null; upload_date: string; visibility: string; processing_status: string; views: string; likes: number; comments_count: number; watchHours: number; estimatedRevenueRupees: number }>;
}

const ageLabels: Record<string, string> = { under_13: "Under 13", "13_17": "13–17", "18_24": "18–24", "25_34": "25–34", "35_44": "35–44", "45_54": "45–54", "55_64": "55–64", "65_plus": "65+" };

export default function CreatorDashboard() {
  const router = useRouter();
  const [data, setData] = useState<CreatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) { router.push("/login"); return; }
    fetch(buildApiUrl("/api/user/creator-dashboard"), { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error || "Unable to load creator analytics");
        return response.json();
      })
      .then(setData).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, [router]);

  const ageTotal = data?.audience.ageGroups.reduce((sum, group) => sum + group.viewers, 0) || 0;
  const cards = data ? [
    ["Views", data.overview.views.toLocaleString(), Eye, "text-sky-400"],
    ["Watch hours", data.overview.watchHours.toLocaleString(), Clock3, "text-violet-400"],
    ["Likes", data.overview.likes.toLocaleString(), Heart, "text-pink-400"],
    ["Comments", data.overview.comments.toLocaleString(), MessageSquare, "text-amber-400"],
  ] as const : [];

  return <div className="min-h-screen bg-[#080808] text-white"><DashboardSidebar /><main className="pb-28 md:ml-60 md:pb-10"><header className="border-b border-white/[.06] px-5 py-5 md:px-8"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-indigo-400">Creator control center</p><h1 className="mt-1 text-xl font-black sm:text-2xl">Channel analytics</h1></div><button onClick={() => router.push('/dashboard/upload')} className="flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-xs font-bold text-black hover:bg-zinc-200 sm:px-4 sm:text-sm"><Upload className="size-4" /> Upload</button></div></header>
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 md:p-8">{loading ? <div className="grid min-h-72 place-items-center"><Loader2 className="size-8 animate-spin text-indigo-400" /></div> : error ? <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-red-300">{error}</div> : data && <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([label, value, Icon, color]) => <div key={label} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 sm:p-5"><Icon className={`size-5 ${color}`} /><p className="mt-4 text-xl font-black tabular-nums sm:text-2xl">{value}</p><p className="mt-1 text-xs text-zinc-500">{label}</p></div>)}</section>
      <section className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><div className="overflow-hidden rounded-2xl border border-white/[.07] bg-gradient-to-br from-emerald-500/10 to-transparent p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Earnings</p><p className="mt-3 flex items-center text-3xl font-black"><IndianRupee className="size-6" />{data.overview.estimatedBalanceRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p><p className="mt-1 text-xs text-zinc-500">Estimated available balance</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${data.overview.monetizationStatus === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{data.overview.monetizationStatus === 'active' ? 'Active' : 'Not active'}</span></div><div className="mt-6 border-t border-white/[.07] pt-4 text-sm text-zinc-400">Lifetime estimated earnings: <span className="font-bold text-white">₹{data.overview.lifetimeEarningsRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span><p className="mt-2 text-[11px] leading-5 text-zinc-600">Estimates may change after invalid-traffic review, policy checks and payment reconciliation.</p></div></div>
        <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5 sm:p-6"><div className="flex items-center gap-2"><Users className="size-5 text-indigo-400" /><h2 className="font-bold">Audience age</h2></div><div className="mt-5 space-y-3">{data.audience.ageGroups.length ? data.audience.ageGroups.map((group) => { const percent = ageTotal ? Math.round(group.viewers / ageTotal * 100) : 0; return <div key={group.ageGroup}><div className="mb-1.5 flex justify-between text-xs"><span className="text-zinc-300">{ageLabels[group.ageGroup] || group.ageGroup}</span><span className="tabular-nums text-zinc-500">{percent}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${percent}%` }} /></div></div> }) : <p className="text-sm leading-6 text-zinc-500">Age analytics appear after at least five viewers in a group voluntarily add a birth date and record qualified views.</p>}</div></div></section>
      <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.02]"><div className="flex items-center gap-2 border-b border-white/[.07] p-5"><BarChart3 className="size-5 text-indigo-400" /><h2 className="font-bold">Video performance</h2></div><div className="divide-y divide-white/[.06]">{data.videos.length ? data.videos.map((video) => <button key={video.id} onClick={() => router.push(`/dashboard/videos/${video.id}/access`)} className="grid w-full grid-cols-[72px_1fr] gap-3 p-4 text-left hover:bg-white/[.025] sm:grid-cols-[96px_1fr_auto] sm:items-center"><div className="relative aspect-video overflow-hidden rounded-lg bg-zinc-900">{video.thumbnail && <Image unoptimized fill sizes="96px" src={video.thumbnail} alt="" className="object-cover" />}</div><div className="min-w-0"><p className="truncate text-sm font-bold">{video.title}</p><p className="mt-1 text-[11px] text-zinc-500">{video.visibility} • {video.processing_status}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400"><span>{Number(video.views).toLocaleString()} views</span><span>{video.likes.toLocaleString()} likes</span><span>{video.comments_count.toLocaleString()} comments</span><span>{video.watchHours.toLocaleString()} hours</span></div></div><div className="col-start-2 text-xs text-emerald-400 sm:col-start-auto sm:text-right"><p className="font-bold">₹{video.estimatedRevenueRupees.toFixed(2)}</p><p className="text-[10px] text-zinc-600">estimated</p></div></button>) : <div className="p-10 text-center text-sm text-zinc-500">Upload your first video to start creator analytics.</div>}</div></section>
    </>}</div></main></div>;
}
