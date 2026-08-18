"use client";
import { useEffect, useState } from "react";
import {
  IconSend,
  IconX,
  IconCheck,
  IconInbox,
  IconExternal,
  IconAlert,
  IconCopy,
} from "@/components/icons";
import { EmptyState, SkeletonCards, useToast } from "@/components/ui";

const QUICK_REFINEMENTS = ["Make it shorter", "More direct", "Warmer tone", "Lead with impact"];

/** Free-text + one-click revision of a draft, in place. */
function RefineBar({
  onRefine,
  busy,
}: {
  onRefine: (instruction: string) => void;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <div className="mt-2 border-t border-line pt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK_REFINEMENTS.map((r) => (
          <button key={r} onClick={() => onRefine(r)} disabled={busy} className="chip">
            {r}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) {
              onRefine(text.trim());
              setText("");
            }
          }}
          placeholder="Or describe a change — e.g. mention the Shopify work"
          aria-label="Revision instruction"
          className="input text-[13px]"
          disabled={busy}
        />
        <button
          onClick={() => {
            if (text.trim()) {
              onRefine(text.trim());
              setText("");
            }
          }}
          disabled={busy || !text.trim()}
          className="btn-ghost"
        >
          {busy ? "Rewriting…" : "Rewrite"}
        </button>
      </div>
    </div>
  );
}

// Sources that expose a real hosted application form Playwright can fill.
const AUTOMATABLE = new Set(["greenhouse", "lever"]);

type AppDraft = {
  id: number;
  job_id: number;
  cover_letter: string;
  status: string;
  error: string | null;
  title: string;
  company: string;
  url: string;
  apply_url: string | null;
  source: string;
};

type EmailDraft = {
  id: number;
  kind: string;
  channel?: string;
  to_email: string | null;
  to_phone: string | null;
  to_name: string | null;
  company: string | null;
  subject: string;
  body: string;
  status: string;
  error: string | null;
};

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export default function Queue() {
  const toast = useToast();
  const [apps, setApps] = useState<AppDraft[] | null>(null);
  const [emails, setEmails] = useState<EmailDraft[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { subject?: string; body?: string }>>({});
  // Bumped after a rewrite so uncontrolled textareas pick up the new defaultValue.
  const [rev, setRev] = useState(0);

  const load = () =>
    fetch("/api/queue")
      .then((r) => r.json())
      .then((d) => {
        setApps(d.apps ?? []);
        setEmails(d.emails ?? []);
      })
      .catch(() => {
        setApps([]);
        setEmails([]);
      });

  useEffect(() => {
    load();
  }, []);

  async function refine(type: "app" | "email", id: number, instruction: string) {
    const key = `${type}-${id}`;
    setBusy(key);
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, action: "refine", instruction, ...(edits[key] ?? {}) }),
      });
      const d = await res.json();
      if (!res.ok) toast("error", d.error ?? "Rewrite failed");
      else {
        // Server persisted the revision — clear the local edit so it re-renders.
        setEdits((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setRev((r) => r + 1);
        toast("ok", "Draft rewritten");
        await load();
      }
    } catch (e) {
      toast("error", String(e));
    } finally {
      setBusy(null);
    }
  }

  async function act(type: "app" | "email", id: number, action: "approve" | "discard") {
    const key = `${type}-${id}`;
    setBusy(key);
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, action, ...(edits[key] ?? {}) }),
      });
      const d = await res.json();
      if (action === "discard") toast("info", "Discarded");
      else if (!res.ok) toast(d.manual ? "info" : "error", d.error ?? d.detail ?? "Failed");
      else if (d.channel === "whatsapp") {
        // No unattended WhatsApp send exists — open the chat prefilled instead.
        window.open(d.waUrl, "_blank", "noopener");
        toast("ok", "WhatsApp opened with the message ready — press send there");
      } else toast("ok", type === "email" ? "Email sent" : (d.detail ?? "Applied"));
      await load();
    } catch (e) {
      toast("error", String(e));
    } finally {
      setBusy(null);
    }
  }

  const loading = apps === null || emails === null;
  const appList = apps ?? [];
  const emailList = emails ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Approval Queue</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          Nothing sends or submits without your click. Edit anything inline before approving.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="mono text-sm font-semibold text-ink-muted">
          applications <span className="text-ok">({appList.length})</span>
        </h2>

        {loading ? (
          <SkeletonCards count={2} />
        ) : appList.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={IconInbox}
              title="No applications waiting"
              hint="Prep a matched job on the Jobs page and its cover letter lands here."
            />
          </div>
        ) : (
          appList.map((a) => {
            const k = `app-${a.id}`;
            const auto = AUTOMATABLE.has(a.source);
            const text = edits[k]?.body ?? a.cover_letter;
            return (
              <article key={a.id} className="card p-5">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium">
                      {a.title} <span className="text-ink-muted">@ {a.company}</span>
                    </h3>
                    <a
                      href={a.apply_url ?? a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex cursor-pointer items-center gap-1 text-xs text-ink hover:underline"
                    >
                      <IconExternal className="h-3 w-3" /> Open posting
                    </a>
                  </div>
                  <span
                    className={`mono px-2 py-0.5 text-[11px] ring-1 ${
                      auto
                        ? "border border-ok/40 text-ok"
                        : "bg-surface-2 text-ink-muted ring-line"
                    }`}
                    title={
                      auto
                        ? "Hosted form — Playwright can fill and submit this"
                        : "Aggregator listing — no form to automate, you paste and submit"
                    }
                  >
                    {a.source} {auto ? "· auto" : "· manual"}
                  </span>
                </div>

                {(a.status === "failed" || a.status === "manual") && a.error && (
                  <p className="mb-3 flex items-start gap-2 border border-warn/30 bg-warn/5 px-3 py-2 text-xs leading-relaxed text-warn">
                    <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {a.error}
                  </p>
                )}

                <label className="sr-only" htmlFor={`cl-${a.id}`}>
                  Cover letter for {a.title}
                </label>
                <textarea
                  key={`cl-${a.id}-${rev}`}
                  id={`cl-${a.id}`}
                  className="input min-h-44 font-normal"
                  defaultValue={a.cover_letter}
                  onChange={(e) => setEdits({ ...edits, [k]: { ...edits[k], body: e.target.value } })}
                />
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="mono text-[11px] text-ink-muted">{words(text)} words</span>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(text).catch(() => {});
                      toast("ok", "Cover letter copied");
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-ink-muted transition-colors hover:text-ok"
                  >
                    <IconCopy className="h-3 w-3" /> Copy
                  </button>
                </div>

                <RefineBar
                  busy={busy === k}
                  onRefine={(instruction) => refine("app", a.id, instruction)}
                />

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!auto) {
                        await navigator.clipboard.writeText(text).catch(() => {});
                        window.open(a.apply_url ?? a.url, "_blank", "noopener");
                      }
                      act("app", a.id, "approve");
                    }}
                    disabled={busy === k}
                    className="btn-primary"
                  >
                    <IconCheck className="h-4 w-4" />
                    {busy === k ? "Working…" : auto ? "Approve & auto-apply" : "Copy letter & open form"}
                  </button>
                  <button
                    onClick={() => act("app", a.id, "discard")}
                    disabled={busy === k}
                    className="btn-danger"
                  >
                    <IconX className="h-4 w-4" /> Discard
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>

      <section className="space-y-4">
        <h2 className="mono text-sm font-semibold text-ink-muted">
          emails <span className="text-ok">({emailList.length})</span>
        </h2>

        {loading ? (
          <SkeletonCards count={1} />
        ) : emailList.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={IconSend}
              title="No emails waiting"
              hint="Outreach drafts appear when a hiring contact is found, and freelance pitches when you pitch a lead."
            />
          </div>
        ) : (
          emailList.map((e) => {
            const k = `email-${e.id}`;
            const body = edits[k]?.body ?? e.body;
            return (
              <article key={e.id} className="card p-5">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium">
                      To {e.to_name ?? e.company ?? e.to_email ?? e.to_phone}
                      <span className="ml-2 text-xs font-normal text-ink-muted">
                        {e.channel === "whatsapp" ? `+${e.to_phone}` : e.to_email}
                      </span>
                    </h3>
                    {e.company && e.to_name && (
                      <div className="text-xs text-ink-muted">{e.company}</div>
                    )}
                  </div>
                  <span
                    className={`mono px-2 py-0.5 text-[11px] ${
                      e.channel === "whatsapp"
                        ? "border border-ok/40 text-ok"
                        : e.kind === "bizdev"
                          ? "border border-warn/40 text-warn"
                          : "border border-line-strong text-ink-muted"
                    }`}
                  >
                    {e.channel === "whatsapp" ? "whatsapp" : e.kind}
                  </span>
                </div>

                {e.status === "failed" && e.error && (
                  <p className="mb-3 flex items-start gap-2 border border-danger/30 bg-danger/5 px-3 py-2 text-xs leading-relaxed text-danger">
                    <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {e.error}
                  </p>
                )}

                {/* WhatsApp messages have no subject line */}
                {e.channel !== "whatsapp" && (
                  <>
                    <label className="sr-only" htmlFor={`subj-${e.id}`}>Subject</label>
                    <input
                      id={`subj-${e.id}`}
                      className="input mb-2 font-medium"
                      defaultValue={e.subject}
                      onChange={(ev) =>
                        setEdits({ ...edits, [k]: { ...edits[k], subject: ev.target.value } })
                      }
                    />
                  </>
                )}
                <label className="sr-only" htmlFor={`body-${e.id}`}>Email body</label>
                <textarea
                  key={`body-${e.id}-${rev}`}
                  id={`body-${e.id}`}
                  className="input min-h-36"
                  defaultValue={e.body}
                  onChange={(ev) =>
                    setEdits({ ...edits, [k]: { ...edits[k], body: ev.target.value } })
                  }
                />
                <div className="mt-1.5 mono text-[11px] text-ink-muted">{words(body)} words</div>

                <RefineBar
                  busy={busy === k}
                  onRefine={(instruction) => refine("email", e.id, instruction)}
                />

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => act("email", e.id, "approve")}
                    disabled={busy === k}
                    className="btn-primary"
                  >
                    <IconSend className="h-4 w-4" />
                    {busy === k
                      ? "Sending…"
                      : e.channel === "whatsapp"
                        ? "Open WhatsApp"
                        : "Approve & send"}
                  </button>
                  <button
                    onClick={() => act("email", e.id, "discard")}
                    disabled={busy === k}
                    className="btn-danger"
                  >
                    <IconX className="h-4 w-4" /> Discard
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
