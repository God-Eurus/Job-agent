// Company career boards hunted by default, so "company websites" are covered
// without the user hand-configuring slugs. All are public ATS endpoints.
// Verified live against each provider's public job-board API.

// Slugs verified to resolve — companies that moved off a provider are removed
// so hunts don't spend requests on 404s.
export const DEFAULT_GREENHOUSE = [
  "stripe", "figma", "databricks", "airbnb", "dropbox", "coinbase", "robinhood",
  "instacart", "reddit", "discord", "asana", "gitlab",
  "cloudflare", "twilio", "pinterest", "lyft", "flexport", "affirm", "brex",
  "airtable", "amplitude", "mixpanel", "vercel",
  "netlify", "elastic", "mongodb",
  "postman", "circleci", "algolia", "contentful", "groww", "phonepe",
];

export const DEFAULT_LEVER = ["spotify", "gopuff"];

export const DEFAULT_ASHBY = [
  "openai", "ramp", "linear", "cursor", "perplexity", "runway", "replit",
  "vanta", "deel", "posthog", "clerk", "mercury", "warp", "modal", "cohere",
  "elevenlabs", "harvey", "sierra",
];

export const DEFAULT_SMARTRECRUITERS = [
  "Visa", "Bosch", "Ubisoft", "Publicis", "IKEA", "Skechers", "LinkedIn",
];

/** Merge user-configured slugs with the built-in list, de-duplicated. */
export function withDefaults(user: string[] | undefined, defaults: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...(user ?? []), ...defaults]) {
    const k = s.trim();
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
  }
  return out;
}
