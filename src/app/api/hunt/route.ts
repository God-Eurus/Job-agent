import { NextRequest, NextResponse } from "next/server";
import db, { getProfile } from "@/lib/db";
import { huntAll } from "@/lib/sources";
import { scoreJob } from "@/lib/claude";

export const maxDuration = 300;

type Scorable = {
  id: number;
  title: string;
  company: string;
  location: string | null;
  salary: string | null;
  description: string | null;
};

// Fetch latest jobs from all sources, then score whatever still needs scoring.
// `rescore: true` re-runs scoring over jobs already scored — use after changing
// preferences, since existing scores were judged against the old profile.
export async function POST(req: NextRequest) {
  const { resume, prefs } = getProfile();
  if (!resume || !prefs) {
    return NextResponse.json({ error: "Set up your profile first (/setup)" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const rescore = Boolean(body?.rescore);

  const hunt = rescore
    ? { fetched: 0, inserted: 0, errors: [] as string[] }
    : await huntAll({
        keywords: prefs.keywords?.length ? prefs.keywords : prefs.roles,
        ghCompanies: prefs.ghCompanies ?? [],
        leverCompanies: prefs.leverCompanies ?? [],
      });

  // Cap per run to bound cost.
  const scoreLimit = Number(process.env.SCORE_LIMIT_PER_HUNT ?? 60);

  // On rescore, leave anything already actioned (queued/applied) alone — the
  // user has invested in those and a new score shouldn't silently skip them.
  const targets = (
    rescore
      ? db
          .prepare(
            `SELECT * FROM jobs WHERE status IN ('matched','skipped') ORDER BY id DESC LIMIT ?`
          )
          .all(scoreLimit)
      : db.prepare("SELECT * FROM jobs WHERE score IS NULL ORDER BY id DESC LIMIT ?").all(scoreLimit)
  ) as Scorable[];

  let scored = 0;
  let matched = 0;
  for (const job of targets) {
    try {
      const s = await scoreJob(resume, prefs, job);
      db.prepare(
        `UPDATE jobs SET score = ?, score_reason = ?,
         status = CASE WHEN ? >= 60 THEN 'matched' ELSE 'skipped' END WHERE id = ?`
      ).run(s.score, s.reason, s.score, job.id);
      scored++;
      if (s.score >= 60) matched++;
    } catch (e) {
      console.error(`score failed for job ${job.id}:`, e);
    }
  }

  const pending = db
    .prepare("SELECT COUNT(*) AS n FROM jobs WHERE score IS NULL")
    .get() as { n: number };

  return NextResponse.json({
    ...hunt,
    rescore,
    scored,
    matched,
    unscoredRemaining: pending.n,
  });
}
