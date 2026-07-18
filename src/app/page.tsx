import Link from "next/link";
import db, { getProfile, sentToday } from "@/lib/db";
import { IconBriefcase, IconInbox, IconSend, IconZap, IconUser } from "@/components/icons";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const counts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM jobs) AS jobs,
        (SELECT COUNT(*) FROM jobs WHERE score >= 60) AS matched,
        (SELECT COUNT(*) FROM apps WHERE status = 'applied') AS applied,
        (SELECT COUNT(*) FROM apps WHERE status IN ('draft','failed')) +
        (SELECT COUNT(*) FROM emails WHERE status IN ('draft','failed')) AS pending,
        (SELECT COUNT(*) FROM emails WHERE status = 'sent') AS sent`
    )
    .get() as { jobs: number; matched: number; applied: number; pending: number; sent: number };

  const top = db
    .prepare(
      "SELECT id, title, company, score, status FROM jobs WHERE score IS NOT NULL ORDER BY score DESC LIMIT 6"
    )
    .all() as Array<{ id: number; title: string; company: string; score: number; status: string }>;

  const { resume } = getProfile();

  const stats = [
    { label: "jobs_found", value: counts.jobs, Icon: IconBriefcase },
    { label: "matched", value: counts.matched, Icon: IconZap, accent: true },
    { label: "applied", value: counts.applied, Icon: IconSend },
    { label: "awaiting_approval", value: counts.pending, Icon: IconInbox },
    { label: "emails_sent", value: `${sentToday()} today / ${counts.sent}`, Icon: IconSend },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {resume ? `Running for ${resume.name}` : "No profile yet — start in Profile."}
          </p>
        </div>
        {!resume && (
          <Link href="/setup" className="btn-primary">
            <IconUser className="h-4 w-4" /> Set up profile
          </Link>
        )}
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {stats.map(({ label, value, Icon, accent }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="mono text-xs text-ink-muted">{label}</span>
              <Icon className={`h-4 w-4 ${accent ? "text-accent" : "text-ink-muted"}`} />
            </div>
            <div className={`mono mt-2 text-2xl font-semibold ${accent ? "text-accent glow" : ""}`}>
              {value}
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold">Top matches</h2>
          <Link href="/jobs" className="cursor-pointer text-xs text-accent hover:underline">
            View all →
          </Link>
        </div>
        {top.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-muted">
            Nothing yet. Go to Jobs → Hunt to fetch and score the latest openings.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {top.map((j) => (
              <li key={j.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-sm font-medium">{j.title}</div>
                  <div className="text-xs text-ink-muted">{j.company}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="mono rounded-md bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                    {j.score}
                  </span>
                  <span className="mono text-xs text-ink-muted">{j.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
