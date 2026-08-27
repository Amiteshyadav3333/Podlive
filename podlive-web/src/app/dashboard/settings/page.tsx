"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, LogOut, Users, Clock3, BadgeDollarSign, Upload, ShieldCheck, Copy, Crown, Mail, IndianRupee, Settings2, BarChart3, Palette, Video, BookOpen, HelpCircle, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildApiUrl } from "@/lib/api";
import DashboardSidebar from "@/components/DashboardSidebar";
import { saveLanguage, type SupportedLanguage } from "@/lib/language";

interface CreatorProfile {
  id: string;
  display_name: string;
  unique_handle: string;
  bio?: string | null;
  profile?: { birth_date?: string | null; language?: string | null } | null;
}

interface MonetizationDetails {
  status: "ineligible" | "active" | "suspended";
  requirements: { followers: number; watchHours: number };
  progress: {
    followers: number;
    followersPercent: number;
    watchHours: number;
    watchHoursPercent: number;
  };
}
interface PlanStatus { planCode: "free" | "plus" | "max"; active: boolean; maxVideoHeight: number | null; podcastLimit: number | null }

export default function Settings() {
  const router = useRouter();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [monetization, setMonetization] = useState<MonetizationDetails | null>(null);
  const [plan, setPlan] = useState<PlanStatus | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) { router.push("/login"); return; }
    Promise.all([
      fetch(buildApiUrl("/api/user/profile"), { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(buildApiUrl("/api/user/monetization"), { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
      fetch(buildApiUrl("/api/plans/status"), { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null)
    ]).then(([profileData, monetizationData, planData]) => {
      setProfile(profileData);
      setMonetization(monetizationData?.monetization || null);
      setPlan(planData?.entitlements || null);
    }).catch(console.error).finally(() => setLoading(false));
  }, [router]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true); setMessage(null);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(buildApiUrl("/api/user/profile"), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ display_name: profile.display_name, bio: profile.bio, birth_date: profile.profile?.birth_date || null, language: profile.profile?.language || "en" })
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Profile updated successfully!" });
        saveLanguage((profile.profile?.language || "en") as SupportedLanguage);
        const u = localStorage.getItem("user");
        if (u) localStorage.setItem("user", JSON.stringify({ ...JSON.parse(u), display_name: profile.display_name }));
      } else {
        setMessage({ type: "error", text: "Failed to save changes." });
      }
    } catch { setMessage({ type: "error", text: "Network error." }); }
    finally { setSaving(false); }
  };

  const handleLogout = () => {
    ["accessToken", "refreshToken", "user"].forEach(k => localStorage.removeItem(k));
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <DashboardSidebar />
      <div className="md:ml-60 pb-24 md:pb-6">
        <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl px-6 h-14 flex items-center">
          <h1 className="font-bold text-base">सेटिंग्स / Settings</h1>
        </div>

        <div className="max-w-4xl p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            </div>
          ) : (
            <div className="space-y-5">
              <section className="overflow-hidden rounded-3xl border border-white/[.08] bg-gradient-to-br from-indigo-500/15 via-white/[.025] to-transparent p-6 sm:p-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="grid size-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-2xl font-black">{(profile?.display_name || "U").slice(0,1).toUpperCase()}</div><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-300">Account center</p><h2 className="mt-1 truncate text-2xl font-black">{profile?.display_name}</h2><p className="mt-1 truncate text-sm text-zinc-400">@{profile?.unique_handle} · <span className="font-mono text-xs text-zinc-600">{profile?.id}</span></p></div></div>
              </section>

              <section className="rounded-2xl border border-white/[.07] bg-white/[.02] p-5 sm:p-6"><div className="flex items-center gap-2"><Settings2 className="size-5 text-indigo-400"/><h2 className="font-black">All app settings</h2></div><p className="mt-1 text-xs text-zinc-500">Manage every account and creator feature from your profile.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{[
                { href: "#profile", icon: Settings2, title: "Profile & language", text: "Name, User ID, bio, birth date and app language" },
                { href: "#subscription", icon: Crown, title: "Subscription", text: "Basic Free, Plus, Max and payment support" },
                { href: "/dashboard/creator", icon: BarChart3, title: "Creator analytics", text: "Views, audience, earnings, likes and comments" },
                { href: "/dashboard/channel", icon: Palette, title: "Channel settings", text: "Brand, channel information and appearance" },
                { href: "/dashboard/recordings", icon: Video, title: "Video settings", text: "Manage uploaded videos and subtitles" },
                { href: "/dashboard/memberships", icon: Users, title: "Memberships", text: "Plans, benefits and channel members" },
                { href: "/dashboard/courses", icon: BookOpen, title: "Courses", text: "Course content, pricing and students" },
                { href: "#support", icon: HelpCircle, title: "Support & legal", text: "Payment help, Terms and Privacy Policy" }
              ].map(({href,icon:Icon,title,text})=><Link key={title} href={href} className="group flex items-center gap-3 rounded-xl border border-white/[.07] bg-zinc-950/60 p-4 hover:border-indigo-400/25 hover:bg-indigo-500/[.05]"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[.05] text-zinc-400 group-hover:text-indigo-300"><Icon className="size-5"/></span><span className="min-w-0 flex-1"><b className="block text-sm">{title}</b><small className="mt-0.5 block leading-5 text-zinc-500">{text}</small></span><ChevronRight className="size-4 text-zinc-700"/></Link>)}</div></section>

              <div id="profile" className="glass scroll-mt-20 p-6 rounded-2xl space-y-5">
                <h2 className="font-semibold">प्रोफ़ाइल जानकारी / Profile Details</h2>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">ऐप की भाषा / App language</label>
                  <select value={profile?.profile?.language || "en"} onChange={(event) => setProfile(previous => previous ? { ...previous, profile: { ...previous.profile, language: event.target.value } } : previous)} className="w-full rounded-xl border border-white/[0.08] bg-zinc-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-500/70">
                    <option value="en">English (Default)</option><option value="hi">हिन्दी</option></select>
                  <p className="mt-1.5 text-xs text-zinc-600">English is the default. Save changes to apply your selection across the app.</p>
                </div>

                {message && (
                  <div className={`flex items-center gap-2 text-sm p-3 rounded-xl ${
                    message.type === "success"
                      ? "bg-green-500/10 border border-green-500/30 text-green-400"
                      : "bg-red-500/10 border border-red-500/30 text-red-400"
                  }`}>
                    {message.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {message.text}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Display Name</label>
                  <input
                    type="text"
                    value={profile?.display_name || ""}
                    onChange={(e) => setProfile((previous) => previous ? { ...previous, display_name: e.target.value } : previous)}
                    className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 transition-all text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">User ID</label>
                  <div className="flex gap-2">
                    <input type="text" value={profile?.id || ""} disabled className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-500" />
                    <button onClick={() => profile?.id && navigator.clipboard?.writeText(profile.id)} className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10" aria-label="Copy user ID"><Copy className="size-4" /></button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Handle</label>
                  <input
                    type="text"
                    value={profile?.unique_handle || ""}
                    disabled
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-600 cursor-not-allowed"
                  />
                  <p className="text-xs text-zinc-600 mt-1.5">Handles cannot be changed.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Birth date</label>
                  <input type="date" value={profile?.profile?.birth_date?.slice(0, 10) || ""} onChange={(e) => setProfile((previous) => previous ? { ...previous, profile: { ...previous.profile, birth_date: e.target.value || null } } : previous)} className="w-full rounded-xl border border-white/[0.08] bg-zinc-900/60 px-4 py-3 text-sm text-white outline-none focus:border-indigo-500/70" />
                  <p className="mt-1.5 text-xs text-zinc-600">Optional. Used only for aggregated audience age analytics; creators never see viewer identities.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Bio</label>
                  <textarea
                    rows={4}
                    value={profile?.bio || ""}
                    onChange={(e) => setProfile((previous) => previous ? { ...previous, bio: e.target.value } : previous)}
                    placeholder="Tell your audience about yourself..."
                    className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 transition-all text-white placeholder:text-zinc-600 resize-none"
                  />
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>

              <div id="subscription" className="scroll-mt-20 overflow-hidden rounded-2xl border border-amber-400/15 bg-gradient-to-r from-amber-500/10 via-white/[.025] to-transparent p-5 sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-amber-300"><Crown className="size-5"/></span><div><p className="text-xs font-bold uppercase tracking-wider text-amber-300">Your subscription</p><h2 className="mt-1 text-xl font-black">{plan?.active ? `PodLive ${plan.planCode === "max" ? "Max" : "Plus"}` : "Basic Free"}</h2><p className="mt-1 text-xs text-zinc-500">{plan?.active ? `${plan.maxVideoHeight ? `${plan.maxVideoHeight}p` : "Highest quality"} · ${plan.podcastLimit === null ? "Unlimited live podcasts" : `${plan.podcastLimit} live podcasts / 30 days`}` : "Watch public videos · Live streaming locked"}</p></div></div><button onClick={()=>router.push(`/subscribe?plan=${plan?.planCode === "plus" ? "max" : "plus"}`)} className="min-h-11 rounded-xl bg-white px-5 text-sm font-black text-black hover:bg-zinc-200">{plan?.active ? "Manage / Upgrade" : "Subscribe now"}</button></div>
              </div>

              <section id="support" className="scroll-mt-20 overflow-hidden rounded-2xl border border-sky-400/15 bg-gradient-to-br from-sky-500/10 via-white/[.02] to-transparent p-5 sm:p-6">
                <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-400/15 text-sky-300"><Mail className="size-5"/></span><div><p className="text-xs font-bold uppercase tracking-wider text-sky-300">Support & Help</p><h2 className="mt-1 text-lg font-black">Payment and subscription support</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Payment pending, wrong amount, UTR verification, subscription activation, refund or billing query के लिए support team को email करें। अपना User ID, order ID और UTR लिखें—UPI PIN या OTP कभी share न करें।</p></div></div>
                <a href="mailto:yadavamiteshkumar11@gmail.com?subject=PodLive%20Payment%20Support&body=User%20ID%3A%20%0AOrder%20ID%3A%20%0AUTR%3A%20%0AIssue%3A%20" className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-400 px-5 text-sm font-black text-black hover:bg-sky-300 sm:w-fit"><IndianRupee className="size-4"/>Email payment support</a>
                <p className="mt-3 break-all text-xs text-zinc-500">yadavamiteshkumar11@gmail.com</p>
                <div className="mt-5 grid gap-3 border-t border-white/[.07] pt-5 sm:grid-cols-2"><Link href="/terms" className="flex items-center justify-between rounded-xl border border-white/[.08] bg-black/30 p-4 text-sm font-bold hover:bg-white/[.05]">Terms and Conditions <ChevronRight className="size-4 text-zinc-600"/></Link><Link href="/privacy" className="flex items-center justify-between rounded-xl border border-white/[.08] bg-black/30 p-4 text-sm font-bold hover:bg-white/[.05]">Privacy Policy <ChevronRight className="size-4 text-zinc-600"/></Link></div>
              </section>

              <div className="glass overflow-hidden rounded-2xl">
                <div className="border-b border-white/[0.07] bg-gradient-to-r from-emerald-500/10 via-indigo-500/5 to-transparent p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400"><BadgeDollarSign className="size-6" /></div>
                      <div>
                        <h2 className="font-semibold">Channel monetization</h2>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-400">Build an eligible audience and valid public-video watch time to activate monetization automatically.</p>
                      </div>
                    </div>
                    <div className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${monetization?.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : monetization?.status === 'suspended' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                      {monetization?.status === 'active' ? <ShieldCheck className="size-4" /> : <Clock3 className="size-4" />}
                      {monetization?.status === 'active' ? 'Monetization active' : monetization?.status === 'suspended' ? 'Monetization suspended' : 'Building eligibility'}
                    </div>
                  </div>
                </div>

                <div className="space-y-5 p-5 sm:p-6">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 font-medium"><Users className="size-4 text-indigo-400" /> Followers</span>
                      <span className="tabular-nums text-zinc-300">{(monetization?.progress?.followers || 0).toLocaleString()} / {(monetization?.requirements?.followers || 1000).toLocaleString()}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 transition-all" style={{ width: `${monetization?.progress?.followersPercent || 0}%` }} /></div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 font-medium"><Clock3 className="size-4 text-emerald-400" /> Valid watch hours</span>
                      <span className="tabular-nums text-zinc-300">{(monetization?.progress?.watchHours || 0).toLocaleString()} / {(monetization?.requirements?.watchHours || 5000).toLocaleString()}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all" style={{ width: `${monetization?.progress?.watchHoursPercent || 0}%` }} /></div>
                  </div>

                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 text-xs leading-relaxed text-zinc-400">
                    <p className="font-semibold text-zinc-200">Eligibility criteria</p>
                    <p className="mt-1">Reach 1,000 followers and 5,000 valid watch hours from ready, public videos. Refreshes, duplicate playback sessions and unqualified plays are excluded.</p>
                  </div>

                  <button onClick={() => router.push('/dashboard/upload')} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold transition-colors hover:bg-indigo-500 sm:w-fit">
                    <Upload className="size-4" /> Upload a video
                  </button>
                </div>
              </div>

              <div className="glass p-6 rounded-2xl border-red-500/10">
                <h2 className="font-semibold text-red-400 mb-4">Danger Zone</h2>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-zinc-500">
                <Link href="/terms" className="hover:text-white">Terms and Conditions</Link>
                <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
