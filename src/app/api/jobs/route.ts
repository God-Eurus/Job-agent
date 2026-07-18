import { NextRequest, NextResponse } from "next/server";
import db, { getProfile } from "@/lib/db";
import { draftCoverLetter, draftOutreachEmail } from "@/lib/claude";
import { findHiringContact } from "@/lib/contacts";

export const maxDuration = 300;

export async function GET() {
  const jobs = db
    .prepare(
      "SELECT id, source, title, company, location, remote, salary, url, score, score_reason, status FROM jobs WHERE score IS NOT NULL ORDER BY score DESC, id DESC LIMIT 200"
    )
    .all();
  return NextResponse.json({ jobs });
}

// action: "prep" — draft cover letter + find hiring contact + draft outreach email (all land in queue as drafts)
// action: "skip"
export async function POST(req: NextRequest) {
  const { jobId, action } = await req.json();
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as
    | { id: number; title: string; company: string; description: string | null; url: string }
    | undefined;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (action === "skip") {
    db.prepare("UPDATE jobs SET status = 'skipped' WHERE id = ?").run(jobId);
    return NextResponse.json({ ok: true });
  }

  const { resume } = getProfile();
  if (!resume) return NextResponse.json({ error: "No resume" }, { status: 400 });

  // 1. Draft application (cover letter)
  const coverLetter = await draftCoverLetter(resume, job);
  db.prepare("INSERT INTO apps (job_id, cover_letter, status) VALUES (?, ?, 'draft')").run(
    jobId,
    coverLetter
  );

  // 2. Find hiring contact + draft cold email (best-effort)
  let outreach: { found: boolean; email?: string } = { found: false };
  try {
    const contact = await findHiringContact(job.company);
    if (contact) {
      const draft = await draftOutreachEmail(resume, job, contact);
      db.prepare(
        "INSERT INTO emails (kind, job_id, to_email, to_name, company, subject, body, status) VALUES ('outreach', ?, ?, ?, ?, ?, ?, 'draft')"
      ).run(jobId, contact.email, contact.name, job.company, draft.subject, draft.body);
      outreach = { found: true, email: contact.email };
    }
  } catch (e) {
    console.error("outreach prep failed:", e);
  }

  db.prepare("UPDATE jobs SET status = 'queued' WHERE id = ?").run(jobId);
  return NextResponse.json({ ok: true, outreach });
}
