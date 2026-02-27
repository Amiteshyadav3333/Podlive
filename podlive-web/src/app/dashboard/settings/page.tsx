"use client";

import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Settings() {
    const router = useRouter();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const token = localStorage.getItem("accessToken");
            if (!token) {
                router.push("/login");
                return;
            }

            const res = await fetch(`http://${window.location.hostname}:5005/api/user/profile`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setProfile(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage("");
        try {
            const token = localStorage.getItem("accessToken");
            const res = await fetch(`http://${window.location.hostname}:5005/api/user/profile`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    display_name: profile.display_name,
                    bio: profile.bio
                })
            });
            if (res.ok) setMessage("Profile saved successfully!");
        } catch (error) {
            setMessage("Error saving profile.");
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        router.push("/login");
    };

    if (loading) return <div className="text-white p-8">Loading...</div>;

    return (
        <div className="md:ml-64 p-8 max-w-5xl min-h-screen">
            <header className="mb-10 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight mb-2 text-white">Settings</h1>
                    <p className="text-zinc-400">Manage your profile and account settings.</p>
                </div>
                <button onClick={() => router.push('/dashboard')} className="px-4 py-2 border border-zinc-700 rounded-lg hover:bg-zinc-800 text-white transition-colors">
                    Back to Dashboard
                </button>
            </header>

            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 max-w-2xl">
                <h2 className="text-xl font-semibold text-white mb-6">Profile Details</h2>

                {message && <div className="bg-green-500/10 text-green-500 p-3 mb-6 rounded-lg text-sm">{message}</div>}

                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-2">Display Name</label>
                        <input
                            type="text"
                            value={profile?.display_name || ""}
                            onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                            className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 text-white"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-2">Unique Handle</label>
                        <input
                            type="text"
                            value={profile?.unique_handle || ""}
                            disabled
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none text-zinc-500 cursor-not-allowed"
                        />
                        <p className="text-xs text-zinc-500 mt-2">Unique handles cannot be changed frequently.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-2">Bio</label>
                        <textarea
                            rows={4}
                            value={profile?.bio || ""}
                            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                            placeholder="Tell your audience about yourself..."
                            className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 text-white resize-none"
                        />
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium transition-colors w-full sm:w-auto flex items-center justify-center gap-2"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
                    </button>

                    <hr className="border-zinc-800 my-8" />

                    <h2 className="text-xl font-semibold text-red-500 mb-4">Danger Zone</h2>
                    <button onClick={handleLogout} className="bg-red-500/10 border border-red-500/50 hover:bg-red-500/20 text-red-500 px-6 py-3 rounded-xl font-medium transition-colors">
                        Log out
                    </button>
                </div>
            </div>
        </div>
    );
}
