// Open-web job discovery via Firecrawl. The ATS adapters in sources.ts only see
// boards we know about; this reaches postings anywhere on the web.
// Requires FIRECRAWL_API_KEY (firecrawl.dev).
import type { RawJob } from "./sources";

const API = "https://api.firecrawl.dev/v2";

type SearchHit = { url?: string; title?: string; description?: string; markdown?: string };

export function firecrawlReady() {
  return Boolean(process.env.FIRECRAWL_API_KEY);
}


// Firecrawl's plan caps requests per minute (12 on the current tier), and a
// parallel burst returns 429 for most of them. Pace calls instead of losing them.
const MIN_GAP_MS = Number(process.env.FIRECRAWL_MIN_GAP_MS ?? 5200);
let lastCall = 0;

async function paced<T>(fn: () => Promise<T>): Promise<T> {
  const wait = Math.max(0, lastCall + MIN_GAP_MS - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  return fn();
}

async function search(query: string, limit: number): Promise<SearchHit[]> {
  const res = await fetch(`${API}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      limit,
      // tbs=qdr:w restricts Google to the past week — job posts go stale fast.
      tbs: "qdr:w",
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`firecrawl search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { data?: SearchHit[] | { web?: SearchHit[] } };
  const d = data.data;
  return Array.isArray(d) ? d : (d?.web ?? []);
}

// Pull company + title out of an ATS URL when possible; fall back to the page title.
function parseHit(hit: SearchHit): RawJob | null {
  const url = hit.url;
  if (!url) return null;

  const known =
    /greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com|recruitee\.com|breezy\.hr|jobvite\.com|bamboohr\.com|teamtailor\.com|personio\.|join\.com|workday/i;
  if (!known.test(url)) return null;

  let company = "Unknown";
  const m =
    url.match(/boards\.greenhouse\.io\/([^/?#]+)/i) ??
    url.match(/job-boards\.greenhouse\.io\/([^/?#]+)/i) ??
    url.match(/jobs\.lever\.co\/([^/?#]+)/i) ??
    url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i) ??
    url.match(/jobs\.smartrecruiters\.com\/([^/?#]+)/i) ??
    url.match(/apply\.workable\.com\/([^/?#]+)/i) ??
    url.match(/https?:\/\/([^./]+)\.(?:recruitee|breezy|teamtailor|personio)\./i);
  if (m) company = decodeURIComponent(m[1]).replace(/[-_]/g, " ");

  const title = (hit.title ?? "").split(/[|\-–—@]/)[0].trim() || "Open role";

  return {
    source: "web",
    external_id: `web-${url.split("?")[0]}`,
    title,
    company,
    location: null,
    remote: /remote/i.test(`${hit.title ?? ""} ${hit.description ?? ""}`),
    salary: null,
    url,
    // Deliberately null: these come from search, so we can't verify the page is
    // a fillable form. Auto-apply is gated to greenhouse/lever elsewhere anyway.
    apply_url: null,
    description: (hit.markdown ?? hit.description ?? "").slice(0, 6000) || null,
    posted_at: null,
  };
}

/** Search the open web for current openings matching the user's roles. */
export async function searchWebJobs(opts: {
  roles: string[];
  locations: string[];
  remoteOnly: boolean;
  perQuery?: number;
}): Promise<{ jobs: RawJob[]; queries: string[]; errors: string[] }> {
  if (!firecrawlReady()) return { jobs: [], queries: [], errors: ["FIRECRAWL_API_KEY not set"] };

  // Every location matters: using only locations[0] meant a profile listing
  // ["Remote", "India"] never searched India at all.
  const places = opts.remoteOnly
    ? ["remote"]
    : (opts.locations.length ? opts.locations : ["remote"]).slice(0, 3);
  const roles = opts.roles.slice(0, 2);

  // Site-scoped queries beat generic ones: they land on real postings rather
  // than aggregator index pages. Capped so a long location list can't multiply
  // Firecrawl spend without bound.
  // One query per role+place covering all three boards via OR — three separate
  // site: queries burned the per-minute quota for no extra coverage.
  const queries = roles
    .flatMap((role) =>
      places.map(
        (where) =>
          `(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com) "${role}" ${where}`
      )
    )
    .slice(0, 6);

  const errors: string[] = [];
  const results: PromiseSettledResult<SearchHit[]>[] = [];
  for (const q of queries) {
    try {
      results.push({ status: "fulfilled", value: await paced(() => search(q, opts.perQuery ?? 10)) });
    } catch (e) {
      results.push({ status: "rejected", reason: e });
    }
  }

  const seen = new Set<string>();
  const jobs: RawJob[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") {
      errors.push(String(r.reason).slice(0, 160));
      continue;
    }
    for (const hit of r.value) {
      const job = parseHit(hit);
      if (!job || seen.has(job.external_id)) continue;
      seen.add(job.external_id);
      jobs.push(job);
    }
  }
  return { jobs, queries, errors };
}

/** Firecrawl scrape of one URL, returned as markdown. */
async function scrape(url: string): Promise<string> {
  const res = await fetch(`${API}/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`firecrawl scrape ${res.status}`);
  const data = (await res.json()) as { data?: { markdown?: string } };
  return data.data?.markdown ?? "";
}

/**
 * Indeed has no public API and blocks plain requests, but its search pages
 * render for Firecrawl. Results are the strongest India-market source we found
 * — the Bengaluru sample surfaced roles explicitly tagged "0-1 yr exp".
 */
export async function searchIndeed(opts: {
  roles: string[];
  locations: string[];
  remoteOnly: boolean;
}): Promise<{ jobs: RawJob[]; errors: string[] }> {
  if (!firecrawlReady()) return { jobs: [], errors: [] };

  const places = opts.remoteOnly
    ? ["Remote"]
    : (opts.locations.length ? opts.locations : ["Remote"]).slice(0, 3);
  const roles = opts.roles.slice(0, 2);

  // Indeed is country-scoped by domain; India results live on in.indeed.com.
  const domainFor = (place: string) =>
    /india|bengaluru|bangalore|mumbai|delhi|hyderabad|pune|chennai|gurgaon|noida|jaipur/i.test(place)
      ? "in.indeed.com"
      : "www.indeed.com";

  const targets = roles.flatMap((role) =>
    places.map((place) => ({
      role,
      place,
      url: `https://${domainFor(place)}/jobs?q=${encodeURIComponent(role)}&l=${encodeURIComponent(place)}&fromage=7`,
    }))
  );

  const jobs: RawJob[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  // Sequential: Indeed rate-limits, and this is a handful of requests.
  for (const t of targets) {
    try {
      const md = await paced(() => scrape(t.url));
      // Titles render as markdown links to /rc/clk?jk=… or /viewjob?jk=…
      for (const m of md.matchAll(/\[([^\]]{4,120})\]\((https?:\/\/[^)]*?[?&]jk=([a-z0-9]+)[^)]*)\)/gi)) {
        const [, rawTitle, url, jk] = m;
        const title = rawTitle.replace(/\s+/g, " ").trim();
        // Skip Indeed's own nav/search chrome, which also links with jk params.
        if (/salaries|company reviews|sign in|post your resume/i.test(title)) continue;
        if (seen.has(jk)) continue;
        seen.add(jk);
        jobs.push({
          source: "indeed",
          external_id: `indeed-${jk}`,
          title,
          company: "See posting",
          location: t.place,
          remote: /remote/i.test(`${title} ${t.place}`),
          salary: null,
          url,
          // Indeed hosts many different employer forms; never auto-submit.
          apply_url: null,
          description: null,
          posted_at: null,
        });
      }
    } catch (e) {
      errors.push(`indeed ${t.place}: ${String(e).slice(0, 80)}`);
    }
  }
  return { jobs, errors };
}
