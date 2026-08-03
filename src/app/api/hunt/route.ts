import { NextResponse } from "next/server";
import db, { getProfile } from "@/lib/db";
import { huntAll } from "@/lib/sources";
import { scoreJob } from "@/lib/claude";

export const maxDuration = 300;

// Fetch latest jobs from all sources, then score unscored ones with Claude.
export async function POST() {
  const { resume, prefs } = getProfile();
  if (!resume || !prefs) {
    return NextResponse.json(
      { error: "Set up your profile first (/setup)" },
      { status: 400 }
    );
  }

  const hunt = await huntAll({
    keywords: prefs.keywords?.length ? prefs.keywords : prefs.roles,
    ghCompanies: prefs.ghCompanies ?? [],
    leverCompanies: prefs.leverCompanies ?? [],
  });

  // Score newest unscored jobs (cap per run to bound cost)
  const scoreLimit = Number(process.env.SCORE_LIMIT_PER_HUNT ?? 60);
  const unscored = db
    .prepare("SELECT * FROM jobs WHERE score IS NULL ORDER BY id DESC LIMIT ?")
    .all(scoreLimit) as Array<{
    id: number;
    title: string;
    company: string;
    location: string | null;
    salary: string | null;
    description: string | null;
  }>;

  let scored = 0;
  for (const job of unscored) {
    try {
      const s = await scoreJob(resume, prefs, job);
      db.prepare(
        "UPDATE jobs SET score = ?, score_reason = ?, status = CASE WHEN ? >= 60 THEN 'matched' ELSE 'skipped' END WHERE id = ?"
      ).run(s.score, s.reason, s.score, job.id);
      scored++;
    } catch (e) {
      console.error(`score failed for job ${job.id}:`, e);
    }
  }

  return NextResponse.json({ ...hunt, scored });
}
