"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, Loader2, LockKeyhole, Mic, QrCode } from "lucide-react";
import { buildApiUrl } from "@/lib/api";
import QRCode from "qrcode";

const plans = {
  plus: { name: "PodLive Plus", price: 299, features: ["Ad-free videos", "Higher quality video", "Personalised feed", "More live podcasts"] },
  max: { name: "PodLive Max", price: 599, features: ["Unlimited ad-free viewing", "Highest available quality", "Personalised feed", "Unlimited podcast creation"] },
};

function SubscribeContent() {
  const params = useSearchParams();
  const router = useRouter();
  const planCode = params.get("plan") === "max" ? "max" : "plus";
  const plan = plans[planCode];
  const [checkout, setCheckout] = useState<{ orderId: string; upiUri: string; payee: string } | null>(null);
  const [reference, setReference] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { if (!localStorage.getItem("accessToken")) router.replace(`/login?next=/subscribe?plan=${planCode}`); }, [planCode, router]);
  const createCheckout = async () => {
    setLoading(true); setMessage("");
    const response = await fetch(buildApiUrl("/api/plans/checkout"), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("accessToken")}` }, body: JSON.stringify({ planCode }) });
    const data = await response.json();
    if (response.ok) {
      setCheckout(data);
      setQrCode(await QRCode.toDataURL(data.upiUri, { width: 320, margin: 2, errorCorrectionLevel: "M", color: { dark: "#09090b", light: "#ffffff" } }));
    } else setMessage(data.error || "Checkout शुरू नहीं हो सका");
    setLoading(false);
  };
  const submitReference = async () => {
    if (!checkout) return; setLoading(true); setMessage("");
    const response = await fetch(buildApiUrl(`/api/plans/orders/${checkout.orderId}/reference`), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("accessToken")}` }, body: JSON.stringify({ upiReference: reference }) });
    const data = await response.json(); setMessage(response.ok ? "Payment reference मिल गया। Verification के बाद plan active होगा।" : data.error); setLoading(false);
  };

  return <main className="min-h-screen bg-[#070707] px-4 py-8 text-white"><div className="mx-auto max-w-5xl"><header className="flex items-center justify-between"><Link href="/" className="flex items-center gap-2 font-black"><span className="grid size-9 place-items-center rounded-xl bg-red-600"><Mic className="size-5"/></span>PodLive</Link><span className="flex items-center gap-2 text-xs text-zinc-500"><LockKeyhole className="size-4"/>Secure verification</span></header><div className="mt-14 grid gap-7 lg:grid-cols-[.85fr_1.15fr]"><section className="rounded-3xl border border-white/10 bg-white/[.03] p-7"><p className="text-xs font-black uppercase tracking-[.2em] text-red-400">Selected plan</p><h1 className="mt-4 text-3xl font-black">{plan.name}</h1><p className="mt-3 text-5xl font-black">₹{plan.price}<span className="text-sm font-medium text-zinc-500"> / month</span></p><ul className="mt-8 space-y-3">{plan.features.map(feature=><li className="flex gap-3 text-sm text-zinc-300" key={feature}><Check className="size-5 text-emerald-400"/>{feature}</li>)}</ul><Link href={`/subscribe?plan=${planCode === "plus" ? "max" : "plus"}`} className="mt-7 block text-sm text-indigo-400">Compare with {planCode === "plus" ? "Max" : "Plus"} →</Link></section><section className="rounded-3xl border border-white/10 bg-zinc-950 p-7"><h2 className="text-xl font-black">UPI payment / UPI भुगतान</h2><p className="mt-2 text-sm leading-6 text-zinc-500">QR scan करें या mobile पर UPI app खोलें। Exact amount और order details QR में पहले से भरे हैं।</p>{!checkout ? <button onClick={createCheckout} disabled={loading} className="mt-8 flex min-h-12 w-full items-center justify-center rounded-xl bg-white font-black text-black disabled:opacity-50">{loading?<Loader2 className="animate-spin"/>:`Show ₹${plan.price} payment QR`}</button> : <div className="mt-7 space-y-5">{qrCode&&<div className="rounded-3xl border border-white/10 bg-white p-4 text-center text-black"><div className="mx-auto flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-600"><QrCode className="size-4"/>Scan with any UPI app</div><Image unoptimized width={320} height={320} src={qrCode} alt={`Pay ₹${plan.price} UPI QR code`} className="mx-auto mt-2 w-full max-w-[280px]"/><p className="text-2xl font-black">₹{plan.price}</p><p className="mt-1 text-xs text-zinc-500">PodLive · Order-specific QR</p></div>}<div className="rounded-2xl border border-white/10 bg-black p-4"><p className="text-xs text-zinc-500">Pay to UPI ID</p><div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 truncate text-sm text-zinc-200">{checkout.payee}</code><button onClick={()=>navigator.clipboard.writeText(checkout.payee)} aria-label="Copy UPI ID" className="grid size-9 place-items-center rounded-lg bg-white/10"><Copy className="size-4"/></button></div></div><a href={checkout.upiUri} className="flex min-h-12 items-center justify-center rounded-xl bg-emerald-500 font-black text-black">Pay ₹{plan.price} with UPI app</a><div><label className="text-xs font-bold text-zinc-400">UPI transaction reference / UTR</label><input value={reference} onChange={event=>setReference(event.target.value)} placeholder="Enter payment reference" className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 outline-none focus:border-indigo-500"/><button onClick={submitReference} disabled={loading || reference.length < 6} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-indigo-600 font-bold disabled:opacity-40">{loading?<Loader2 className="animate-spin"/>:"Submit for verification"}</button></div></div>}{message&&<p className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">{message}</p>}<p className="mt-6 text-[11px] leading-5 text-zinc-600">Never share your UPI PIN or OTP. Plan activates only after payment verification.</p></section></div></div></main>;
}

export default function SubscribePage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-[#070707] text-white"><Loader2 className="size-8 animate-spin text-red-500" /></main>}><SubscribeContent /></Suspense>;
}
