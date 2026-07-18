// Freelance biz-dev lead discovery via Google Places API (New).
import db from "./db";

export async function searchBusinesses(opts: {
  region: string;      // "Jaipur, India"
  category: string;    // "restaurants", "gyms", "boutiques"
  maxResults?: number;
}): Promise<{ found: number; inserted: number }> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY not set");

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.websiteUri,places.nationalPhoneNumber,places.rating,places.primaryTypeDisplayName",
    },
    body: JSON.stringify({
      textQuery: `${opts.category} in ${opts.region}`,
      maxResultCount: Math.min(opts.maxResults ?? 20, 20),
    }),
  });
  if (!res.ok) throw new Error(`Places ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    places?: Array<{
      id: string;
      displayName?: { text: string };
      websiteUri?: string;
      nationalPhoneNumber?: string;
      rating?: number;
      primaryTypeDisplayName?: { text: string };
    }>;
  };

  const places = data.places ?? [];
  const insert = db.prepare(`
    INSERT OR IGNORE INTO leads (place_id, name, region, category, website, phone, rating, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  for (const p of places) {
    // Best leads: no website, or a facebook/instagram page standing in for one
    const site = p.websiteUri ?? null;
    const weak = !site || /facebook\.com|instagram\.com|wa\.me|linktr\.ee/i.test(site);
    const r = insert.run(
      p.id,
      p.displayName?.text ?? "Unknown",
      opts.region,
      p.primaryTypeDisplayName?.text ?? opts.category,
      site,
      p.nationalPhoneNumber ?? null,
      p.rating ?? null,
      weak ? "no-or-weak-website" : "has-website"
    );
    inserted += r.changes;
  }
  return { found: places.length, inserted };
}

// Try to find a contact email on the business's own website (public contact pages only).
export async function scrapeEmailFromSite(website: string): Promise<string | null> {
  const candidates = [website, new URL("/contact", website).toString()];
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (job-agent contact lookup)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const m = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      const email = m?.find(
        (e) => !/\.(png|jpg|gif|webp|svg)$/i.test(e) && !/example\.|sentry|wixpress/i.test(e)
      );
      if (email) return email;
    } catch {
      /* next */
    }
  }
  return null;
}
