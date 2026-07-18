import type { Metadata } from "next";
import Link from "next/link";
import { Fira_Code, Fira_Sans } from "next/font/google";
import {
  IconGauge,
  IconUser,
  IconBriefcase,
  IconInbox,
  IconStore,
  IconMail,
  IconZap,
} from "@/components/icons";
import "./globals.css";

const firaCode = Fira_Code({
  subsets: ["latin"],
  variable: "--font-fira-code",
  weight: ["400", "500", "600", "700"],
});
const firaSans = Fira_Sans({
  subsets: ["latin"],
  variable: "--font-fira-sans",
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Job Agent",
  description: "Personal job-hunt + outreach copilot",
};

const nav = [
  { href: "/", label: "Dashboard", Icon: IconGauge },
  { href: "/setup", label: "Profile", Icon: IconUser },
  { href: "/jobs", label: "Jobs", Icon: IconBriefcase },
  { href: "/queue", label: "Approval Queue", Icon: IconInbox },
  { href: "/bizdev", label: "Freelance Leads", Icon: IconStore },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${firaCode.variable} ${firaSans.variable}`}>
      <body>
        <div className="flex min-h-screen">
          <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-line bg-surface/60 backdrop-blur">
            <div className="flex items-center gap-2 px-5 py-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <IconZap className="h-4.5 w-4.5" />
              </span>
              <span className="mono text-base font-semibold tracking-tight glow">
                job_agent
              </span>
            </div>
            <nav className="mt-2 flex-1 space-y-1 px-3">
              {nav.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-muted transition-colors duration-200 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Icon className="h-4.5 w-4.5 transition-colors duration-200 group-hover:text-accent" />
                  {label}
                </Link>
              ))}
            </nav>
            <div className="border-t border-line p-3">
              <a
                href="/api/gmail/auth"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-line px-3 py-2.5 text-xs font-medium text-ink-muted transition-colors duration-200 hover:border-accent/50 hover:text-accent"
              >
                <IconMail className="h-4 w-4" />
                Connect Gmail
              </a>
            </div>
          </aside>
          <main className="ml-60 flex-1 px-8 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
