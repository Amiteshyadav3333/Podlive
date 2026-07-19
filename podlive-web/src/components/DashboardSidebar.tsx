"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Mic, Home, Radio, UploadCloud, Video, Users, Settings, LogOut, ChevronRight } from "lucide-react";

const NAV = [
  { href: "/dashboard", icon: Home, label: "Home" },
  { href: "/dashboard/setup", icon: Radio, label: "Go Live" },
  { href: "/dashboard/upload", icon: UploadCloud, label: "Upload" },
  { href: "/dashboard/recordings", icon: Video, label: "Videos" },
  { href: "/dashboard/audience", icon: Users, label: "Audience" },
];

const MOBILE_NAV = [
  { href: "/dashboard", icon: Home, label: "Home" },
  { href: "/dashboard/setup", icon: Radio, label: "Live" },
  { href: "/dashboard/upload", icon: UploadCloud, label: "Upload" },
  { href: "/dashboard/recordings", icon: Video, label: "Video" },
  { href: "/dashboard/audience", icon: Users, label: "Audience" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

export default function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const u = localStorage.getItem("user");
    if (u) setUser(JSON.parse(u));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const getAvatarUrl = () => {
    const name = user?.display_name || "U";
    return user?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-60 border-r border-white/[0.06] bg-[#0c0c0c] flex flex-col z-50 hidden md:flex">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/[0.06]">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base tracking-tight">PodLive</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                  active
                    ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? "text-indigo-400" : "text-zinc-500 group-hover:text-white"}`} />
                {label}
                {active && <ChevronRight className="w-3 h-3 ml-auto text-indigo-400/60" />}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-4 border-t border-white/[0.06] space-y-0.5">
          {user && (
            <div className="flex items-center gap-3 px-3 py-2.5 mb-2">
              <img
                src={getAvatarUrl()}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.display_name || "U")}&background=6366f1&color=fff`;
                }}
                className="w-8 h-8 rounded-full object-cover border border-white/10"
                alt={user.display_name}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user.display_name}</p>
                <p className="text-xs text-zinc-500 truncate">{user.unique_handle}</p>
              </div>
            </div>
          )}
          <Link
            href="/dashboard/settings"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
              pathname === "/dashboard/settings"
                ? "bg-indigo-600/15 text-indigo-400"
                : "text-zinc-400 hover:text-white hover:bg-white/[0.05]"
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-red-400 hover:bg-red-500/[0.07] transition-all"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Log out
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar (Always visible on mobile screens) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0c0c0c]/95 backdrop-blur-xl border-t border-white/[0.08] px-1 py-1.5 flex items-center justify-around md:hidden shadow-2xl">
        {MOBILE_NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all ${
                active ? "text-indigo-400" : "text-zinc-400 hover:text-white"
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-colors ${active ? "bg-indigo-600/20 text-indigo-400" : ""}`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={`text-[10px] tracking-tight mt-0.5 ${active ? "font-bold text-indigo-400" : "font-medium text-zinc-400"}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
