"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconRefresh,
  IconZap,
  IconX,
  IconExternal,
  IconSearch,
  IconBriefcase,
} from "@/components/icons";
import { EmptyState, ScoreBar, SkeletonRows, StatusBadge, useToast } from "@/components/ui";
import JobDrawer from "@/components/job-drawer";

type Job = {
  id: number;
  source: string;
  title: string;
  company: string;
  location: string | null;
  remote: number;
  salary: string | null;
  url: string;
  posted_at: string | null;
  score: number;
  score_reason: string;
  status: string;
};

type Filter = "matched" | "queued" | "applied" | "skipped" | "all";
type Sort = "score" | "newest" | "company";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "matched", label: "Matched" },
  { key: "queued", label: "Prepped" },
  { key: "applied", label: "Applied" },
  { key: "skipped", label: "Skipped" },
  { key: "all", label: "All" },
];

export default function Jobs() {
  const toast = useToast();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [hunting, setHunting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("matched");
  const [sort, setSort] = useState<Sort>("score");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    () =>
      fetch("/api/jobs")
        .then((r) => r.json())
        .then((d) => setJobs(d.jobs ?? []))
        .catch(() => setJobs([])),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    let list = jobs ?? [];
    if (filter !== "all") list = list.filter((j) => j.status === filter);
    const term = q.trim().toLowerCase();
    if (term)
      list = list.filter(
        (j) =>
          j.title.toLowerCase().includes(term) ||
          j.company.toLowerCase().includes(term) ||
          (j.location ?? "").toLowerCase().includes(term) ||
          j.source.toLowerCase().includes(term)
      );
    return [...list].sort((a, b) => {
      if (sort === "company") return a.company.localeCompare(b.company) || b.score - a.score;
      if (sort === "newest") return b.id - a.id;
      return b.score - a.score || b.id - a.id;
    });
  }, [jobs, filter, q, sort]);

  const counts = useMemo(() => {
    const j = jobs ?? [];
    return {
      matched: j.filter((x) => x.status === "matched").length,
      queued: j.filter((x) => x.status === "queued").length,
      applied: j.filter((x) => x.status === "applied").length,
      skipped: j.filter((x) => x.status === "skipped").length,
      all: j.length,
    };
  }, [jobs]);

  async function hunt() {
    setHunting(true);
    try {
      const res = await fetch("/api/hunt", { method: "POST" });
      const d = await res.json();
      if (!res.ok) toast("error", d.error ?? "Hunt failed");
      else
        toast(
          "ok",
          `${d.inserted} new of ${d.fetched} fetched · ${d.scored} scored`
        );
      await load();
    } catch (e) {
      toast("error", String(e));
    } finally {
      setHunting(false);
    }
  }

  const act = useCallback(
    async (ids: number[], action: "prep" | "skip" | "unskip") => {
      if (ids.length === 0) return;
      setBusy(true);
      try {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobIds: ids, action }),
        });
        const d = await res.json();
        if (!res.ok) toast("error", d.error ?? "Failed");
        else if (action === "prep")
          toast(
            d.failed?.length ? "info" : "ok",
            `${d.prepped} draft${d.prepped === 1 ? "" : "s"} in the queue` +
              (d.contacts ? ` · ${d.contacts} hiring contact${d.contacts === 1 ? "" : "s"}` : "") +
              (d.failed?.length ? ` · ${d.failed.length} failed` : "")
          );
        else if (action === "skip") toast("info", `Skipped ${ids.length}`);
        else toast("info", "Restored");
        setSelected(new Set());
        await load();
      } catch (e) {
        toast("error", String(e));
      } finally {
        setBusy(false);
      }
    },
    [load, toast]
  );

  // Keyboard: j/k move, x select, enter open, p prep, s skip, / search, esc clear
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing || openId !== null || e.metaKey || e.ctrlKey) return;
      const row = visible[cursor];
      if (e.key === "j") setCursor((c) => Math.min(c + 1, visible.length - 1));
      else if (e.key === "k") setCursor((c) => Math.max(c - 1, 0));
      else if (e.key === "Enter" && row) setOpenId(row.id);
      else if (e.key === "x" && row) {
        setSelected((s) => {
          const n = new Set(s);
          n.has(row.id) ? n.delete(row.id) : n.add(row.id);
          return n;
        });
      } else if (e.key === "p" && row?.status === "matched") act([row.id], "prep");
      else if (e.key === "s" && row?.status === "matched") act([row.id], "skip");
      else if (e.key === "Escape") setSelected(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, cursor, openId, act]);

  useEffect(() => setCursor(0), [filter, q, sort]);

  const allSelected = visible.length > 0 && visible.every((j) => selected.has(j.id));
  const selectedMatched = visible.filter((j) => selected.has(j.id) && j.status === "matched");

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Jobs</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            {counts.all} scored · <kbd className="mono text-ink">j</kbd>/
            <kbd className="mono text-ink">k</kbd> move ·{" "}
            <kbd className="mono text-ink">x</kbd> select · <kbd className="mono text-ink">p</kbd>{" "}
            prep · <kbd className="mono text-ink">/</kbd> search
          </p>
        </div>
        <button onClick={hunt} disabled={hunting} className="btn-primary">
          <IconRefresh className={`h-3.5 w-3.5 ${hunting ? "animate-spin" : ""}`} />
          {hunting ? "Hunting…" : "Hunt latest"}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} data-active={filter === f.key} className="chip">
            {f.label}
            <span className="mono opacity-60">{counts[f.key]}</span>
          </button>
        ))}

        <div className="relative ml-auto w-full sm:w-60">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            aria-label="Search jobs"
            className="input has-icon"
          />
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="input inline-control"
          aria-label="Sort jobs"
        >
          <option value="score">Best match</option>
          <option value="newest">Newest</option>
          <option value="company">Company</option>
        </select>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 border border-line-strong bg-surface px-4 py-2.5">
          <span className="mono text-[13px]">{selected.size} selected</span>
          <div className="ml-auto flex items-center gap-2">
            {selectedMatched.length > 0 && (
              <button
                onClick={() => act(selectedMatched.map((j) => j.id), "prep")}
                disabled={busy}
                className="btn-primary"
              >
                <IconZap className="h-3.5 w-3.5" />
                {busy ? "Drafting…" : `Prep ${selectedMatched.length}`}
              </button>
            )}
            <button
              onClick={() => act([...selected], "skip")}
              disabled={busy}
              className="btn-danger"
            >
              Skip
            </button>
            <button onClick={() => setSelected(new Set())} className="btn-ghost">
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="card">
        {jobs === null ? (
          <SkeletonRows rows={8} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={IconBriefcase}
            title={q ? "Nothing matches that search" : `No ${filter === "all" ? "" : filter} jobs`}
            hint={
              q
                ? "Try a looser term, or switch to the All tab."
                : filter === "matched"
                  ? "Run a hunt to pull the latest postings and score them against your profile."
                  : "Prep or skip matched jobs and they'll land here."
            }
            action={
              !q && filter === "matched" ? (
                <button onClick={hunt} disabled={hunting} className="btn-primary">
                  <IconRefresh className={`h-3.5 w-3.5 ${hunting ? "animate-spin" : ""}`} />
                  Hunt latest
                </button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-line px-4 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) =>
                  setSelected(e.target.checked ? new Set(visible.map((j) => j.id)) : new Set())
                }
                className="h-3.5 w-3.5 cursor-pointer accent-white"
                aria-label="Select all visible jobs"
              />
              <span className="label">{visible.length} shown</span>
            </div>

            <ul className="divide-y divide-line">
              {visible.map((j, i) => (
                <li
                  key={j.id}
                  onMouseEnter={() => setCursor(i)}
                  className={`group flex items-center gap-3 px-4 py-2.5 transition-colors ${
                    cursor === i ? "bg-surface-2/60" : "hover:bg-surface-2/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(j.id)}
                    onChange={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        n.has(j.id) ? n.delete(j.id) : n.add(j.id);
                        return n;
                      })
                    }
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-white"
                    aria-label={`Select ${j.title}`}
                  />

                  <div className="w-16 shrink-0">
                    <ScoreBar score={j.score} />
                  </div>

                  <button
                    onClick={() => setOpenId(j.id)}
                    className="min-w-0 flex-1 cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <div className="truncate text-[13.5px] font-medium">{j.title}</div>
                    <div className="mono mt-0.5 truncate text-[11px] text-ink-muted">
                      {j.company} · {j.remote ? "remote" : (j.location ?? "—")}
                      {j.salary ? ` · ${j.salary}` : ""} · {j.source}
                    </div>
                  </button>

                  <StatusBadge status={j.status} />

                  <div className="flex shrink-0 items-center gap-1.5">
                    <a
                      href={j.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 text-ink-muted opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label={`Open ${j.title} posting`}
                    >
                      <IconExternal className="h-3.5 w-3.5" />
                    </a>
                    {j.status === "matched" && (
                      <>
                        <button
                          onClick={() => act([j.id], "prep")}
                          disabled={busy}
                          className="btn-primary px-2.5 py-1 text-xs"
                        >
                          Prep
                        </button>
                        <button
                          onClick={() => act([j.id], "skip")}
                          disabled={busy}
                          className="p-1.5 text-ink-muted transition-colors hover:text-danger"
                          aria-label={`Skip ${j.title}`}
                        >
                          <IconX className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    {j.status === "skipped" && (
                      <button
                        onClick={() => act([j.id], "unskip")}
                        disabled={busy}
                        className="btn-ghost px-2.5 py-1 text-xs"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {openId !== null && (
        <JobDrawer
          jobId={openId}
          busy={busy}
          onClose={() => setOpenId(null)}
          onPrep={(id) => {
            act([id], "prep");
            setOpenId(null);
          }}
          onSkip={(id) => {
            act([id], "skip");
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}
