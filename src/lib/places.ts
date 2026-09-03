// Freelance biz-dev lead discovery via Google Places API (New).
import db from "./db";

type Place = {
  id: string;
  displayName?: { text: string };
  websiteUri?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  primaryTypeDisplayName?: { text: string };
};

/** Turn Google's terse auth errors into something the user can act on. */
function placesError(status: number, body: string): Error {
  if (status === 403)
    return new Error(
      "Places API denied the request (403). Most often billing is not enabled on " +
        "the Google Cloud project — Places has no free tier and every call is " +
        "rejected until a billing account is linked. Failing that, check that " +
        "“Places API (New)” is enabled and included in the key's API restrictions " +
        "(the legacy “Places API” is a different product and does not cover this)."
    );
  if (status === 429)
    return new Error("Places API quota exceeded (429). Try again later or raise the quota.");
  return new Error(`Places ${status}: ${body.slice(0, 200)}`);
}

export async function searchBusinesses(opts: {
  region: string;      // "Jaipur, India"
  category: string;    // "restaurants", "gyms", "boutiques"
  maxResults?: number;
}): Promise<{ found: number; inserted: number }> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY not set");

  // Each response caps at 20 results, so repeating a search returned the same
  // 20 places and inserted nothing new. Page through instead.
  const target = opts.maxResults ?? 60;
  const places: Place[] = [];
  let pageToken: string | undefined;

  do {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          // internationalPhoneNumber carries the country code, which wa.me requires;
          // the national format ("093149 18766") is not routable.
          "places.id,places.displayName,places.websiteUri,places.internationalPhoneNumber,places.nationalPhoneNumber,places.rating,places.primaryTypeDisplayName,nextPageToken",
      },
      body: JSON.stringify({
        textQuery: `${opts.category} in ${opts.region}`,
        pageSize: 20,
        ...(pageToken ? { pageToken } : {}),
      }),
    });
    if (!res.ok) {
      // A failed later page still leaves earlier results worth keeping.
      if (places.length === 0) throw placesError(res.status, await res.text());
      break;
    }
    const data = (await res.json()) as { places?: Place[]; nextPageToken?: string };
    places.push(...(data.places ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken && places.length < target);

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
      p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
      p.rating ?? null,
      weak ? "no-or-weak-website" : "has-website"
    );
    inserted += r.changes;
  }
  return { found: places.length, inserted };
}

// Try to find a contact email on the business's own website (public contact pages only).
/**
 * Authoritative international phone for a place ("+47 22 20 34 96").
 * Guessing a country code from the searched region breaks as soon as leads span
 * countries, so ask Google instead — we already store the place_id.
 */
export async function fetchPlacePhone(placeId: string): Promise<string | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY not set");

  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "internationalPhoneNumber",
    },
    signal: AbortSignal.timeout(10_000),
  });
  // Surface auth problems; a plain miss is not worth failing the whole pitch.
  if (res.status === 403 || res.status === 429)
    throw placesError(res.status, await res.text());
  if (!res.ok) return null;
  const data = (await res.json()) as { internationalPhoneNumber?: string };
  return data.internationalPhoneNumber ?? null;
}

// Addresses that show up in page source but are not a human contact: SDK config,
// analytics, image filenames, unattended mailboxes.
const JUNK_EMAIL =
  /(\.(png|jpe?g|gif|webp|svg|css|js)$)|gserviceaccount\.com|sentry\.|wixpress|example\.(com|org)|@(sentry|cloudflare|godaddy|squarespace|wix|shopify)/i;
const UNATTENDED = /^(no-?reply|do-?not-?reply|postmaster|abuse|bounce|mailer-daemon)@/i;
// A mailbox a person actually reads, in rough order of usefulness for a pitch.
const PREFERRED = /^(hello|hi|info|contact|kontakt|post|mail|office|sales|booking|admin)@/i;

export function pickContactEmail(html: string): string | null {
  const found = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  const usable = [...new Set(found.map((e) => e.toLowerCase()))].filter(
    (e) => !JUNK_EMAIL.test(e) && !UNATTENDED.test(e) && e.length < 60
  );
  return usable.find((e) => PREFERRED.test(e)) ?? usable[0] ?? null;
}

export async function scrapeEmailFromSite(website: string): Promise<string | null> {
  let candidates = [website];
  try {
    candidates = [
      website,
      new URL("/contact", website).toString(),
      new URL("/kontakt", website).toString(),
      new URL("/about", website).toString(),
    ];
  } catch {
    /* malformed URL — try it as given */
  }

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (job-agent contact lookup)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const email = pickContactEmail(await res.text());
      if (email) return email;
    } catch {
      /* next candidate */
    }
  }
  return null;
}
