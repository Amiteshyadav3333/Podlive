"use client";

import { useEffect, useState } from "react";
import { Check, Eye, Loader2, Palette, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import DashboardSidebar from "@/components/DashboardSidebar";
import { buildApiUrl } from "@/lib/api";

const emptyChannel = { name: "", handle: "", description: "", avatar_url: "", banner_url: "", primary_color: "#7C3AED", accent_color: "#EC4899", social_links: {} as Record<string, string>, layout: { featured: true, live: true, videos: true }, membership_enabled: false };

export default function ChannelStudio() {
  const router = useRouter();
  const [channel, setChannel] = useState<any>(emptyChannel);
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (!token || !user) { router.push("/login"); return; }
    fetch(buildApiUrl(`/api/channels/${user.unique_handle}`)).then(async r => {
      if (r.ok) { const data = await r.json(); setChannel({ ...emptyChannel, ...data.channel, social_links: data.channel.social_links || {}, layout: data.channel.layout || emptyChannel.layout }); setExists(true); }
      else setChannel((c: any) => ({ ...c, name: user.display_name || "", handle: user.unique_handle || "" }));
    }).finally(() => setLoading(false));
  }, [router]);

  const save = async () => {
    setSaving(true); setNotice("");
    const token = localStorage.getItem("accessToken");
    const res = await fetch(buildApiUrl(exists ? "/api/channels/me" : "/api/channels"), { method: exists ? "PATCH" : "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(channel) });
    const data = await res.json();
    if (res.ok) { setChannel({ ...channel, ...data.channel }); setExists(true); setNotice("Channel saved and live."); }
    else setNotice(data.error || "Could not save channel.");
    setSaving(false);
  };

  if (loading) return <div className="min-h-screen bg-[#080808] flex items-center justify-center"><Loader2 className="animate-spin text-violet-400" /></div>;

  return <div className="min-h-screen bg-[#080808] text-white"><DashboardSidebar /><main className="md:ml-60 pb-28">
    <header className="sticky top-0 z-30 h-16 px-5 md:px-8 border-b border-white/[.06] bg-[#080808]/90 backdrop-blur-xl flex items-center justify-between"><div><p className="text-[11px] uppercase tracking-[.2em] text-violet-400 font-bold">Creator Studio</p><h1 className="font-bold">Channel customization</h1></div><div className="flex gap-2">{exists && <button onClick={() => router.push(`/channel/${channel.handle}`)} className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-sm"><Eye className="w-4 h-4"/> Preview</button>}<button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-white text-black text-sm font-bold disabled:opacity-60">{saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Check className="w-4 h-4"/>} Save</button></div></header>
    <div className="p-5 md:p-8 max-w-6xl mx-auto grid lg:grid-cols-[1fr_380px] gap-6">
      <section className="space-y-5">
        {notice && <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-400/20 text-violet-200 text-sm">{notice}</div>}
        <div className="glass rounded-3xl p-5 md:p-7"><div className="flex items-center gap-3 mb-6"><div className="p-2.5 rounded-xl bg-violet-500/15"><Sparkles className="w-5 h-5 text-violet-300"/></div><div><h2 className="font-bold">Channel identity</h2><p className="text-xs text-zinc-500">The face of your podcast brand</p></div></div><div className="grid sm:grid-cols-2 gap-4">
          <Field label="Channel name" value={channel.name} onChange={(v:string)=>setChannel({...channel,name:v})}/><Field label="Handle" prefix="@" value={channel.handle} onChange={(v:string)=>setChannel({...channel,handle:v})}/><Field label="Avatar URL" value={channel.avatar_url || ""} onChange={(v:string)=>setChannel({...channel,avatar_url:v})}/><Field label="Banner URL" value={channel.banner_url || ""} onChange={(v:string)=>setChannel({...channel,banner_url:v})}/>
          <label className="sm:col-span-2"><span className="label">About channel</span><textarea rows={4} value={channel.description || ""} onChange={e=>setChannel({...channel,description:e.target.value})} className="input resize-none" placeholder="Tell listeners what makes your channel special..."/></label>
        </div></div>
        <div className="glass rounded-3xl p-5 md:p-7"><div className="flex items-center gap-3 mb-6"><Palette className="w-5 h-5 text-pink-400"/><div><h2 className="font-bold">Brand theme</h2><p className="text-xs text-zinc-500">Use your colors everywhere on the channel</p></div></div><div className="grid sm:grid-cols-2 gap-4"><Color label="Primary" value={channel.primary_color} onChange={(v:string)=>setChannel({...channel,primary_color:v})}/><Color label="Accent" value={channel.accent_color} onChange={(v:string)=>setChannel({...channel,accent_color:v})}/></div></div>
        <div className="glass rounded-3xl p-5 md:p-7"><h2 className="font-bold mb-5">Homepage sections</h2><div className="space-y-3">{[["featured","Featured episode"],["live","Live & upcoming"],["videos","Latest videos"]].map(([key,label])=><button key={key} onClick={()=>setChannel({...channel,layout:{...channel.layout,[key]:!channel.layout?.[key]}})} className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/[.025] border border-white/[.07]"><span className="text-sm font-medium">{label}</span><span className={`w-11 h-6 p-1 rounded-full transition ${channel.layout?.[key]?"bg-violet-500":"bg-zinc-700"}`}><span className={`block w-4 h-4 bg-white rounded-full transition ${channel.layout?.[key]?"translate-x-5":""}`}/></span></button>)}</div></div>
      </section>
      <aside className="lg:sticky lg:top-24 h-fit"><p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">Live preview</p><div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#101012] shadow-2xl"><div className="h-36 bg-zinc-800 bg-cover bg-center" style={{backgroundImage:channel.banner_url?`linear-gradient(0deg,rgba(0,0,0,.65),transparent),url(${channel.banner_url})`: `linear-gradient(135deg,${channel.primary_color},${channel.accent_color})`}}/><div className="px-5 pb-6 -mt-10 relative"><div className="w-20 h-20 rounded-2xl border-4 border-[#101012] bg-zinc-900 overflow-hidden">{channel.avatar_url ? <img src={channel.avatar_url} className="w-full h-full object-cover" alt=""/>:<div className="w-full h-full grid place-items-center text-2xl font-black" style={{background:channel.primary_color}}>{channel.name?.[0]||"P"}</div>}</div><h3 className="mt-3 text-xl font-black">{channel.name||"Your channel"}</h3><p className="text-sm text-zinc-500">@{channel.handle||"handle"}</p><p className="text-sm text-zinc-300 mt-4 line-clamp-2">{channel.description||"Your channel story will appear here."}</p><button className="mt-5 w-full py-3 rounded-xl font-bold text-sm" style={{background:channel.primary_color}}>Join community</button></div></div></aside>
    </div>
  </main><style jsx global>{`.label{display:block;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#a1a1aa;margin-bottom:.5rem}.input{width:100%;border:1px solid rgba(255,255,255,.08);background:rgba(24,24,27,.65);border-radius:.8rem;padding:.75rem 1rem;font-size:.875rem;outline:none}.input:focus{border-color:#8b5cf6}`}</style></div>;
}

function Field({label,value,onChange,prefix}:{label:string,value:string,onChange:(v:string)=>void,prefix?:string}){return <label><span className="label">{label}</span><div className="relative">{prefix&&<span className="absolute left-4 top-3 text-zinc-500">{prefix}</span>}<input value={value} onChange={e=>onChange(e.target.value)} className={`input ${prefix?"pl-9":""}`}/></div></label>}
function Color({label,value,onChange}:{label:string,value:string,onChange:(v:string)=>void}){return <label><span className="label">{label}</span><div className="flex gap-3"><input type="color" value={value} onChange={e=>onChange(e.target.value)} className="w-12 h-11 rounded-xl bg-transparent"/><input value={value} onChange={e=>onChange(e.target.value)} className="input uppercase"/></div></label>}
