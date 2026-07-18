"use client";
import { useEffect, useState } from "react";
import { IconRefresh, IconZap, IconX, IconLink } from "@/components/icons";

type Job = {
  id: number;
  source: string;
  title: string;
  company: string;
  location: string | null;
  remote: number;
  salary: string | null;
  url: string;
  score: number;
  score_reason: string;
  status: string;
};

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [hunting, setHunting] = useState(false);
  const [prepping, setPrepping] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () =>
    fetch("/api/jobs").then((r) => r.json()).then((d) => setJobs(d.jobs ?? []));

  useEffect(() => {
    load();
  }, []);

  async function hunt() {
    setHunting(true);
    setMsg(null);
    const res = await fetch("/api/hunt", { method: "POST" });
    const d = await res.json();
    setHunting(false);
    setMsg(
      res.ok
        ? `Fetched ${d.fetched}, ${d.inserted} new, ${d.scored} scored.${d.errors?.length ? ` ${d.errors.length} source errors.` : ""}`
        : d.error
    );
    load();
  }

  async function act(jobId: number, action: "prep" | "skip") {
    if (action === "prep") setPrepping(jobId);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, action }),
    });
    const d = await res.json();
    setPrepping(null);
    if (action === "prep") {
      setMsg(
        res.ok
          ? d.outreach?.found
            ? `Drafts ready in queue. Hiring contact found: ${d.outreach.email}`
            : "Application draft ready in queue. No hiring contact found."
          : d.error
      );
    }
    load();
  }

  const scoreColor = (s: number) =>
    s >= 75 ? "bg-accent/15 text-accent" : s >= 60 ? "bg-warn/15 text-warn" : "bg-surface-2 text-ink-muted";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Scored against your profile. Prep = cover letter + hiring-manager email drafted into queue.
          </p>
        </div>
        <button onClick={hunt} disabled={hunting} className="btn-primary">
          <IconRefresh className={`h-4 w-4 ${hunting ? "animate-spin" : ""}`} />
          {hunting ? "Hunting…" : "Hunt latest jobs"}
        </button>
      </header>

      {msg && (
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-muted">{msg}</p>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-muted">
              <th className="mono px-5 py-3 font-medium">score</th>
              <th className="mono px-3 py-3 font-medium">role</th>
              <th className="mono px-3 py-3 font-medium">location</th>
              <th className="mono px-3 py-3 font-medium">salary</th>
              <th className="mono px-3 py-3 font-medium">status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {jobs.map((j) => (
              <tr key={j.id} className="group transition-colors duration-150 hover:bg-surface-2/50">
                <td className="px-5 py-3.5">
                  <span
                    className={`mono inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${scoreColor(j.score)}`}
                    title={j.score_reason}
                  >
                    {j.score}
                  </span>
                </td>
                <td className="px-3 py-3.5">
                  <div className="font-medium">{j.title}</div>
                  <div className="text-xs text-ink-muted">
                    {j.company} · {j.source}
                  </div>
                </td>
                <td className="px-3 py-3.5 text-ink-muted">
                  {j.remote ? "Remote" : j.location ?? "—"}
                </td>
                <td className="px-3 py-3.5 text-ink-muted">{j.salary ?? "—"}</td>
                <td className="mono px-3 py-3.5 text-xs text-ink-muted">{j.status}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    <a href={j.url} target="_blank" rel="noreferrer" className="btn-ghost" aria-label="Open job posting">
                      <IconLink className="h-4 w-4" />
                    </a>
                    {j.status === "matched" && (
                      <>
                        <button
                          onClick={() => act(j.id, "prep")}
                          disabled={prepping === j.id}
                          className="btn-primary"
                        >
                          <IconZap className="h-4 w-4" />
                          {prepping === j.id ? "Drafting…" : "Prep"}
                        </button>
                        <button onClick={() => act(j.id, "skip")} className="btn-danger" aria-label="Skip job">
                          <IconX className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-ink-muted">
                  No scored jobs yet. Hit “Hunt latest jobs”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
