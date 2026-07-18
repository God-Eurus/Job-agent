import { NextRequest, NextResponse } from "next/server";
import db, { getProfile } from "@/lib/db";
import { searchBusinesses, scrapeEmailFromSite } from "@/lib/places";
import { draftBizdevPitch } from "@/lib/claude";
import { findViaHunter } from "@/lib/contacts";

export const maxDuration = 300;

export async function GET() {
  const leads = db.prepare("SELECT * FROM leads ORDER BY id DESC LIMIT 200").all();
  return NextResponse.json({ leads });
}

// { action: "search", region, category } — find businesses in a region
// { action: "pitch", leadId }          — find email + draft pitch into queue
export async function POST(req: NextRequest) {
  const payload = await req.json();

  if (payload.action === "search") {
    try {
      const result = await searchBusinesses({
        region: payload.region,
        category: payload.category,
      });
      return NextResponse.json(result);
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  if (payload.action === "pitch") {
    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(payload.leadId) as
      | { id: number; name: string; category: string | null; region: string | null; website: string | null; email: string | null }
      | undefined;
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const { resume } = getProfile();
    if (!resume) return NextResponse.json({ error: "No resume" }, { status: 400 });

    // Find an email: stored → site scrape → hunter
    let email = lead.email;
    if (!email && lead.website) {
      email = await scrapeEmailFromSite(lead.website);
      if (!email) {
        try {
          const domain = new URL(lead.website).hostname.replace(/^www\./, "");
          const c = await findViaHunter(domain);
          email = c?.email ?? null;
        } catch {
          /* none */
        }
      }
    }
    if (!email) {
      return NextResponse.json(
        { error: "No email found — phone contact only. Consider calling or WhatsApp.", phoneOnly: true },
        { status: 422 }
      );
    }
    db.prepare("UPDATE leads SET email = ? WHERE id = ?").run(email, lead.id);

    const draft = await draftBizdevPitch(resume, lead);
    db.prepare(
      "INSERT INTO emails (kind, lead_id, to_email, company, subject, body, status) VALUES ('bizdev', ?, ?, ?, ?, ?, 'draft')"
    ).run(lead.id, email, lead.name, draft.subject, draft.body);
    db.prepare("UPDATE leads SET status = 'pitched' WHERE id = ?").run(lead.id);
    return NextResponse.json({ ok: true, email });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
