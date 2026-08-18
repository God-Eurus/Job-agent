import { NextRequest, NextResponse } from "next/server";
import db, { getProfile } from "@/lib/db";
import { sendEmail } from "@/lib/gmail";
import { autoApply } from "@/lib/apply";
import { refineDraft } from "@/lib/claude";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // ?view=done lists what's already been handled, so the queue itself can show
  // history instead of only outstanding work.
  const done = req.nextUrl.searchParams.get("view") === "done";

  const apps = db
    .prepare(
      `SELECT a.*, j.title, j.company, j.url, j.apply_url, j.source
       FROM apps a JOIN jobs j ON j.id = a.job_id
       WHERE a.status ${done ? "= 'applied'" : "IN ('draft','failed','manual')"}
       ORDER BY a.id DESC`
    )
    .all();
  const emails = db
    .prepare(
      `SELECT * FROM emails WHERE status ${done ? "= 'sent'" : "IN ('draft','failed')"}
       ORDER BY id DESC`
    )
    .all();

  const counts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM apps WHERE status IN ('draft','failed','manual')) +
        (SELECT COUNT(*) FROM emails WHERE status IN ('draft','failed')) AS pending,
        (SELECT COUNT(*) FROM apps WHERE status = 'applied') +
        (SELECT COUNT(*) FROM emails WHERE status = 'sent') AS done`
    )
    .get();

  return NextResponse.json({ apps, emails, counts });
}

// { type: "app"|"email", id, action: "approve"|"discard", body?, subject? }
export async function POST(req: NextRequest) {
  const { type, id, action, body, subject, instruction } = await req.json();

  // Iterate on a draft in place — "make it shorter", "lead with the Shopify work".
  if (action === "refine") {
    if (!instruction?.trim())
      return NextResponse.json({ error: "No instruction given" }, { status: 400 });

    if (type === "app") {
      const row = db
        .prepare(
          `SELECT a.cover_letter, j.title, j.company FROM apps a
           JOIN jobs j ON j.id = a.job_id WHERE a.id = ?`
        )
        .get(id) as { cover_letter: string; title: string; company: string } | undefined;
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const revised = await refineDraft(
        body ?? row.cover_letter,
        instruction,
        `Cover letter for ${row.title} at ${row.company}`
      );
      db.prepare("UPDATE apps SET cover_letter = ? WHERE id = ?").run(revised, id);
      return NextResponse.json({ ok: true, text: revised });
    }

    const row = db.prepare("SELECT subject, body, company, kind FROM emails WHERE id = ?").get(id) as
      | { subject: string; body: string; company: string | null; kind: string }
      | undefined;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const revised = await refineDraft(
      body ?? row.body,
      instruction,
      `${row.kind === "bizdev" ? "Freelance pitch" : "Cold outreach"} email to ${row.company ?? "a company"}`
    );
    db.prepare("UPDATE emails SET body = ? WHERE id = ?").run(revised, id);
    return NextResponse.json({ ok: true, text: revised });
  }

  // "I handled this myself" — for aggregator listings we can't submit, and for
  // anything the user actioned outside the app.
  if (action === "done") {
    if (type === "app") {
      const row = db.prepare("SELECT job_id FROM apps WHERE id = ?").get(id) as
        | { job_id: number }
        | undefined;
      db.prepare(
        "UPDATE apps SET status='applied', error=NULL, applied_at=datetime('now') WHERE id=?"
      ).run(id);
      if (row) db.prepare("UPDATE jobs SET status='applied' WHERE id=?").run(row.job_id);
    } else {
      db.prepare(
        "UPDATE emails SET status='sent', sent_at=datetime('now') WHERE id=?"
      ).run(id);
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "discard") {
    if (type === "app") db.prepare("UPDATE apps SET status='discarded' WHERE id=?").run(id);
    else db.prepare("UPDATE emails SET status='discarded' WHERE id=?").run(id);
    return NextResponse.json({ ok: true });
  }

  if (type === "email") {
    const email = db.prepare("SELECT * FROM emails WHERE id = ?").get(id) as
      | { to_email: string | null; to_phone: string | null; channel: string; subject: string; body: string }
      | undefined;
    if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // WhatsApp has no unattended send path — hand back a wa.me link for the
    // client to open, and record it as sent once the user confirms.
    if (email.channel === "whatsapp") {
      const finalBody = body ?? email.body;
      db.prepare(
        "UPDATE emails SET status='sent', body=?, sent_at=datetime('now') WHERE id=?"
      ).run(finalBody, id);
      return NextResponse.json({
        ok: true,
        channel: "whatsapp",
        waUrl: `https://wa.me/${email.to_phone}?text=${encodeURIComponent(finalBody)}`,
      });
    }
    const finalSubject = subject ?? email.subject;
    const finalBody = body ?? email.body;
    if (!email.to_email)
      return NextResponse.json({ error: "No recipient address" }, { status: 400 });
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

  // Only Greenhouse and Lever expose a real hosted application form. Aggregator
  // sources link to a listing page, where a stray submit button could be a
  // newsletter signup — never drive a form we can't identify.
  const AUTOMATABLE = new Set(["greenhouse", "lever"]);
  if (!AUTOMATABLE.has(app.source)) {
    const detail = `${app.source} links to a listing page, not an application form — auto-apply skipped. Cover letter is ready above: open ${app.apply_url}, paste it, and submit.`;
    db.prepare("UPDATE apps SET status='manual', error=? WHERE id=?").run(detail, id);
    return NextResponse.json({ ok: false, manual: true, detail }, { status: 422 });
  }

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
