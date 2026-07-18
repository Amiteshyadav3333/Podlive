"use client";

import { useEffect, useState, useRef } from "react";
import {
  Video, Play, Loader2, Trash2, Eye, Clock, TrendingUp,
  MoreVertical, Image as ImageIcon, Upload, X, Subtitles, CheckCircle2, AlertCircle
} from "lucide-react";
import { useRouter } from "next/navigation";
import { buildApiUrl } from "@/lib/api";
import DashboardSidebar from "@/components/DashboardSidebar";
import { formatDistanceToNow } from "date-fns";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
];

export default function Recordings() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 3-dot menu state
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Thumbnail upload modal
  const [thumbnailModal, setThumbnailModal] = useState<{ recId: string; videoId: string } | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [thumbnailSuccess, setThumbnailSuccess] = useState(false);
  const [thumbnailError, setThumbnailError] = useState("");

  // Subtitle upload modal
  const [subtitleModal, setSubtitleModal] = useState<{ recId: string; videoId: string } | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [subtitleLang, setSubtitleLang] = useState("en");
  const [subtitleLabel, setSubtitleLabel] = useState("English");
  const [subtitleUploading, setSubtitleUploading] = useState(false);
  const [subtitleSuccess, setSubtitleSuccess] = useState(false);
  const [subtitleError, setSubtitleError] = useState("");

  useEffect(() => {
    fetchRecordings();
  }, []);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchRecordings = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) { router.push("/login"); return; }
    try {
      const res = await fetch(buildApiUrl("/api/user/recordings"), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setRecordings(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this recording? This cannot be undone.")) return;
    setDeletingId(id);
    setMenuOpenId(null);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(buildApiUrl(`/api/live/${id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setRecordings(prev => prev.filter(r => r.id !== id));
    } catch (err) { console.error(err); }
    finally { setDeletingId(null); }
  };

  const openThumbnailModal = (rec: any) => {
    const videoId = rec.video?.id;
    if (!videoId) {
      alert("This video is still processing. Please try again later.");
      return;
    }
    setThumbnailModal({ recId: rec.id, videoId });
    setThumbnailFile(null);
    setThumbnailSuccess(false);
    setThumbnailError("");
    setMenuOpenId(null);
  };

  const handleThumbnailUpload = async () => {
    if (!thumbnailFile || !thumbnailModal) return;
    setThumbnailUploading(true);
    setThumbnailError("");
    try {
      const token = localStorage.getItem("accessToken");
      const data = new FormData();
      data.append("thumbnail", thumbnailFile);

      const res = await fetch(buildApiUrl(`/api/videos/${thumbnailModal.videoId}/thumbnail`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: data
      });

      const result = await res.json();
      if (res.ok) {
        setThumbnailSuccess(true);
        // Update the recording's thumbnail_url locally
        setRecordings(prev => prev.map(r =>
          r.id === thumbnailModal.recId
            ? { ...r, thumbnail_url: result.thumbnailUrl }
            : r
        ));
        setTimeout(() => setThumbnailModal(null), 1500);
      } else {
        setThumbnailError(result.error || "Upload failed");
      }
    } catch (err: any) {
      setThumbnailError(err.message || "Network error");
    } finally {
      setThumbnailUploading(false);
    }
  };

  const openSubtitleModal = (rec: any) => {
    const videoId = rec.video?.id;
    if (!videoId) {
      alert("This video is still processing. Please try again later.");
      return;
    }
    setSubtitleModal({ recId: rec.id, videoId });
    setSubtitleFile(null);
    setSubtitleLang("en");
    setSubtitleLabel("English");
    setSubtitleSuccess(false);
    setSubtitleError("");
    setMenuOpenId(null);
  };

  const handleSubtitleUpload = async () => {
    if (!subtitleFile || !subtitleModal) return;
    setSubtitleUploading(true);
    setSubtitleError("");
    try {
      const token = localStorage.getItem("accessToken");
      const data = new FormData();
      data.append("subtitle", subtitleFile);
      data.append("language", subtitleLang);
      data.append("label", subtitleLabel);

      const res = await fetch(buildApiUrl(`/api/videos/${subtitleModal.videoId}/subtitles`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: data
      });

      const result = await res.json();
      if (res.ok) {
        setSubtitleSuccess(true);
        setTimeout(() => setSubtitleModal(null), 1500);
      } else {
        setSubtitleError(result.error || "Upload failed");
      }
    } catch (err: any) {
      setSubtitleError(err.message || "Network error");
    } finally {
      setSubtitleUploading(false);
    }
  };

  const thumbnailPreview = thumbnailFile ? URL.createObjectURL(thumbnailFile) : null;

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <DashboardSidebar />
      <div className="md:ml-60">
        <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl px-6 h-14 flex items-center justify-between">
          <h1 className="font-bold text-base">My Videos</h1>
          <span className="text-xs text-zinc-500">{recordings.length} videos</span>
        </div>

        <div className="p-6 max-w-6xl">
          {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {[...Array(8)].map((_, i) => (
                <div key={i}>
                  <div className="aspect-video skeleton rounded-xl mb-3" />
                  <div className="space-y-2">
                    <div className="h-3 skeleton rounded w-3/4" />
                    <div className="h-3 skeleton rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : recordings.length === 0 ? (
            <div className="glass p-12 rounded-2xl flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/15 flex items-center justify-center mb-4">
                <Video className="w-8 h-8 text-indigo-400" />
              </div>
              <h2 className="text-xl font-bold mb-2">No videos yet</h2>
              <p className="text-zinc-400 text-sm max-w-sm mb-6">Upload a video to get started.</p>
              <button onClick={() => router.push("/dashboard/upload")} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors">
                <Upload className="w-4 h-4" /> Upload Video
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {recordings.map((rec) => (
                <div key={rec.id} className="group relative">
                  {/* Thumbnail */}
                  <div
                    onClick={() => router.push(`/watch/${rec.id}`)}
                    className="relative aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-white/[0.06] group-hover:border-indigo-500/40 transition-all cursor-pointer"
                  >
                    {rec.thumbnail_url ? (
                      <img src={rec.thumbnail_url} alt={rec.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Video className="w-10 h-10 text-zinc-700" />
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center">
                        <Play className="w-5 h-5 text-white ml-1" fill="white" />
                      </div>
                    </div>

                    {/* Processing badge */}
                    {rec.is_processing && (
                      <div className="absolute bottom-2 left-2 bg-amber-500 text-black text-[10px] font-bold px-2 py-0.5 rounded">Processing</div>
                    )}

                    {/* Category badge */}
                    {rec.category && (
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded">{rec.category}</div>
                    )}

                    {/* Duration badge */}
                    {rec.video?.duration_seconds && (
                      <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                        {Math.floor(rec.video.duration_seconds / 60)}:{String(rec.video.duration_seconds % 60).padStart(2, '0')}
                      </div>
                    )}
                  </div>

                  {/* Info + 3-dot menu */}
                  <div className="mt-2.5 flex items-start gap-2">
                    <div className="flex-1 min-w-0" onClick={() => router.push(`/watch/${rec.id}`)} style={{ cursor: 'pointer' }}>
                      <h3 className="text-sm font-semibold text-white line-clamp-2 leading-snug group-hover:text-indigo-400 transition-colors">{rec.title}</h3>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500">
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{rec.views || 0}</span>
                        <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />{rec.viewer_count_peak || 0} peak</span>
                        <span className="flex items-center gap-1 ml-auto">
                          <Clock className="w-3 h-3" />
                          {rec.ended_at ? formatDistanceToNow(new Date(rec.ended_at), { addSuffix: true }) : "—"}
                        </span>
                      </div>
                    </div>

                    {/* 3-dot menu button */}
                    <div className="relative" ref={menuOpenId === rec.id ? menuRef : undefined}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === rec.id ? null : rec.id);
                        }}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {/* Dropdown menu */}
                      {menuOpenId === rec.id && (
                        <div className="absolute right-0 top-8 z-50 w-48 bg-zinc-900/95 border border-white/10 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden animate-fade-in">
                          <button
                            onClick={() => { router.push(`/watch/${rec.id}`); setMenuOpenId(null); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/5 transition-colors text-left"
                          >
                            <Play className="w-4 h-4 text-indigo-400" />
                            Watch Video
                          </button>
                          <button
                            onClick={() => openThumbnailModal(rec)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/5 transition-colors text-left"
                          >
                            <ImageIcon className="w-4 h-4 text-green-400" />
                            {rec.thumbnail_url ? "Change Thumbnail" : "Add Thumbnail"}
                          </button>
                          <button
                            onClick={() => openSubtitleModal(rec)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/5 transition-colors text-left"
                          >
                            <Subtitles className="w-4 h-4 text-purple-400" />
                            Add Subtitles
                          </button>
                          <div className="border-t border-white/5" />
                          <button
                            onClick={() => handleDelete(rec.id)}
                            disabled={deletingId === rec.id}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
                          >
                            {deletingId === rec.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            Delete Video
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== THUMBNAIL UPLOAD MODAL ===== */}
      {thumbnailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => !thumbnailUploading && setThumbnailModal(null)}>
          <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => !thumbnailUploading && setThumbnailModal(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-green-400" />
              {thumbnailSuccess ? "Thumbnail Updated!" : "Upload Thumbnail"}
            </h2>
            <p className="text-xs text-zinc-500 mb-5">Select an image to use as the video thumbnail</p>

            {thumbnailError && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-xl mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" />{thumbnailError}
              </div>
            )}

            {thumbnailSuccess ? (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 text-sm p-3 rounded-xl">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Thumbnail updated successfully!
              </div>
            ) : (
              <>
                {/* Image preview */}
                <div className="relative aspect-video w-full bg-zinc-800 rounded-xl border-2 border-dashed border-white/10 overflow-hidden mb-4">
                  {thumbnailPreview ? (
                    <img src={thumbnailPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-700/50 transition-colors">
                      <ImageIcon className="w-10 h-10 text-zinc-600 mb-2" />
                      <span className="text-sm text-zinc-400">Click to select image</span>
                      <span className="text-xs text-zinc-600 mt-1">JPG, PNG, WebP • Max 10MB</span>
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && setThumbnailFile(e.target.files[0])} />
                    </label>
                  )}
                </div>

                {thumbnailFile && (
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs text-zinc-400 truncate flex-1">{thumbnailFile.name}</span>
                    <button onClick={() => setThumbnailFile(null)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                  </div>
                )}

                {!thumbnailFile && (
                  <label className="block w-full text-center bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-xl py-3 cursor-pointer text-sm font-medium text-zinc-300 transition-colors mb-4">
                    <span className="flex items-center justify-center gap-2">
                      <Upload className="w-4 h-4" /> Choose Image
                    </span>
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && setThumbnailFile(e.target.files[0])} />
                  </label>
                )}

                <button
                  onClick={handleThumbnailUpload}
                  disabled={!thumbnailFile || thumbnailUploading}
                  className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  {thumbnailUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {thumbnailUploading ? "Uploading..." : "Upload Thumbnail"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== SUBTITLE UPLOAD MODAL ===== */}
      {subtitleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => !subtitleUploading && setSubtitleModal(null)}>
          <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => !subtitleUploading && setSubtitleModal(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
              <Subtitles className="w-5 h-5 text-purple-400" />
              {subtitleSuccess ? "Subtitle Added!" : "Upload Subtitles"}
            </h2>
            <p className="text-xs text-zinc-500 mb-5">Upload a VTT or SRT subtitle file for your video</p>

            {subtitleError && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-xl mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" />{subtitleError}
              </div>
            )}

            {subtitleSuccess ? (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 text-sm p-3 rounded-xl">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Subtitle added successfully!
              </div>
            ) : (
              <>
                {/* Language selector */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Language</label>
                    <select
                      value={subtitleLang}
                      onChange={(e) => {
                        setSubtitleLang(e.target.value);
                        const found = LANGUAGES.find(l => l.code === e.target.value);
                        if (found) setSubtitleLabel(found.label);
                      }}
                      className="w-full bg-zinc-800 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/70 transition-all"
                    >
                      {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Label</label>
                    <input
                      type="text"
                      value={subtitleLabel}
                      onChange={(e) => setSubtitleLabel(e.target.value)}
                      placeholder="E.g., English"
                      className="w-full bg-zinc-800 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/70 transition-all placeholder:text-zinc-600"
                    />
                  </div>
                </div>

                {/* File picker */}
                <label className="block w-full bg-zinc-800 hover:bg-zinc-700 border border-white/10 border-dashed rounded-xl py-6 cursor-pointer transition-colors mb-4">
                  <div className="flex flex-col items-center justify-center text-center">
                    {subtitleFile ? (
                      <>
                        <CheckCircle2 className="w-8 h-8 text-purple-400 mb-2" />
                        <span className="text-sm text-white font-medium truncate max-w-[80%]">{subtitleFile.name}</span>
                        <span className="text-xs text-zinc-500 mt-1">{(subtitleFile.size / 1024).toFixed(1)} KB</span>
                      </>
                    ) : (
                      <>
                        <Subtitles className="w-8 h-8 text-zinc-600 mb-2" />
                        <span className="text-sm text-zinc-400">Click to select subtitle file</span>
                        <span className="text-xs text-zinc-600 mt-1">VTT or SRT format • Max 5MB</span>
                      </>
                    )}
                  </div>
                  <input type="file" className="hidden" accept=".vtt,.srt,text/vtt,application/x-subrip" onChange={(e) => e.target.files?.[0] && setSubtitleFile(e.target.files[0])} />
                </label>

                <button
                  onClick={handleSubtitleUpload}
                  disabled={!subtitleFile || subtitleUploading || !subtitleLabel.trim()}
                  className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  {subtitleUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {subtitleUploading ? "Uploading..." : "Upload Subtitle"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
