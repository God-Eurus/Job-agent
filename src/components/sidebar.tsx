"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconGauge,
  IconUser,
  IconBriefcase,
  IconInbox,
  IconStore,
  IconMail,
  IconZap,
  IconCheck,
  IconMenu,
  IconX,
} from "./icons";

const nav = [
  { href: "/", label: "Dashboard", Icon: IconGauge },
  { href: "/setup", label: "Profile", Icon: IconUser },
  { href: "/jobs", label: "Jobs", Icon: IconBriefcase, badge: "matched" as const },
  { href: "/queue", label: "Approval Queue", Icon: IconInbox, badge: "pending" as const },
  { href: "/bizdev", label: "Freelance Leads", Icon: IconStore, badge: "leads" as const },
  { href: "/completed", label: "Completed", Icon: IconCheck, badge: "done" as const },
];

type Counts = { matched: number; pending: number; leads: number; done: number };

export default function Sidebar({ gmailConnected }: { gmailConnected: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Counts | null>(null);

  // Badge counts refresh on navigation so the queue count stays honest.
  useEffect(() => {
    setOpen(false);
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setCounts(d.counts))
      .catch(() => {});
  }, [pathname]);

  const body = (
    <>
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <IconZap className="h-4 w-4 text-ink" />
        <span className="mono text-[13px] font-semibold uppercase tracking-[0.14em]">
          job agent
        </span>
      </div>

      <nav className="flex-1 py-2">
        {nav.map(({ href, label, Icon, badge }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const count = badge && counts ? counts[badge] : 0;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`group flex cursor-pointer items-center gap-3 border-l-2 px-5 py-2.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                active
                  ? "border-l-ink bg-surface-2/60 font-medium text-ink"
                  : "border-l-transparent text-ink-muted hover:bg-surface-2/40 hover:text-ink"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{label}</span>
              {count > 0 && (
                <span className="mono text-[11px] tabular-nums text-ink-muted">{count}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line px-5 py-3">
        <a
          href="/api/gmail/auth"
          title={gmailConnected ? "Gmail connected — click to reconnect" : "Connect Gmail to send approved emails"}
          className="flex cursor-pointer items-center gap-2 text-[11px] uppercase tracking-wider text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          {gmailConnected ? (
            <>
              <IconCheck className="h-3 w-3 text-ok" />
              <span className="mono">gmail linked</span>
            </>
          ) : (
            <>
              <IconMail className="h-3 w-3" />
              <span className="mono">connect gmail</span>
            </>
          )}
        </a>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur lg:hidden">
        <button
          onClick={() => setOpen(true)}
          className="cursor-pointer rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="Open navigation menu"
        >
          <IconMenu className="h-5 w-5" />
        </button>
        <span className="mono text-sm font-semibold glow">job_agent</span>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-line bg-surface">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 cursor-pointer rounded-lg p-2 text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
              aria-label="Close navigation menu"
            >
              <IconX className="h-4 w-4" />
            </button>
            {body}
          </aside>
        </div>
      )}

      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-line bg-surface/60 backdrop-blur lg:flex">
        {body}
      </aside>
    </>
  );
}
