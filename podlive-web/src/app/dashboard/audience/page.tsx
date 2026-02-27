"use client";

import { useEffect, useState } from "react";
import { Users, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Audience() {
    const router = useRouter();
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAudienceStats();
    }, []);

    const fetchAudienceStats = async () => {
        try {
            const token = localStorage.getItem("accessToken");
            if (!token) {
                router.push("/login");
                return;
            }

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://" + window.location.hostname + ":5005"}/api/user/audience`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setStats(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="md:ml-64 p-8 min-h-screen flex items-center justify-center text-white">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="md:ml-64 p-8 max-w-5xl min-h-screen">
            <header className="mb-10 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight mb-2 text-white">Audience Insights</h1>
                    <p className="text-zinc-400">Manage your followers and audience metrics.</p>
                </div>
                <button onClick={() => router.push('/dashboard')} className="px-4 py-2 border border-zinc-700 rounded-lg hover:bg-zinc-800 text-white transition-colors">
                    Back to Dashboard
                </button>
            </header>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
                <div className="bg-zinc-900 border border-white/10 p-6 rounded-2xl">
                    <p className="text-sm font-medium text-zinc-400 mb-1">Total Followers</p>
                    <h3 className="text-3xl font-bold text-white">{stats?.followers || 0}</h3>
                </div>
                <div className="bg-zinc-900 border border-white/10 p-6 rounded-2xl">
                    <p className="text-sm font-medium text-zinc-400 mb-1">Total Live Views</p>
                    <h3 className="text-3xl font-bold text-white">{stats?.totalViews || 0}</h3>
                </div>
                <div className="bg-zinc-900 border border-white/10 p-6 rounded-2xl">
                    <p className="text-sm font-medium text-zinc-400 mb-1">Total Podcasts</p>
                    <h3 className="text-3xl font-bold text-white">{stats?.totalLives || 0}</h3>
                </div>
            </div>

            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
                <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mb-6">
                    <Users className="w-8 h-8 text-purple-400" />
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">Grow your community!</h2>
                <p className="text-zinc-400 max-w-sm">
                    Consistency is key. Schedule regular live sessions to boost your follower retention.
                </p>
            </div>
        </div>
    );
}
