import { NextResponse } from "next/server";
import db, { getProfile, sentToday } from "@/lib/db";
import { gmailReady } from "@/lib/gmail";

export const dynamic = "force-dynamic";

// Powers the sidebar badges and the dashboard setup checklist, so the app can
// answer "what's left to do" without the user going key-hunting.
export async function GET() {
  const { resume, prefs } = getProfile();

  const counts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM jobs) AS jobs,
        (SELECT COUNT(*) FROM jobs WHERE score >= 60) AS matched,
        (SELECT COUNT(*) FROM jobs WHERE status = 'applied') AS applied,
        (SELECT COUNT(*) FROM apps WHERE status IN ('draft','failed','manual')) +
        (SELECT COUNT(*) FROM emails WHERE status IN ('draft','failed')) AS pending,
        (SELECT COUNT(*) FROM emails WHERE status = 'sent') AS sent,
        (SELECT COUNT(*) FROM leads) AS leads`
    )
    .get() as Record<string, number>;

  const boards = (prefs?.ghCompanies?.length ?? 0) + (prefs?.leverCompanies?.length ?? 0);

  return NextResponse.json({
    counts: { ...counts, sentToday: sentToday() },
    setup: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      resume: Boolean(resume),
      prefs: Boolean(prefs?.roles?.length),
      gmail: gmailReady(),
      contacts: Boolean(process.env.APOLLO_API_KEY || process.env.HUNTER_API_KEY),
      places: Boolean(process.env.GOOGLE_PLACES_API_KEY),
      boards: boards > 0,
    },
  });
}
