"use client";

import { useState, useEffect } from "react";
import { Mic, Radio, Settings, Users, Video, UploadCloud, Link as LinkIcon, Home as HomeIcon, Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function UploadPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        title: "",
        description: "",
        category: "Technology"
    });
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const sid = params.get("sessionId");
            if (sid) setSessionId(sid);
        }
    }, []);

    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleUpload = async () => {
        if (!formData.title || !videoFile) {
            setError("Title and Video file are strictly required.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const token = localStorage.getItem("accessToken");
            if (!token) throw new Error("Please log in again.");

            const data = new FormData();
            data.append("title", formData.title);
            data.append("description", formData.description);
            data.append("category", formData.category);
            data.append("video", videoFile);
            if (thumbnailFile) {
                data.append("thumbnail", thumbnailFile);
            }
            if (sessionId) {
                data.append("sessionId", sessionId);
            }

            const res = await fetch(`http://${window.location.hostname}:5005/api/upload`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: data
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Failed to upload video.");

            setSuccess(true);
            setTimeout(() => {
                router.push('/dashboard/recordings');
            }, 2000);

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
                    <Link href="/dashboard/setup" className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-medium transition-colors">
                        <Radio className="w-5 h-5" />
                        Live Setup
                    </Link>
                    <Link href="/dashboard/upload" className="flex items-center gap-3 px-4 py-3 rounded-lg bg-indigo-500/10 text-indigo-400 font-medium transition-colors">
                        <UploadCloud className="w-5 h-5" />
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
                    <h1 className="text-3xl font-bold tracking-tight mb-2">
                        {sessionId ? "Upload High-Quality Recording" : "Upload Pre-recorded Video"}
                    </h1>
                    <p className="text-zinc-400">
                        {sessionId ? "Attach a local recording to your recently ended live session." : "Publish your edited podcasts, shorts, or clips to your audience."}
                    </p>
                </header>

                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Main Upload Form */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6">
                            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                                <Video className="w-5 h-5 text-indigo-400" />
                                Video Details
                            </h2>

                            <div className="space-y-5">
                                {error && (
                                    <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-lg">
                                        {error}
                                    </div>
                                )}
                                {success && (
                                    <div className="bg-green-500/10 border border-green-500/50 text-green-500 text-sm p-3 rounded-lg flex items-center gap-2">
                                        <CheckCircle2 className="w-5 h-5" />
                                        Video published successfully! Redirecting...
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-2">Video Title *</label>
                                    <input
                                        type="text"
                                        name="title"
                                        value={formData.title}
                                        onChange={handleChange}
                                        placeholder="E.g., How to start a startup in 2026"
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
                                        placeholder="Tell viewers about your podcast..."
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
                                            <option>Finance</option>
                                            <option>Gaming</option>
                                            <option>General</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-2">Custom Thumbnail</label>
                                        <input
                                            type="file"
                                            id="thumbnail"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => {
                                                if (e.target.files && e.target.files[0]) {
                                                    setThumbnailFile(e.target.files[0]);
                                                }
                                            }}
                                        />
                                        <label htmlFor="thumbnail" className="w-full h-[50px] bg-black border border-zinc-800 border-dashed rounded-xl flex items-center justify-center text-sm text-indigo-400 hover:text-indigo-300 hover:border-indigo-500/50 cursor-pointer overflow-hidden transition-colors relative">
                                            {thumbnailFile ? (
                                                <span className="truncate px-4">{thumbnailFile.name}</span>
                                            ) : (
                                                "Choose Image"
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

                            <h3 className="text-lg font-semibold mb-4">Select Video File</h3>
                            <div className="mb-6">
                                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-indigo-500/50 border-dashed rounded-xl cursor-pointer bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors">
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        <UploadCloud className="w-8 h-8 mb-2 text-indigo-400" />
                                        <p className="text-sm text-indigo-200/80 text-center px-4">
                                            {videoFile ? <span className="font-bold text-white break-all">{videoFile.name}</span> : "Click to select MP4 video"}
                                        </p>
                                    </div>
                                    <input type="file" className="hidden" accept="video/mp4,video/webm" onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) {
                                            setVideoFile(e.target.files[0]);
                                        }
                                    }} />
                                </label>
                            </div>

                            <button
                                onClick={handleUpload}
                                disabled={loading || success}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
                                {loading ? "Uploading & Processing..." : "Publish Video"}
                            </button>
                        </div>
                    </div>
                </div>
            </main >
        </div >
    );
}
