import { NextRequest, NextResponse } from "next/server";
import db, { getProfile } from "@/lib/db";
import { sendEmail } from "@/lib/gmail";
import { autoApply } from "@/lib/apply";

export const maxDuration = 300;

export async function GET() {
  const apps = db
    .prepare(
      `SELECT a.*, j.title, j.company, j.url, j.apply_url, j.source
       FROM apps a JOIN jobs j ON j.id = a.job_id
       WHERE a.status IN ('draft','failed') ORDER BY a.id DESC`
    )
    .all();
  const emails = db
    .prepare("SELECT * FROM emails WHERE status IN ('draft','failed') ORDER BY id DESC")
    .all();
  return NextResponse.json({ apps, emails });
}

// { type: "app"|"email", id, action: "approve"|"discard", body?, subject? }
export async function POST(req: NextRequest) {
  const { type, id, action, body, subject } = await req.json();

  if (action === "discard") {
    if (type === "app") db.prepare("UPDATE apps SET status='discarded' WHERE id=?").run(id);
    else db.prepare("UPDATE emails SET status='discarded' WHERE id=?").run(id);
    return NextResponse.json({ ok: true });
  }

  if (type === "email") {
    const email = db.prepare("SELECT * FROM emails WHERE id = ?").get(id) as
      | { to_email: string; subject: string; body: string }
      | undefined;
    if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const finalSubject = subject ?? email.subject;
    const finalBody = body ?? email.body;
    try {
      await sendEmail({ to: email.to_email, subject: finalSubject, body: finalBody });
      db.prepare(
        "UPDATE emails SET status='sent', subject=?, body=?, sent_at=datetime('now') WHERE id=?"
      ).run(finalSubject, finalBody, id);
      return NextResponse.json({ ok: true, sent: true });
    } catch (e) {
      db.prepare("UPDATE emails SET status='failed', error=? WHERE id=?").run(String(e), id);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  // type === "app" — run Playwright auto-apply
  const app = db
    .prepare(
      `SELECT a.id, a.cover_letter, j.apply_url, j.source, j.id AS job_id
       FROM apps a JOIN jobs j ON j.id = a.job_id WHERE a.id = ?`
    )
    .get(id) as
    | { id: number; cover_letter: string; apply_url: string | null; source: string; job_id: number }
    | undefined;
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!app.apply_url)
    return NextResponse.json({ error: "No apply URL — apply manually via job link" }, { status: 400 });

  const { resume, resumePath } = getProfile();
  if (!resume || !resumePath)
    return NextResponse.json({ error: "No resume on file" }, { status: 400 });

  const result = await autoApply({
    applyUrl: app.apply_url,
    source: app.source,
    resume,
    resumePath,
    coverLetter: body ?? app.cover_letter,
  });

  if (result.ok) {
    db.prepare(
      "UPDATE apps SET status='applied', applied_at=datetime('now') WHERE id=?"
    ).run(id);
    db.prepare("UPDATE jobs SET status='applied' WHERE id=?").run(app.job_id);
  } else {
    db.prepare("UPDATE apps SET status='failed', error=? WHERE id=?").run(result.detail, id);
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
