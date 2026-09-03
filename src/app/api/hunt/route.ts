import { NextRequest, NextResponse } from "next/server";
import db, { getProfile } from "@/lib/db";
import { huntAll } from "@/lib/sources";
import { searchWebJobs, searchIndeed, firecrawlReady } from "@/lib/firecrawl";
import {
  DEFAULT_GREENHOUSE,
  DEFAULT_LEVER,
  DEFAULT_ASHBY,
  DEFAULT_SMARTRECRUITERS,
  withDefaults,
} from "@/lib/boards";
import { scoreJob } from "@/lib/claude";

// A full hunt now reads pages with the model as well as fetching them, and
// Firecrawl calls are paced against a per-minute cap — a measured run takes
// ~5min, so the declared ceiling has to clear it.
export const maxDuration = 600;

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
  // scoreOnly works through the backlog without hitting any source APIs.
  const scoreOnly = Boolean(body?.scoreOnly);
  const limitOverride = Number(body?.limit) || 0;

  // Open-web pass first (best effort) so its results are deduped alongside the
  // board results in the same insert.
  let web: { jobs: Awaited<ReturnType<typeof searchWebJobs>>["jobs"]; errors: string[] } = {
    jobs: [],
    errors: [],
  };
  if (!rescore && !scoreOnly && firecrawlReady()) {
    const searchOpts = {
      roles: prefs.roles?.length ? prefs.roles : prefs.keywords,
      locations: prefs.locations ?? [],
      remoteOnly: Boolean(prefs.remoteOnly),
    };
    // Sequential: both share one Firecrawl rate limiter, so running them in
    // parallel would just trade results for 429s.
    try {
      const w = await searchWebJobs(searchOpts);
      web = { jobs: w.jobs, errors: w.errors };
    } catch (e) {
      web = { jobs: [], errors: [String(e).slice(0, 160)] };
    }
    try {
      const indeed = await searchIndeed(searchOpts);
      web.jobs = [...web.jobs, ...indeed.jobs];
      web.errors = [...web.errors, ...indeed.errors];
    } catch (e) {
      web.errors = [...web.errors, String(e).slice(0, 160)];
    }
  }

  const hunt = rescore || scoreOnly
    ? { fetched: 0, inserted: 0, errors: [] as string[] }
    : await huntAll({
        keywords: prefs.keywords?.length ? prefs.keywords : prefs.roles,
        roles: prefs.roles ?? [],
        yearsExperience: resume.years_experience,
        linkedInOpts: {
          roles: prefs.roles?.length ? prefs.roles : prefs.keywords,
          locations: prefs.locations ?? [],
          remoteOnly: Boolean(prefs.remoteOnly),
        },
        // Same shape, but for sources that take a free-text query rather than a
        // board slug (currently amazon.jobs).
        searchOpts: {
          roles: prefs.roles?.length ? prefs.roles : prefs.keywords,
          locations: prefs.locations ?? [],
          remoteOnly: Boolean(prefs.remoteOnly),
        },
        // Built-in company boards mean "company websites" are covered without
        // the user configuring anything; their own slugs are merged in.
        ghCompanies: withDefaults(prefs.ghCompanies, DEFAULT_GREENHOUSE),
        leverCompanies: withDefaults(prefs.leverCompanies, DEFAULT_LEVER),
        ashbyCompanies: DEFAULT_ASHBY,
        smartRecruitersCompanies: DEFAULT_SMARTRECRUITERS,
        webJobs: web.jobs,
      });

  // Cap per run to bound cost.
  const scoreLimit =
    limitOverride || Number(process.env.SCORE_LIMIT_PER_HUNT ?? 60);

  // On rescore, leave anything already actioned (queued/applied) alone — the
  // user has invested in those and a new score shouldn't silently skip them.
  // Re-score works highest-score-first so near-threshold jobs get re-examined,
  // rather than re-judging whichever 60 happen to be newest.
  const targets = (
    rescore
      ? db
          .prepare(
            `SELECT * FROM jobs WHERE status IN ('matched','skipped')
             ORDER BY score DESC, id DESC LIMIT ?`
          )
          .all(scoreLimit)
      : db.prepare("SELECT * FROM jobs WHERE score IS NULL ORDER BY id DESC LIMIT ?").all(scoreLimit)
  ) as Scorable[];

  // Scoring is one small model call per job; sequential runs took minutes for a
  // few hundred. Bounded concurrency keeps it fast without tripping rate limits.
  const CONCURRENCY = Number(process.env.SCORE_CONCURRENCY ?? 8);
  // Scoring is non-deterministic near the 60 threshold, so a re-score used to
  // erode the matched set (20 -> 14 -> 9). Re-scoring may promote a job but
  // never silently demotes one; dismissing stays a manual Skip.
  const update = db.prepare(
    rescore
      ? `UPDATE jobs SET score = ?, score_reason = ?,
         status = CASE
           WHEN status = 'matched' THEN 'matched'
           WHEN ? >= 60 THEN 'matched'
           ELSE 'skipped' END
         WHERE id = ?`
      : `UPDATE jobs SET score = ?, score_reason = ?,
         status = CASE WHEN ? >= 60 THEN 'matched' ELSE 'skipped' END WHERE id = ?`
  );

  let scored = 0;
  let matched = 0;
  let cursor = 0;
  // Bind the narrowed values — TS widens them back to nullable inside a closure.
  const profile = resume;
  const criteria = prefs;

  async function worker() {
    while (cursor < targets.length) {
      const job = targets[cursor++];
      try {
        const s = await scoreJob(profile, criteria, job);
        update.run(s.score, s.reason, s.score, job.id);
        scored++;
        if (s.score >= 60) matched++;
      } catch (e) {
        console.error(`score failed for job ${job.id}:`, e);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker())
  );

  const pending = db
    .prepare("SELECT COUNT(*) AS n FROM jobs WHERE score IS NULL")
    .get() as { n: number };

  return NextResponse.json({
    ...hunt,
    errors: [...hunt.errors, ...web.errors].slice(0, 10),
    rescore,
    scored,
    matched,
    webFound: web.jobs.length,
    webEnabled: firecrawlReady(),
    unscoredRemaining: pending.n,
  });
}
