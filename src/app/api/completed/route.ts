import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const dynamic = "force-dynamic";

export type DoneItem = {
  id: number;
  kind: "application" | "email" | "whatsapp" | "lead";
  title: string;
  subtitle: string | null;
  detail: string | null;
  url: string | null;
  at: string | null;
  outcome: string;
};

// Everything already actioned, from three tables, newest first. Deliberately a
// read model rather than a status column — "done" means different things per
// table (submitted / sent / pitched).
export async function GET() {
  const apps = db
    .prepare(
      `SELECT a.id, a.status, a.applied_at, a.created_at, a.cover_letter,
              j.title, j.company, j.url
       FROM apps a JOIN jobs j ON j.id = a.job_id
       WHERE a.status IN ('applied','manual')`
    )
    .all() as Array<Record<string, string | number | null>>;

  const emails = db
    .prepare(
      `SELECT id, kind, channel, to_email, to_phone, company, subject, body, sent_at
       FROM emails WHERE status = 'sent'`
    )
    .all() as Array<Record<string, string | number | null>>;

  const leads = db
    .prepare(
      `SELECT id, name, category, region, website, email, phone, status, created_at
       FROM leads WHERE status IN ('pitched','won','done','dead')`
    )
    .all() as Array<Record<string, string | number | null>>;

  const items: DoneItem[] = [
    ...apps.map((a) => ({
      id: Number(a.id),
      kind: "application" as const,
      title: String(a.title),
      subtitle: String(a.company),
      detail: String(a.cover_letter ?? "").slice(0, 240) || null,
      url: (a.url as string) ?? null,
      at: (a.applied_at as string) ?? (a.created_at as string) ?? null,
      // 'manual' means we handed the form to the user rather than submitting it.
      outcome: a.status === "applied" ? "submitted" : "sent manually",
    })),
    ...emails.map((e) => ({
      id: Number(e.id),
      kind: (e.channel === "whatsapp" ? "whatsapp" : "email") as "whatsapp" | "email",
      title: String(e.subject),
      subtitle: (e.company as string) ?? (e.to_email as string) ?? null,
      detail: String(e.body ?? "").slice(0, 240) || null,
      url:
        e.channel === "whatsapp" && e.to_phone ? `https://wa.me/${e.to_phone}` : null,
      at: (e.sent_at as string) ?? null,
      outcome: e.kind === "bizdev" ? "pitch sent" : "outreach sent",
    })),
    ...leads.map((l) => ({
      id: Number(l.id),
      kind: "lead" as const,
      title: String(l.name),
      subtitle: [l.category, l.region].filter(Boolean).join(" · ") || null,
      detail: (l.email as string) ?? (l.phone as string) ?? null,
      url: (l.website as string) ?? null,
      at: (l.created_at as string) ?? null,
      outcome: String(l.status),
    })),
  ].sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));

  return NextResponse.json({ items });
}

// Move a lead through its outcome states, or reopen it.
export async function POST(req: NextRequest) {
  const { leadId, status } = await req.json();
  const allowed = ["new", "pitched", "won", "done", "dead"];
  if (!leadId || !allowed.includes(status))
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  db.prepare("UPDATE leads SET status = ? WHERE id = ?").run(status, leadId);
  return NextResponse.json({ ok: true });
}
