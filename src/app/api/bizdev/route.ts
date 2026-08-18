import { NextRequest, NextResponse } from "next/server";
import db, { getProfile } from "@/lib/db";
import { searchBusinesses, scrapeEmailFromSite } from "@/lib/places";
import { draftBizdevPitch, draftWhatsAppPitch } from "@/lib/claude";
import { findViaHunter } from "@/lib/contacts";

export const maxDuration = 300;

// wa.me needs digits only, including country code. Places returns national
// format for local results, so infer the code from the searched region.
const COUNTRY_CODES: Record<string, string> = {
  india: "91", "united states": "1", usa: "1", uk: "44", "united kingdom": "44",
  uae: "971", "united arab emirates": "971", canada: "1", australia: "61",
  germany: "49", singapore: "65",
};

function normalisePhone(raw: string | null, region: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (raw.trim().startsWith("+")) return digits;

  const hay = (region ?? "").toLowerCase();
  const code = Object.entries(COUNTRY_CODES).find(([k]) => hay.includes(k))?.[1];
  if (!code) return digits.length >= 11 ? digits : null;
  return digits.startsWith(code) ? digits : code + digits.replace(/^0+/, "");
}

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
      | {
          id: number;
          name: string;
          category: string | null;
          region: string | null;
          website: string | null;
          email: string | null;
          phone: string | null;
        }
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
    // No public email: fall back to WhatsApp if the listing carries a phone.
    if (!email) {
      const phone = normalisePhone(lead.phone, lead.region);
      if (!phone) {
        return NextResponse.json(
          { error: "No public email and no usable phone number for this lead." },
          { status: 422 }
        );
      }
      const message = await draftWhatsAppPitch(resume, lead);
      db.prepare(
        `INSERT INTO emails (kind, lead_id, channel, to_phone, company, subject, body, status)
         VALUES ('bizdev', ?, 'whatsapp', ?, ?, ?, ?, 'draft')`
      ).run(lead.id, phone, lead.name, `WhatsApp · ${lead.name}`, message);
      db.prepare("UPDATE leads SET status = 'pitched' WHERE id = ?").run(lead.id);
      return NextResponse.json({ ok: true, channel: "whatsapp", phone });
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
