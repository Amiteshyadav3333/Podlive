"use client";

import { useState } from "react";
import { Mic, Radio, Settings, Users, Video, AlertCircle, Loader2, Home as HomeIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Dashboard() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        title: "",
        description: "",
        category: "Technology"
    });
    const [thumbnail, setThumbnail] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleGoLive = async () => {
        if (!formData.title) {
            setError("Title is required before going live.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const token = localStorage.getItem("accessToken");
            if (!token) throw new Error("Please log in again.");

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://" + window.location.hostname + ":5005"}/api/live/create`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to start live session.");

            // Redirect to the live broadcasting room
            router.push(`/live/${data.session.id}`);

        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-white selection:bg-indigo-500 selection:text-white">
            {/* Sidebar */}
            <aside className="fixed left-0 top-0 h-screen w-64 border-r border-white/10 bg-black/50 p-6 flex flex-col hidden md:flex">
                <div className="flex items-center gap-2 mb-12">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                        <Mic className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-bold text-xl tracking-tight">PodLive</span>
                </div>

                <nav className="flex-1 space-y-2">
                    <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-medium transition-colors">
                        <HomeIcon className="w-5 h-5" />
                        Home
                    </Link>
                    <Link href="/dashboard/setup" className="flex items-center gap-3 px-4 py-3 rounded-lg bg-indigo-500/10 text-indigo-400 font-medium transition-colors">
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
            <main className="md:ml-64 p-8 max-w-5xl">
                <header className="mb-10">
                    <h1 className="text-3xl font-bold tracking-tight mb-2">Host Dashboard</h1>
                    <p className="text-zinc-400">Setup your live stream and go live to your audience.</p>
                </header>

                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Main Setup Form */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6">
                            <h2 className="text-xl font-semibold mb-6">Live Session Details</h2>

                            <div className="space-y-5">
                                {error && (
                                    <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-lg">
                                        {error}
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-2">Podcast Title *</label>
                                    <input
                                        type="text"
                                        name="title"
                                        value={formData.title}
                                        onChange={handleChange}
                                        placeholder="E.g., Tech Talk Episode 1"
                                        className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-white placeholder-zinc-600"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-2">Description</label>
                                    <textarea
                                        name="description"
                                        rows={4}
                                        value={formData.description}
                                        onChange={handleChange}
                                        placeholder="What is this episode about?"
                                        className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-white placeholder-zinc-600 resize-none"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-2">Category</label>
                                        <select
                                            name="category"
                                            value={formData.category}
                                            onChange={handleChange}
                                            className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-white"
                                        >
                                            <option>Technology</option>
                                            <option>Music</option>
                                            <option>Comedy</option>
                                            <option>Education</option>
                                            <option>General</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-2">Thumbnail</label>
                                        <input
                                            type="file"
                                            id="thumbnail"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => {
                                                if (e.target.files && e.target.files[0]) {
                                                    const url = URL.createObjectURL(e.target.files[0]);
                                                    setThumbnail(url);
                                                }
                                            }}
                                        />
                                        <label htmlFor="thumbnail" className="w-full h-[50px] bg-black border border-zinc-800 border-dashed rounded-xl flex items-center justify-center text-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 cursor-pointer overflow-hidden transition-colors relative">
                                            {thumbnail ? (
                                                <img src={thumbnail} alt="Upload preview" className="object-cover w-full h-full opacity-50" />
                                            ) : (
                                                "Upload Image"
                                            )}
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Action sidebar */}
                    <div className="space-y-6">
                        <div className="bg-gradient-to-b from-indigo-900/40 to-black border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl"></div>

                            <h3 className="text-lg font-semibold mb-2">Ready to broadcast?</h3>
                            <p className="text-sm text-indigo-200/60 mb-6">Make sure your microphone and camera permissions are granted before starting.</p>

                            <button
                                onClick={handleGoLive}
                                disabled={loading}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Radio className="w-5 h-5 animate-pulse" />}
                                {loading ? "Starting..." : "Go Live Now"}
                            </button>
                        </div>

                        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6">
                            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-zinc-400" />
                                Pre-flight Checklist
                            </h3>
                            <ul className="space-y-3">
                                <li className="flex items-center gap-3 text-sm">
                                    <div className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center">✓</div>
                                    <span className="text-zinc-300">Microphone connected</span>
                                </li>
                                <li className="flex items-center gap-3 text-sm">
                                    <div className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center"></div>
                                    <span className="text-zinc-300">Camera connected</span>
                                </li>
                                <li className="flex items-center gap-3 text-sm">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${formData.title ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 border border-zinc-700'}`}>
                                        {formData.title ? "✓" : ""}
                                    </div>
                                    <span className="text-zinc-300">Title set</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </main >
        </div >
    );
}
