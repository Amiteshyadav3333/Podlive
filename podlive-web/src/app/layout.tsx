import type { Metadata } from "next";
import "./globals.css";
import SocketProvider from "@/providers/SocketProvider";
import LanguageInitializer from "@/components/LanguageInitializer";

export const metadata: Metadata = {
  title: "PodLive — भारत का Video और Live Podcast Platform",
  description: "Videos देखें, creators को follow करें और live podcasts के साथ अपनी आवाज़ को stage दें।",
  keywords: ["podcast", "live streaming", "livekit", "hls", "broadcast"],
  openGraph: {
    title: "PodLive",
    description: "Next-Generation Live Podcast Platform",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hi" className="dark">
      <body className="font-sans antialiased bg-[#080808] text-white">
        <SocketProvider>
          <LanguageInitializer />
          {children}
        </SocketProvider>
      </body>
    </html>
  );
}
