import { NextRequest, NextResponse } from "next/server";
import db, { getProfile } from "@/lib/db";
import { draftCoverLetter, draftOutreachEmail } from "@/lib/claude";
import { findHiringContact } from "@/lib/contacts";

export const maxDuration = 300;

export async function GET() {
  const jobs = db
    .prepare(
      `SELECT id, source, title, company, location, remote, salary, url, posted_at,
              score, score_reason, status
       FROM jobs WHERE score IS NOT NULL ORDER BY score DESC, id DESC LIMIT 500`
    )
    .all();
  return NextResponse.json({ jobs });
}

type PrepResult = { jobId: number; ok: boolean; contact?: string | null; error?: string };

async function prepOne(jobId: number): Promise<PrepResult> {
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as
    | { id: number; title: string; company: string; description: string | null }
    | undefined;
  if (!job) return { jobId, ok: false, error: "Job not found" };

  const { resume } = getProfile();
  if (!resume) return { jobId, ok: false, error: "No resume on file" };

  // Don't pay for a second draft if one is already waiting.
  const existing = db
    .prepare("SELECT id FROM apps WHERE job_id = ? AND status IN ('draft','manual','failed')")
    .get(jobId);
  if (!existing) {
    const coverLetter = await draftCoverLetter(resume, job);
    db.prepare("INSERT INTO apps (job_id, cover_letter, status) VALUES (?, ?, 'draft')").run(
      jobId,
      coverLetter
    );
  }

  let contact: string | null = null;
  try {
    const found = await findHiringContact(job.company);
    if (found) {
      const draft = await draftOutreachEmail(resume, job, found);
      db.prepare(
        "INSERT INTO emails (kind, job_id, to_email, to_name, company, subject, body, status) VALUES ('outreach', ?, ?, ?, ?, ?, ?, 'draft')"
      ).run(jobId, found.email, found.name, job.company, draft.subject, draft.body);
      contact = found.email;
    }
  } catch (e) {
    console.error("outreach prep failed:", e);
  }

  db.prepare("UPDATE jobs SET status = 'queued' WHERE id = ?").run(jobId);
  return { jobId, ok: true, contact };
}

// Accepts a single `jobId` or a `jobIds` array so the table can act in bulk.
export async function POST(req: NextRequest) {
  const { jobId, jobIds, action } = await req.json();
  const ids: number[] = Array.isArray(jobIds) ? jobIds : jobId != null ? [jobId] : [];
  if (ids.length === 0) return NextResponse.json({ error: "No jobs given" }, { status: 400 });

  if (action === "skip") {
    const stmt = db.prepare("UPDATE jobs SET status = 'skipped' WHERE id = ?");
    db.transaction((list: number[]) => list.forEach((i) => stmt.run(i)))(ids);
    return NextResponse.json({ ok: true, skipped: ids.length });
  }

  if (action === "unskip") {
    const stmt = db.prepare(
      "UPDATE jobs SET status = CASE WHEN score >= 60 THEN 'matched' ELSE 'skipped' END WHERE id = ?"
    );
    db.transaction((list: number[]) => list.forEach((i) => stmt.run(i)))(ids);
    return NextResponse.json({ ok: true });
  }

  if (action !== "prep") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  // Sequential: each prep is 1-2 model calls, and bursting them trips rate limits.
  const results: PrepResult[] = [];
  for (const id of ids) {
    try {
      results.push(await prepOne(id));
    } catch (e) {
      results.push({ jobId: id, ok: false, error: String(e) });
    }
  }

  const prepped = results.filter((r) => r.ok).length;
  const contacts = results.filter((r) => r.contact).length;
  const failed = results.filter((r) => !r.ok);

  return NextResponse.json({
    ok: failed.length === 0,
    prepped,
    contacts,
    failed: failed.map((f) => f.error),
    // Single-job callers still get the old shape.
    outreach: { found: Boolean(results[0]?.contact), email: results[0]?.contact ?? null },
  });
}
