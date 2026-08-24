import { NextRequest, NextResponse } from "next/server";
import db, { getProfile } from "@/lib/db";
import { searchBusinesses, scrapeEmailFromSite, fetchPlacePhone } from "@/lib/places";
import { draftBizdevPitch, draftWhatsAppPitch } from "@/lib/claude";
import { findViaHunter } from "@/lib/contacts";

export const maxDuration = 300;

// wa.me needs digits only, including country code. Places returns national
// format for local results, so infer the code from the searched region.
// Countries and a few major cities, since regions are often typed as just a city.
const COUNTRY_CODES: Record<string, string> = {
  india: "91", bengaluru: "91", mumbai: "91", delhi: "91", jaipur: "91",
  hyderabad: "91", chennai: "91", pune: "91", kolkata: "91", ahmedabad: "91",
  "united states": "1", usa: "1", canada: "1", toronto: "1", "new york": "1",
  uk: "44", "united kingdom": "44", london: "44", manchester: "44",
  uae: "971", "united arab emirates": "971", dubai: "971", "abu dhabi": "971",
  sharjah: "971", qatar: "974", doha: "974", "saudi arabia": "966", riyadh: "966",
  netherlands: "31", amsterdam: "31", rotterdam: "31", "the hague": "31",
  norway: "47", oslo: "47", bergen: "47", sweden: "46", stockholm: "46",
  denmark: "45", copenhagen: "45", germany: "49", berlin: "49", munich: "49",
  france: "33", paris: "33", spain: "34", madrid: "34", barcelona: "34",
  italy: "39", rome: "39", milan: "39", portugal: "351", lisbon: "351",
  ireland: "353", dublin: "353", poland: "48", warsaw: "48",
  australia: "61", sydney: "61", melbourne: "61", "new zealand": "64",
  singapore: "65", malaysia: "60", "kuala lumpur": "60", indonesia: "62",
  jakarta: "62", philippines: "63", manila: "63", vietnam: "84",
  thailand: "66", bangkok: "66", japan: "81", tokyo: "81",
  pakistan: "92", karachi: "92", lahore: "92", bangladesh: "880", dhaka: "880",
  "sri lanka": "94", nepal: "977", "south africa": "27", nigeria: "234",
  lagos: "234", kenya: "254", nairobi: "254", egypt: "20", cairo: "20",
  brazil: "55", "sao paulo": "55", mexico: "52", colombia: "57", bogota: "57",
};

function normalisePhone(raw: string | null, region: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;

  // Already international (Places returns "+91 93149 18766").
  if (raw.trim().startsWith("+")) return digits;

  // A leading 0 is a national trunk prefix and is never part of an E.164
  // number — carrying it through produced links WhatsApp rejects outright.
  const national = digits.replace(/^0+/, "");

  // Longest match wins, so "abu dhabi" beats a stray substring hit.
  const hay = (region ?? "").toLowerCase();
  const code = Object.entries(COUNTRY_CODES)
    .filter(([k]) => hay.includes(k))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1];

  if (code) return national.startsWith(code) ? national : code + national;

  // No recognised country: a wrong code is worse than none — it produces a
  // real but unrelated number. Only trust digits that already look international.
  return national.length >= 11 ? national : null;
}

// Leads accumulate across searches, so scope the list to one region rather than
// returning everything — otherwise a new city's results sit under old ones (and
// eventually fall past the row cap).
export async function GET(req: NextRequest) {
  const region = req.nextUrl.searchParams.get("region");

  const category = req.nextUrl.searchParams.get("category");

  // One row per city regardless of how it was typed: "jaipur", "Jaipur, India"
  // and "JAIPUR" all key to `jaipur`. Anything after the first comma is dropped,
  // so same-name cities in different countries do collapse together — acceptable
  // for a personal tool, and the alternative is a list full of near-duplicates.
  const CITY_KEY = `LOWER(TRIM(CASE WHEN INSTR(region, ',') > 0
      THEN SUBSTR(region, 1, INSTR(region, ',') - 1) ELSE region END))`;

  const regions = db
    .prepare(
      `SELECT ${CITY_KEY} AS city, COUNT(*) AS n, MAX(id) AS recent
       FROM leads WHERE region IS NOT NULL AND TRIM(region) <> ''
       GROUP BY city ORDER BY recent DESC`
    )
    .all() as Array<{ city: string; n: number }>;

  // Default to the most recently searched city.
  const activeCity = (region ?? regions[0]?.city ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const active = activeCity || null;

  const leads = active
    ? (db
        .prepare(
          `SELECT * FROM leads
           WHERE ${CITY_KEY} = ?
             ${category ? "AND LOWER(TRIM(category)) = LOWER(TRIM(?))" : ""}
           ORDER BY id DESC LIMIT 300`
        )
        .all(...(category ? [active, category] : [active])) as Array<
        Record<string, unknown>
      >)
    : [];

  // Business types present in this city, so one city can hold several searches.
  const categories = active
    ? (db
        .prepare(
          `SELECT category, COUNT(*) AS n FROM leads
           WHERE ${CITY_KEY} = ? AND category IS NOT NULL
           GROUP BY LOWER(TRIM(category)) ORDER BY n DESC`
        )
        .all(active) as Array<{ category: string; n: number }>)
    : [];

  return NextResponse.json({ leads, regions, categories, active, category });
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
          place_id: string | null;
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
      // Prefer Google's international format over inferring a country code.
      let source = lead.phone;
      if (source && !source.trim().startsWith("+") && lead.place_id) {
        try {
          const intl = await fetchPlacePhone(lead.place_id);
          if (intl) {
            db.prepare("UPDATE leads SET phone = ? WHERE id = ?").run(intl, lead.id);
            source = intl;
          }
        } catch {
          /* fall through to inference */
        }
      }

      const phone = normalisePhone(source, lead.region);
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
