import type { Metadata, Viewport } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import Sidebar from "@/components/sidebar";
import { ToastHost } from "@/components/ui";
import { gmailReady } from "@/lib/gmail";
import "./globals.css";

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  weight: ["400", "500", "600", "700"],
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Job Agent",
  description: "Personal job-hunt + outreach copilot",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${plexMono.variable}`}>
      <body>
        <ToastHost>
          <Sidebar gmailConnected={gmailReady()} />
          <main className="min-h-screen px-4 pb-10 pt-20 sm:px-6 lg:ml-60 lg:px-8 lg:pt-8">
            {children}
          </main>
        </ToastHost>
      </body>
    </html>
  );
}
