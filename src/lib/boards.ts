// Company career boards hunted by default, so "company websites" are covered
// without the user hand-configuring slugs. All are public ATS endpoints.
// Verified live against each provider's public job-board API.

export const DEFAULT_GREENHOUSE = [
  "stripe", "figma", "databricks", "airbnb", "dropbox", "coinbase", "robinhood",
  "instacart", "doordash", "reddit", "discord", "asana", "gitlab", "hashicorp",
  "cloudflare", "twilio", "pinterest", "lyft", "flexport", "affirm", "brex",
  "notion", "airtable", "amplitude", "mixpanel", "segment", "sentry", "vercel",
  "netlify", "supabase", "grafana", "elastic", "mongodb", "confluent", "snyk",
  "postman", "circleci", "algolia", "contentful", "razorpay", "zomato",
  "swiggy", "cred", "meesho", "groww", "zerodha", "phonepe", "freshworks",
  "postmanlabs", "browserstack",
];

export const DEFAULT_LEVER = [
  "spotify", "shopify", "figma", "ramp", "netlify", "brex", "nubank",
  "showpad", "voiceflow", "gopuff", "hopper", "kong", "mistralai", "welocalize",
];

export const DEFAULT_ASHBY = [
  "openai", "ramp", "linear", "cursor", "perplexity", "runway", "replit",
  "vanta", "deel", "posthog", "clerk", "mercury", "warp", "modal", "cohere",
  "elevenlabs", "harvey", "sierra", "together", "scale",
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
