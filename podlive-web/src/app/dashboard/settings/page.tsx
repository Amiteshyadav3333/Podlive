"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, LogOut, Users, Clock3, BadgeDollarSign, Upload, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { buildApiUrl } from "@/lib/api";
import DashboardSidebar from "@/components/DashboardSidebar";

interface CreatorProfile {
  display_name: string;
  unique_handle: string;
  bio?: string | null;
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

export default function Settings() {
  const router = useRouter();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [monetization, setMonetization] = useState<MonetizationDetails | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) { router.push("/login"); return; }
    Promise.all([
      fetch(buildApiUrl("/api/user/profile"), { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(buildApiUrl("/api/user/monetization"), { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null)
    ]).then(([profileData, monetizationData]) => {
      setProfile(profileData);
      setMonetization(monetizationData?.monetization || null);
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
        body: JSON.stringify({ display_name: profile.display_name, bio: profile.bio })
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Profile updated successfully!" });
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
          <h1 className="font-bold text-base">Settings</h1>
        </div>

        <div className="max-w-4xl p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="glass p-6 rounded-2xl space-y-5">
                <h2 className="font-semibold">Profile Details</h2>

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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
