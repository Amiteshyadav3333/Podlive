"use client";

import { useState } from "react";
import * as tus from "tus-js-client";
import { UploadCloud, Video, Loader2, CheckCircle2, AlertCircle, Globe2, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { buildApiUrl } from "@/lib/api";
import DashboardSidebar from "@/components/DashboardSidebar";

const CATEGORIES = ["Technology", "Music", "Comedy", "Education", "Finance", "Gaming", "General", "Other (Custom)"];

export default function UploadPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ title: "", description: "", category: "Technology", visibility: "public" });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [customCategory, setCustomCategory] = useState("");

  const handleUpload = async () => {
    if (!formData.title || !videoFile) { setError("Title and video file are required."); return; }
    setLoading(true); setError(""); setUploadProgress(0);
    try {
      const token = localStorage.getItem("accessToken");
      if (!token) throw new Error("Please log in again.");

      const initRes = await fetch(buildApiUrl("/api/upload/direct/init"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...formData,
          category: formData.category === "Other (Custom)" ? customCategory : formData.category,
          fileName: videoFile.name,
          fileSize: videoFile.size,
          contentType: videoFile.type || "application/octet-stream"
        })
      });
      const init = await initRes.json();
      if (!initRes.ok) throw new Error(init.error || init.details || "Could not prepare upload");

      await new Promise<void>(async (resolve, reject) => {
        const upload = new tus.Upload(videoFile, {
          endpoint: init.bunny.endpoint,
          retryDelays: [0, 3000, 5000, 10000, 20000, 60000],
          chunkSize: 16 * 1024 * 1024,
          removeFingerprintOnSuccess: true,
          headers: {
            AuthorizationSignature: init.bunny.signature,
            AuthorizationExpire: String(init.bunny.expirationTime),
            VideoId: init.bunny.videoId,
            LibraryId: String(init.bunny.libraryId)
          },
          metadata: {
            filetype: videoFile.type || "application/octet-stream",
            title: formData.title
          },
          onProgress: (uploaded, total) => setUploadProgress(Math.round((uploaded / total) * 100)),
          onError: (uploadError) => reject(new Error(uploadError.message || "Resumable upload failed")),
          onSuccess: async () => {
            try {
              const completeRes = await fetch(buildApiUrl(`/api/upload/direct/${init.uploadId}/complete`), {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` }
              });
              const complete = await completeRes.json();
              if (!completeRes.ok) throw new Error(complete.error || "Could not finalize upload");
              resolve();
            } catch (completeError) { reject(completeError); }
          }
        });
        const previous = await upload.findPreviousUploads();
        if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      });

      setSuccess(true);
      setTimeout(() => router.push("/dashboard/recordings"), 2000);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };



  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <DashboardSidebar />
      <div className="md:ml-60 pb-24 md:pb-6">
        <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl px-6 h-14 flex items-center">
          <h1 className="font-bold text-base">Upload Video</h1>
        </div>

        <div className="p-6 max-w-4xl">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Form */}
            <div className="lg:col-span-2">
              <div className="glass p-6 rounded-2xl space-y-5">
                <h2 className="font-semibold flex items-center gap-2">
                  <Video className="w-4 h-4 text-indigo-400" />
                  Video Details
                </h2>

                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-xl">
                    <AlertCircle className="w-4 h-4 shrink-0" />{error}
                  </div>
                )}
                {success && (
                  <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 text-sm p-3 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />Published successfully! Redirecting...
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="E.g., How to build a startup in 2025"
                    className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 transition-all text-white placeholder:text-zinc-600"
                  />
                </div>
                <div><label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Visibility</label><div className="grid sm:grid-cols-2 gap-3"><button onClick={()=>setFormData({...formData,visibility:'public'})} className={`p-4 rounded-xl border text-left flex gap-3 ${formData.visibility==='public'?'border-indigo-400 bg-indigo-500/10':'border-white/[.08]'}`}><Globe2 className="w-5 h-5 text-indigo-400"/><span><b className="text-sm block">Public</b><small className="text-zinc-500">YouTube-style discovery for comedy, music and more</small></span></button><button onClick={()=>setFormData({...formData,visibility:'private'})} className={`p-4 rounded-xl border text-left flex gap-3 ${formData.visibility==='private'?'border-violet-400 bg-violet-500/10':'border-white/[.08]'}`}><Lock className="w-5 h-5 text-violet-400"/><span><b className="text-sm block">Private</b><small className="text-zinc-500">Only approved accounts can watch</small></span></button></div></div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Description</label>
                  <textarea
                    rows={4}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Tell viewers about this episode..."
                    className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/70 transition-all text-white placeholder:text-zinc-600 resize-none"
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
                  {formData.category === "Other (Custom)" && (
                    <input
                      type="text"
                      placeholder="Type custom category..."
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      className="mt-3 w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500/70 transition-all text-white placeholder:text-zinc-600"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Action sidebar */}
            <div className="space-y-4">
              <div className="glass p-5 rounded-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 to-transparent pointer-events-none" />

                <h3 className="font-semibold mb-4 relative">Select Video</h3>

                <label className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-indigo-500/30 border-dashed rounded-xl cursor-pointer bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors">
                  <UploadCloud className="w-8 h-8 mb-2 text-indigo-400" />
                  {videoFile ? (
                    <span className="text-xs text-white font-semibold px-3 text-center break-all">{videoFile.name}</span>
                  ) : (
                    <span className="text-xs text-zinc-400 text-center">Click to select MP4 / WebM</span>
                  )}
                  <input type="file" className="hidden" accept="video/mp4,video/webm,video/x-matroska,video/quicktime,.mp4,.webm,.mkv,.mov,.avi" onChange={(e) => e.target.files?.[0] && setVideoFile(e.target.files[0])} />
                </label>

                {/* Upload progress */}
                {loading && uploadProgress > 0 && (
                  <div className="mt-4 relative">
                    <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
                      <span>Uploading...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-1.5">
                      <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                )}

                <button
                  onClick={handleUpload}
                  disabled={loading || success}
                  className="mt-4 w-full relative bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all glow-indigo disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                  {loading ? "Uploading..." : "Publish Video"}
                </button>
              </div>

              <div className="glass p-4 rounded-2xl text-xs text-zinc-500 space-y-1.5">
                <p className="font-semibold text-zinc-400 mb-2">After upload:</p>
                <p>✓ AI subtitles generated (EN, HI, ES)</p>
                <p>✓ Direct resumable upload to Bunny (large files supported)</p>
                <p>✓ HLS adaptive transcoding (1080p → 360p)</p>
                <p>✓ Published to your profile</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
