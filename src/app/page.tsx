import Link from "next/link";
import db, { getProfile, sentToday } from "@/lib/db";
import { gmailReady } from "@/lib/gmail";
import { ScoreBar, StatusBadge } from "@/components/ui";
import { IconUser, IconRefresh, IconCheck, IconCircleDot } from "@/components/icons";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const counts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM jobs) AS jobs,
        (SELECT COUNT(*) FROM jobs WHERE status = 'matched') AS matched,
        (SELECT COUNT(*) FROM jobs WHERE status = 'applied') AS applied,
        (SELECT COUNT(*) FROM apps WHERE status IN ('draft','failed','manual')) +
        (SELECT COUNT(*) FROM emails WHERE status IN ('draft','failed')) AS pending,
        (SELECT COUNT(*) FROM emails WHERE status = 'sent') AS sent,
        (SELECT COUNT(*) FROM leads) AS leads`
    )
    .get() as Record<string, number>;

  const top = db
    .prepare(
      `SELECT id, title, company, location, remote, score, score_reason, status
       FROM jobs WHERE score IS NOT NULL ORDER BY score DESC, id DESC LIMIT 6`
    )
    .all() as Array<{
    id: number;
    title: string;
    company: string;
    location: string | null;
    remote: number;
    score: number;
    score_reason: string;
    status: string;
  }>;

  const { resume, prefs } = getProfile();
  const boards = (prefs?.ghCompanies?.length ?? 0) + (prefs?.leverCompanies?.length ?? 0);

  const stats = [
    { label: "found", value: counts.jobs, href: "/jobs" },
    { label: "matched", value: counts.matched, href: "/jobs", key: true },
    { label: "prepped", value: counts.pending, href: "/queue", key: true },
    { label: "applied", value: counts.applied, href: "/jobs" },
    { label: "leads", value: counts.leads, href: "/bizdev" },
    { label: "sent", value: `${sentToday()}/${counts.sent}`, href: "/queue" },
  ];

  const steps = [
    { done: Boolean(process.env.ANTHROPIC_API_KEY), label: "Anthropic key", hint: "Parsing, scoring, drafting", required: true },
    { done: Boolean(resume), label: "Resume", hint: "Parsed into a structured profile", required: true, href: "/setup" },
    { done: Boolean(prefs?.roles?.length), label: "Preferences", hint: "Roles, salary, locations", required: true, href: "/setup" },
    { done: gmailReady(), label: "Gmail", hint: "Required to send approved email", required: false },
    { done: boards > 0, label: "GH / Lever boards", hint: "The only sources auto-apply can submit", required: false, href: "/setup" },
    { done: Boolean(process.env.APOLLO_API_KEY || process.env.HUNTER_API_KEY), label: "Contact lookup", hint: "Apollo or Hunter key", required: false },
    { done: Boolean(process.env.GOOGLE_PLACES_API_KEY), label: "Places key", hint: "Freelance lead search", required: false, href: "/bizdev" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            {resume ? `${resume.name} · ${resume.headline}` : "No profile yet — start in Profile"}
          </p>
        </div>
        <div className="flex gap-2">
          {!resume && (
            <Link href="/setup" className="btn-primary">
              <IconUser className="h-3.5 w-3.5" /> Set up profile
            </Link>
          )}
          <Link href="/jobs" className={resume ? "btn-primary" : "btn-ghost"}>
            <IconRefresh className="h-3.5 w-3.5" /> Hunt jobs
          </Link>
        </div>
      </header>

      {/* Dense numeric strip — one hairline grid, no card chrome */}
      <section className="grid grid-cols-3 divide-x divide-line border border-line sm:grid-cols-6">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="cursor-pointer px-4 py-3.5 transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
          >
            <div className="label">{s.label}</div>
            <div
              className={`mono mt-1.5 text-2xl font-semibold tabular-nums ${
                s.key && Number(s.value) > 0 ? "text-ink" : "text-ink-muted"
              }`}
            >
              {s.value}
            </div>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="label">Top matches</h2>
            <Link href="/jobs" className="cursor-pointer text-xs text-ink-muted hover:text-ink">
              All jobs →
            </Link>
          </div>
          <div className="card">
            {top.length === 0 ? (
              <p className="px-4 py-8 text-[13px] text-ink-muted">
                Nothing scored yet. Open Jobs and run a hunt.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {top.map((j) => (
                  <li key={j.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="w-16 shrink-0 pt-0.5">
                      <ScoreBar score={j.score} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-medium">{j.title}</span>
                        <StatusBadge status={j.status} />
                      </div>
                      <div className="mono mt-0.5 text-[11px] text-ink-muted">
                        {j.company} · {j.remote ? "remote" : (j.location ?? "—")}
                      </div>
                      {j.score_reason && (
                        <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">
                          {j.score_reason}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="lg:col-span-2">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="label">Setup</h2>
            <span className="mono text-xs text-ink-muted">
              {doneCount}/{steps.length}
            </span>
          </div>
          <div className="card">
            <ul className="divide-y divide-line">
              {steps.map((s) => {
                const row = (
                  <div className="flex items-start gap-2.5 px-4 py-2.5">
                    {s.done ? (
                      <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
                    ) : (
                      <IconCircleDot
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${s.required ? "text-warn" : "text-ink-muted"}`}
                      />
                    )}
                    <div className="min-w-0">
                      <div className={`text-[13px] ${s.done ? "text-ink-muted" : ""}`}>
                        {s.label}
                        {!s.done && !s.required && (
                          <span className="mono ml-1.5 text-[10px] uppercase tracking-wider text-ink-muted">
                            opt
                          </span>
                        )}
                      </div>
                      {!s.done && (
                        <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">{s.hint}</p>
                      )}
                    </div>
                  </div>
                );
                return (
                  <li key={s.label}>
                    {!s.done && s.href ? (
                      <Link
                        href={s.href}
                        className="block cursor-pointer transition-colors hover:bg-surface-2/50 focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        {row}
                      </Link>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
