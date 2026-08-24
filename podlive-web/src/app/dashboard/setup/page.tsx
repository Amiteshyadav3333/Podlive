"use client";

import { useState } from "react";
import { Radio, AlertCircle, Loader2, CheckCircle2, Mic, Camera, Wifi, Globe2, Lock, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { buildApiUrl } from "@/lib/api";
import DashboardSidebar from "@/components/DashboardSidebar";

const CATEGORIES = ["Technology", "Music", "Comedy", "Education", "Finance", "Gaming", "General"];

export default function SetupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ title: "", description: "", category: "Technology", visibility: "public", brand_color: "#7C3AED", audience_mode: "everyone", replay_enabled: true, chat_enabled: true, moderation_enabled: true, dvr_enabled: true, low_latency: true, studio_config: { layout: "speaker", reactions: true, questions: true, polls: true, guestRequests: true } });
  const [allowedHandle, setAllowedHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGoLive = async () => {
    if (!formData.title.trim()) { setError("Title is required."); return; }
    setLoading(true); setError("");
    try {
      const token = localStorage.getItem("accessToken");
      if (!token) throw new Error("Please log in again.");
      const res = await fetch(buildApiUrl("/api/live/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start session.");
      if (formData.visibility === "private") {
        const inviteRes = await fetch(buildApiUrl(`/api/live/${data.session.id}/access-invites`), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(allowedHandle.trim() ? { handle: allowedHandle.replace(/^@/, "") } : {})
        });
        const invite = await inviteRes.json();
        if (!inviteRes.ok) throw new Error(invite.error || "Private invite could not be created.");
        const joinUrl = `${window.location.origin}/live/${data.session.id}?invite=${invite.token}`;
        await navigator.clipboard.writeText(joinUrl);
        sessionStorage.setItem(`privateInvite:${data.session.id}`, joinUrl);
      }
      router.push(`/live/${data.session.id}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const checks = [
    { icon: Mic, label: "Microphone ready", ok: true },
    { icon: Camera, label: "Camera connected", ok: true },
    { icon: Wifi, label: "Stable connection", ok: true },
    { icon: CheckCircle2, label: "Title filled", ok: !!formData.title.trim() },
  ];

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <DashboardSidebar />
      <div className="md:ml-60 pb-24 md:pb-6">
        <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl px-6 h-14 flex items-center">
          <h1 className="font-bold text-base">Live Setup</h1>
        </div>

        <div className="p-6 max-w-4xl">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Form */}
            <div className="lg:col-span-2 space-y-5">
              <div className="glass p-6 rounded-2xl">
                <h2 className="font-semibold mb-5 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-red-400" />
                  Stream Details
                </h2>

                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-xl mb-4">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Title *</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="E.g., Tech Talk Episode 12"
                      className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 focus:bg-zinc-900 transition-all text-white placeholder:text-zinc-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Who can join?</label>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <button onClick={() => setFormData({ ...formData, visibility: "public" })} className={`p-4 rounded-xl border text-left flex gap-3 ${formData.visibility === "public" ? "border-indigo-400 bg-indigo-500/10" : "border-white/[.08] bg-zinc-900/50"}`}><Globe2 className="w-5 h-5 text-indigo-400"/><span><b className="block text-sm">Public podcast</b><small className="text-zinc-500">Everyone can watch</small></span></button>
                      <button onClick={() => setFormData({ ...formData, visibility: "private" })} className={`p-4 rounded-xl border text-left flex gap-3 ${formData.visibility === "private" ? "border-violet-400 bg-violet-500/10" : "border-white/[.08] bg-zinc-900/50"}`}><Lock className="w-5 h-5 text-violet-400"/><span><b className="block text-sm">Private podcast</b><small className="text-zinc-500">Approved link only</small></span></button>
                    </div>
                  </div>
                  {formData.visibility === "private" && <div className="rounded-2xl p-4 border border-violet-400/20 bg-violet-500/[.06]"><label className="block text-xs font-semibold text-violet-300 uppercase tracking-wider mb-2">Lock invite to account (optional)</label><div className="relative"><Link2 className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500"/><input value={allowedHandle} onChange={e => setAllowedHandle(e.target.value)} placeholder="@username — leave empty to approve first user" className="w-full bg-zinc-900/70 border border-white/[.08] rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-violet-400"/></div><p className="text-[11px] text-zinc-500 mt-2">A secure one-person invite link will be copied when the podcast starts.</p></div>}

                  <div className="rounded-2xl border border-white/[.08] p-5 space-y-5">
                    <div><h3 className="font-bold">Live experience</h3><p className="text-xs text-zinc-500">Customize how your studio looks and how viewers participate.</p></div>
                    <div className="grid sm:grid-cols-2 gap-4"><label><span className="block text-xs font-semibold text-zinc-400 mb-2">Brand color</span><div className="flex gap-2"><input type="color" value={formData.brand_color} onChange={e=>setFormData({...formData,brand_color:e.target.value})} className="w-12 h-11"/><input value={formData.brand_color} onChange={e=>setFormData({...formData,brand_color:e.target.value})} className="flex-1 bg-zinc-900 border border-white/[.08] rounded-xl px-3 text-sm"/></div></label><label><span className="block text-xs font-semibold text-zinc-400 mb-2">Stage layout</span><select value={formData.studio_config.layout} onChange={e=>setFormData({...formData,studio_config:{...formData.studio_config,layout:e.target.value}})} className="w-full h-11 bg-zinc-900 border border-white/[.08] rounded-xl px-3 text-sm"><option value="speaker">Focus speaker</option><option value="grid">Guest grid</option><option value="interview">Interview</option><option value="classroom">Classroom</option></select></label></div>
                    <div className="grid sm:grid-cols-2 gap-3">{[["chat_enabled","Live chat"],["moderation_enabled","Auto moderation"],["replay_enabled","Save replay"],["low_latency","Low latency"]].map(([key,label])=><button key={key} onClick={()=>setFormData({...formData,[key]:!(formData as any)[key]})} className="flex justify-between items-center p-3 rounded-xl bg-zinc-900/70 border border-white/[.06] text-sm"><span>{label}</span><span className={`w-9 h-5 rounded-full p-0.5 ${(formData as any)[key]?'bg-indigo-500':'bg-zinc-700'}`}><span className={`block w-4 h-4 rounded-full bg-white transition ${(formData as any)[key]?'translate-x-4':''}`}/></span></button>)}</div>
                    <div><p className="text-xs font-semibold text-zinc-400 mb-2">Audience tools</p><div className="flex flex-wrap gap-2">{[["reactions","Reactions"],["questions","Q&A"],["polls","Polls"],["guestRequests","Guest requests"]].map(([key,label])=><button key={key} onClick={()=>setFormData({...formData,studio_config:{...formData.studio_config,[key]:!(formData.studio_config as any)[key]}})} className={`px-3 py-2 rounded-full text-xs border ${(formData.studio_config as any)[key]?'border-indigo-400 bg-indigo-500/10 text-indigo-300':'border-white/10 text-zinc-500'}`}>{label}</button>)}</div></div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Description</label>
                    <textarea
                      rows={4}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Tell viewers what this stream is about..."
                      className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 focus:bg-zinc-900 transition-all text-white placeholder:text-zinc-600 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Category</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 transition-all text-white"
                    >
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Go Live Button */}
              <div className="glass p-5 rounded-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-red-600/10 to-transparent pointer-events-none" />
                <h3 className="font-semibold mb-1 relative">Ready to broadcast?</h3>
                <p className="text-xs text-zinc-500 mb-5 relative">Make sure your mic and camera are granted.</p>
                <button
                  onClick={handleGoLive}
                  disabled={loading}
                  className="w-full relative bg-red-600 hover:bg-red-500 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all glow-red disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                  {loading ? "Starting..." : "Go Live Now"}
                </button>
              </div>

              {/* Checklist */}
              <div className="glass p-5 rounded-2xl">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-zinc-400" />
                  Pre-flight Checklist
                </h3>
                <ul className="space-y-2.5">
                  {checks.map(({ icon: Icon, label, ok }) => (
                    <li key={label} className="flex items-center gap-3 text-sm">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${ok ? "bg-green-500/20" : "bg-zinc-800 border border-zinc-700"}`}>
                        {ok && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                      </div>
                      <span className={ok ? "text-zinc-300" : "text-zinc-500"}>{label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
