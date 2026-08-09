"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { IconCheck, IconAlert, IconX } from "./icons";

/* ---------------- Toasts ---------------- */

type Toast = { id: number; kind: "ok" | "error" | "info"; text: string };
type ToastCtx = (kind: Toast["kind"], text: string) => void;

const ToastContext = createContext<ToastCtx>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback<ToastCtx>((kind, text) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in pointer-events-auto flex items-start gap-2.5 border bg-surface px-3.5 py-2.5 text-[13px] ${
              t.kind === "ok"
                ? "border-l-2 border-line border-l-ok"
                : t.kind === "error"
                  ? "border-l-2 border-line border-l-danger"
                  : "border-l-2 border-line border-l-ink-muted"
            }`}
          >
            {t.kind === "ok" ? (
              <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
            ) : t.kind === "error" ? (
              <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
            ) : null}
            <span className="flex-1 leading-relaxed">{t.text}</span>
            <button
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              className="cursor-pointer text-ink-muted transition-colors hover:text-ink"
              aria-label="Dismiss notification"
            >
              <IconX className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------------- Skeletons ---------------- */

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          <div className="h-3 w-8 animate-pulse bg-surface-2" />
          <div className="h-3 flex-1 animate-pulse bg-surface-2" style={{ maxWidth: "22rem" }} />
          <div className="h-3 w-24 animate-pulse bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-3 p-4">
          <div className="h-3.5 w-1/3 animate-pulse bg-surface-2" />
          <div className="h-3 w-1/5 animate-pulse bg-surface-2" />
          <div className="h-24 animate-pulse bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

/* ---------------- Empty state ---------------- */

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: (p: { className?: string }) => React.ReactElement;
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-1 px-5 py-12">
      <Icon className="mb-2 h-4 w-4 text-ink-muted" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-[13px] leading-relaxed text-ink-muted">{hint}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ---------------- Score ---------------- */

export function ScorePill({ score }: { score: number }) {
  const tone = score >= 75 ? "text-ok" : score >= 60 ? "text-warn" : "text-ink-muted";
  return (
    <span className={`mono text-sm font-semibold tabular-nums ${tone}`} title={`Match score ${score}/100`}>
      {String(score).padStart(2, "0")}
    </span>
  );
}

/* Horizontal score meter — reads faster than a number in a dense table */
export function ScoreBar({ score }: { score: number }) {
  const tone = score >= 75 ? "bg-ok" : score >= 60 ? "bg-warn" : "bg-line-strong";
  return (
    <span className="flex items-center gap-2">
      <ScorePill score={score} />
      <span className="hidden h-[3px] w-10 bg-surface-2 sm:block" aria-hidden>
        <span className={`block h-full ${tone}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </span>
    </span>
  );
}

/* ---------------- Status ---------------- */

const STATUS_TONES: Record<string, string> = {
  matched: "text-ok border-ok/40",
  queued: "text-warn border-warn/40",
  applied: "text-ok border-ok/40",
  manual: "text-warn border-warn/40",
  failed: "text-danger border-danger/40",
  skipped: "text-ink-muted border-line-strong",
  new: "text-ink-muted border-line-strong",
  pitched: "text-warn border-warn/40",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`mono border px-1.5 py-px text-[10px] uppercase tracking-wider ${
        STATUS_TONES[status] ?? "text-ink-muted border-line-strong"
      }`}
    >
      {status}
    </span>
  );
}

export function useCopied() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  return [copied, setCopied] as const;
}
