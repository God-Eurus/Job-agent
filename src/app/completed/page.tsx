"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconCheck, IconExternal, IconSend, IconStore, IconBriefcase } from "@/components/icons";
import { EmptyState, SkeletonRows, useToast } from "@/components/ui";

type DoneItem = {
  id: number;
  kind: "application" | "email" | "whatsapp" | "lead";
  title: string;
  subtitle: string | null;
  detail: string | null;
  url: string | null;
  at: string | null;
  outcome: string;
};

type Filter = "all" | "application" | "email" | "whatsapp" | "lead";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "application", label: "Applications" },
  { key: "email", label: "Emails" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "lead", label: "Leads" },
];

const KIND_ICON = {
  application: IconBriefcase,
  email: IconSend,
  whatsapp: IconSend,
  lead: IconStore,
};

function when(at: string | null) {
  if (!at) return "—";
  const d = new Date(at.includes("T") ? at : at.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return at;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function Completed() {
  const toast = useToast();
  const [items, setItems] = useState<DoneItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/completed")
        .then((r) => r.json())
        .then((d) => setItems(d.items ?? []))
        .catch(() => setItems([])),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  async function setLeadStatus(leadId: number, status: string) {
    setBusy(leadId);
    try {
      const res = await fetch("/api/completed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, status }),
      });
      if (!res.ok) toast("error", "Update failed");
      else toast("ok", status === "new" ? "Reopened" : `Marked ${status}`);
      await load();
    } catch (e) {
      toast("error", String(e));
    } finally {
      setBusy(null);
    }
  }

  const counts = useMemo(() => {
    const i = items ?? [];
    return {
      all: i.length,
      application: i.filter((x) => x.kind === "application").length,
      email: i.filter((x) => x.kind === "email").length,
      whatsapp: i.filter((x) => x.kind === "whatsapp").length,
      lead: i.filter((x) => x.kind === "lead").length,
    };
  }, [items]);

  const visible = useMemo(
    () => (filter === "all" ? (items ?? []) : (items ?? []).filter((i) => i.kind === filter)),
    [items, filter]
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Completed</h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          Everything already sent, submitted or pitched — {counts.all} item
          {counts.all === 1 ? "" : "s"}.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            data-active={filter === f.key}
            className="chip"
          >
            {f.label} <span className="mono opacity-60">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <div className="card">
        {items === null ? (
          <SkeletonRows rows={6} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={IconCheck}
            title={filter === "all" ? "Nothing completed yet" : `No completed ${filter}s`}
            hint="Approving an application, sending an email or pitching a lead files it here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((i) => {
              const Icon = KIND_ICON[i.kind];
              return (
                <li
                  key={`${i.kind}-${i.id}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2/40"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[13.5px] font-medium">{i.title}</span>
                      <span className="mono border border-ok/40 px-1.5 py-px text-[10px] uppercase tracking-wider text-ok">
                        {i.outcome}
                      </span>
                    </div>
                    {i.subtitle && (
                      <div className="mono mt-0.5 truncate text-[11px] text-ink-muted">
                        {i.subtitle}
                      </div>
                    )}
                    {i.detail && (
                      <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">
                        {i.detail}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="mono text-[11px] text-ink-muted">{when(i.at)}</span>
                    {i.url && (
                      <a
                        href={i.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-ink-muted transition-colors hover:text-ink"
                        aria-label={`Open ${i.title}`}
                      >
                        <IconExternal className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {i.kind === "lead" && i.outcome === "pitched" && (
                      <>
                        <button
                          onClick={() => setLeadStatus(i.id, "won")}
                          disabled={busy === i.id}
                          className="btn-ghost px-2 py-1 text-xs"
                          title="Mark this lead as won"
                        >
                          Won
                        </button>
                        <button
                          onClick={() => setLeadStatus(i.id, "dead")}
                          disabled={busy === i.id}
                          className="btn-danger px-2 py-1 text-xs"
                          title="No response / not interested"
                        >
                          Dead
                        </button>
                      </>
                    )}
                    {i.kind === "lead" && ["won", "dead", "done"].includes(i.outcome) && (
                      <button
                        onClick={() => setLeadStatus(i.id, "new")}
                        disabled={busy === i.id}
                        className="btn-ghost px-2 py-1 text-xs"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
