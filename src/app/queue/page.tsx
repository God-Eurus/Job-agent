"use client";
import { useEffect, useState } from "react";
import { IconSend, IconX, IconCheck } from "@/components/icons";

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

// Sources that expose a real hosted application form Playwright can fill.
const AUTOMATABLE = new Set(["greenhouse", "lever"]);

type EmailDraft = {
  id: number;
  kind: string;
  to_email: string;
  to_name: string | null;
  company: string | null;
  subject: string;
  body: string;
  status: string;
  error: string | null;
};

export default function Queue() {
  const [apps, setApps] = useState<AppDraft[]>([]);
  const [emails, setEmails] = useState<EmailDraft[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { subject?: string; body?: string }>>({});

  const load = () =>
    fetch("/api/queue")
      .then((r) => r.json())
      .then((d) => {
        setApps(d.apps ?? []);
        setEmails(d.emails ?? []);
      });

  useEffect(() => {
    load();
  }, []);

  async function act(type: "app" | "email", id: number, action: "approve" | "discard") {
    const key = `${type}-${id}`;
    setBusy(key);
    setMsg(null);
    const edit = edits[key] ?? {};
    const res = await fetch("/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, action, ...edit }),
    });
    const d = await res.json();
    setBusy(null);
    if (!res.ok) setMsg(d.error ?? d.detail ?? "Failed");
    else if (action === "approve")
      setMsg(type === "email" ? "Email sent." : d.detail ?? "Applied.");
    load();
  }

  const editorKey = (type: string, id: number) => `${type}-${id}`;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Approval Queue</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Nothing sends or submits without your click. Edit inline before approving.
        </p>
      </header>

      {msg && (
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-muted">{msg}</p>
      )}

      <section className="space-y-4">
        <h2 className="mono text-sm font-semibold text-ink-muted">
          applications <span className="text-accent">({apps.length})</span>
        </h2>
        {apps.map((a) => {
          const k = editorKey("app", a.id);
          return (
            <div key={a.id} className="card p-5">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="font-medium">
                    {a.title} <span className="text-ink-muted">@ {a.company}</span>
                  </div>
                  <a href={a.url} target="_blank" rel="noreferrer" className="cursor-pointer text-xs text-accent hover:underline">
                    {a.apply_url ?? a.url}
                  </a>
                  {(a.status === "failed" || a.status === "manual") && (
                    <p className="mt-2 text-xs text-warn">{a.error}</p>
                  )}
                </div>
                <span className="mono rounded-md bg-surface-2 px-2 py-0.5 text-xs text-ink-muted">{a.source}</span>
              </div>
              <textarea
                className="input min-h-36 font-normal"
                defaultValue={a.cover_letter}
                onChange={(e) => setEdits({ ...edits, [k]: { ...edits[k], body: e.target.value } })}
                aria-label="Cover letter"
              />
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={async () => {
                    // Aggregator listings have no form to drive — hand the user
                    // the letter and the page instead of pretending to apply.
                    if (!AUTOMATABLE.has(a.source)) {
                      const letter = edits[k]?.body ?? a.cover_letter;
                      await navigator.clipboard.writeText(letter).catch(() => {});
                      window.open(a.apply_url ?? a.url, "_blank", "noopener");
                    }
                    act("app", a.id, "approve");
                  }}
                  disabled={busy === k}
                  className="btn-primary"
                >
                  <IconCheck className="h-4 w-4" />
                  {busy === k
                    ? "Working…"
                    : AUTOMATABLE.has(a.source)
                      ? "Approve & auto-apply"
                      : "Copy letter & open form"}
                </button>
                <button onClick={() => act("app", a.id, "discard")} className="btn-danger">
                  <IconX className="h-4 w-4" /> Discard
                </button>
              </div>
            </div>
          );
        })}
        {apps.length === 0 && <p className="text-sm text-ink-muted">Empty.</p>}
      </section>

      <section className="space-y-4">
        <h2 className="mono text-sm font-semibold text-ink-muted">
          emails <span className="text-accent">({emails.length})</span>
        </h2>
        {emails.map((e) => {
          const k = editorKey("email", e.id);
          return (
            <div key={e.id} className="card p-5">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium">
                    → {e.to_name ?? e.to_email}
                    <span className="ml-2 text-xs text-ink-muted">{e.to_email}</span>
                  </div>
                  <div className="text-xs text-ink-muted">{e.company}</div>
                  {e.status === "failed" && <p className="mt-1 text-xs text-warn">{e.error}</p>}
                </div>
                <span
                  className={`mono rounded-md px-2 py-0.5 text-xs ${
                    e.kind === "bizdev" ? "bg-warn/15 text-warn" : "bg-accent/10 text-accent"
                  }`}
                >
                  {e.kind}
                </span>
              </div>
              <input
                className="input mb-2"
                defaultValue={e.subject}
                onChange={(ev) => setEdits({ ...edits, [k]: { ...edits[k], subject: ev.target.value } })}
                aria-label="Email subject"
              />
              <textarea
                className="input min-h-32"
                defaultValue={e.body}
                onChange={(ev) => setEdits({ ...edits, [k]: { ...edits[k], body: ev.target.value } })}
                aria-label="Email body"
              />
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => act("email", e.id, "approve")}
                  disabled={busy === k}
                  className="btn-primary"
                >
                  <IconSend className="h-4 w-4" />
                  {busy === k ? "Sending…" : "Approve & send"}
                </button>
                <button onClick={() => act("email", e.id, "discard")} className="btn-danger">
                  <IconX className="h-4 w-4" /> Discard
                </button>
              </div>
            </div>
          );
        })}
        {emails.length === 0 && <p className="text-sm text-ink-muted">Empty.</p>}
      </section>
    </div>
  );
}
