"use client";
import { useEffect, useState } from "react";
import { IconX, IconExternal, IconZap, IconCheck } from "./icons";
import { ScoreBar, StatusBadge } from "./ui";

type Detail = {
  job: {
    id: number;
    title: string;
    company: string;
    location: string | null;
    remote: number;
    salary: string | null;
    url: string;
    apply_url: string | null;
    source: string;
    posted_at: string | null;
    description: string | null;
    score: number;
    score_reason: string;
    status: string;
  };
  app: { id: number; status: string; cover_letter: string } | null;
};

// Job descriptions arrive as HTML from most boards; render as readable text.
function toText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function JobDrawer({
  jobId,
  onClose,
  onPrep,
  onSkip,
  busy,
}: {
  jobId: number;
  onClose: () => void;
  onPrep: (id: number) => void;
  onSkip: (id: number) => void;
  busy: boolean;
}) {
  const [data, setData] = useState<Detail | null>(null);

  useEffect(() => {
    setData(null);
    fetch(`/api/jobs/${jobId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [jobId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const j = data?.job;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-label="Job details"
        className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-line bg-surface"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {j ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">{j.title}</h2>
                  <StatusBadge status={j.status} />
                </div>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {j.company} · {j.remote ? "Remote" : (j.location ?? "—")}
                  {j.salary ? ` · ${j.salary}` : ""}
                </p>
              </>
            ) : (
              <div className="h-5 w-52 animate-pulse bg-surface-2" />
            )}
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer p-1 text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Close details"
          >
            <IconX className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!j ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-3 animate-pulse bg-surface-2" />
              ))}
            </div>
          ) : (
            <>
              <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-line pb-5 sm:grid-cols-4">
                <div>
                  <dt className="label">Score</dt>
                  <dd className="mt-1">
                    <ScoreBar score={j.score} />
                  </dd>
                </div>
                <div>
                  <dt className="label">Source</dt>
                  <dd className="mono mt-1 text-[13px]">{j.source}</dd>
                </div>
                <div>
                  <dt className="label">Posted</dt>
                  <dd className="mono mt-1 text-[13px]">
                    {j.posted_at ? new Date(j.posted_at).toLocaleDateString() : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="label">Auto-apply</dt>
                  <dd className="mono mt-1 text-[13px]">
                    {["greenhouse", "lever"].includes(j.source) ? "yes" : "manual"}
                  </dd>
                </div>
              </dl>

              {j.score_reason && (
                <section className="mb-5">
                  <h3 className="label mb-1.5">Why this score</h3>
                  <p className="text-[13px] leading-relaxed text-ink-muted">{j.score_reason}</p>
                </section>
              )}

              {data?.app && (
                <section className="mb-5 border border-line bg-bg p-3">
                  <h3 className="label mb-1.5">Cover letter · {data.app.status}</h3>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted">
                    {data.app.cover_letter}
                  </p>
                </section>
              )}

              <section>
                <h3 className="label mb-1.5">Description</h3>
                {j.description ? (
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted">
                    {toText(j.description)}
                  </p>
                ) : (
                  <p className="text-[13px] text-ink-muted">
                    No description captured — open the posting to read it.
                  </p>
                )}
              </section>
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          {j && (
            <>
              <a href={j.url} target="_blank" rel="noreferrer" className="btn-ghost">
                <IconExternal className="h-3.5 w-3.5" /> Open posting
              </a>
              {j.status === "matched" && (
                <>
                  <button onClick={() => onPrep(j.id)} disabled={busy} className="btn-primary">
                    <IconZap className="h-3.5 w-3.5" />
                    {busy ? "Drafting…" : "Prep"}
                  </button>
                  <button onClick={() => onSkip(j.id)} disabled={busy} className="btn-danger">
                    Skip
                  </button>
                </>
              )}
              {j.status === "queued" && (
                <span className="flex items-center gap-1.5 text-[13px] text-ok">
                  <IconCheck className="h-3.5 w-3.5" /> Draft waiting in the queue
                </span>
              )}
            </>
          )}
        </footer>
      </aside>
    </div>
  );
}
