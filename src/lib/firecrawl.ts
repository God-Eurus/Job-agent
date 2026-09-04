// Open-web job discovery via Firecrawl. The ATS adapters in sources.ts only see
// boards we know about; this reaches postings anywhere on the web.
// Requires FIRECRAWL_API_KEY (firecrawl.dev).
import type { RawJob } from "./sources";
import { extractJobsFromPage, type ExtractedJob } from "./claude";

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

// Free path: when the URL is an ATS we recognise, the company is in the URL and
// no model call is needed. Anything else falls through to extractPage().
function parseAtsHit(hit: SearchHit): RawJob | null {
  const url = hit.url;
  if (!url) return null;

  const known =
    /greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com|recruitee\.com|breezy\.hr|jobvite\.com|bamboohr\.com|teamtailor\.com|personio\.|join\.com/i;
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

/**
 * A posting URL is only trustworthy if the scraped page actually contains it —
 * a model asked for a link will otherwise compose a plausible one. Listing pages
 * whose links fail this check are dropped rather than pointed at the search page.
 */
function verifiedUrl(
  candidate: string,
  pageUrl: string,
  markdown: string,
  isListing: boolean
): string | null {
  const c = candidate.trim();
  if (!c || !/^https?:\/\//i.test(c)) return isListing ? null : pageUrl;
  if (markdown.includes(c)) return c;
  return isListing ? null : pageUrl;
}

function toRawJob(
  j: ExtractedJob,
  pageUrl: string,
  markdown: string,
  isListing: boolean,
  source: string
): RawJob | null {
  const title = j.title?.trim();
  if (!title) return null;
  const url = verifiedUrl(j.url ?? "", pageUrl, markdown, isListing);
  if (!url) return null;

  return {
    source,
    external_id: `${source}-${url.split("?")[0]}`,
    title,
    company: j.company?.trim() || "Unknown",
    location: j.location?.trim() || null,
    remote: Boolean(j.remote),
    salary: j.salary?.trim() || null,
    url,
    // Never auto-submit a form we have not verified; the queue gates this too.
    apply_url: null,
    description: j.summary?.trim() || null,
    posted_at: null,
  };
}

/** Read postings out of scraped pages, a few at a time. */
async function extractPages(
  pages: { url: string; markdown: string }[],
  source: string,
  errors: string[]
): Promise<RawJob[]> {
  const CONCURRENCY = Number(process.env.EXTRACT_CONCURRENCY ?? 6);
  const out: RawJob[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < pages.length) {
      const page = pages[cursor++];
      try {
        const found = await extractJobsFromPage(page.url, page.markdown);
        const isListing = found.length > 1;
        for (const j of found) {
          const raw = toRawJob(j, page.url, page.markdown, isListing, source);
          if (raw) out.push(raw);
        }
      } catch (e) {
        errors.push(`extract ${page.url.slice(0, 60)}: ${String(e).slice(0, 80)}`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pages.length) }, () => worker())
  );
  return out;
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

  const pair = <T,>(fn: (role: string, place: string) => T) =>
    roles.flatMap((role) => places.map((place) => fn(role, place)));

  // Budget is requests-per-minute, so spend it where the marginal job is. The
  // ATS-scoped query is the weakest — sources.ts already pulls those boards
  // through their own APIs — so it gets the smallest share, and open queries
  // (which surface company career sites, Naukri, apna, LinkedIn, Internshala…)
  // get the largest.
  const atsQ = pair(
    (role, place) =>
      `(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com) "${role}" ${place}`
  ).slice(0, Number(process.env.FIRECRAWL_ATS_QUERIES ?? 2));

  const openQ = pair((role, place) => `"${role}" jobs hiring ${place}`).slice(
    0,
    Number(process.env.FIRECRAWL_OPEN_QUERIES ?? 6)
  );

  // Big tech runs in-house portals that expose no ATS API and block plain
  // requests, so search is the only way in. (Amazon is absent on purpose —
  // sources.ts hits its public JSON API directly, for free.)
  const bigTechQ = places
    .slice(0, Number(process.env.FIRECRAWL_BIGTECH_QUERIES ?? 2))
    .map(
      (place) =>
        "(site:jobs.apple.com OR site:metacareers.com OR site:careers.microsoft.com " +
        `OR site:jobs.netflix.com OR site:google.com/about/careers) "${roles[0] ?? "software engineer"}" ${place}`
    );

  const queries = [...openQ, ...bigTechQ, ...atsQ];

  const errors: string[] = [];
  const hits: SearchHit[] = [];
  for (const q of queries) {
    try {
      hits.push(...(await paced(() => search(q, opts.perQuery ?? 10))));
    } catch (e) {
      errors.push(String(e).slice(0, 160));
    }
  }

  const seenUrl = new Set<string>();
  const jobs: RawJob[] = [];
  const toExtract: { url: string; markdown: string }[] = [];

  for (const hit of hits) {
    const url = hit.url;
    if (!url || seenUrl.has(url)) continue;
    seenUrl.add(url);

    const ats = parseAtsHit(hit);
    if (ats) {
      jobs.push(ats);
      continue;
    }
    // Too short to be a real posting or listing — usually a redirect or a wall.
    const md = hit.markdown ?? "";
    if (md.length < 400) continue;
    toExtract.push({ url, markdown: md });
  }

  const MAX_EXTRACT = Number(process.env.MAX_EXTRACT_PAGES ?? 30);
  jobs.push(...(await extractPages(toExtract.slice(0, MAX_EXTRACT), "web", errors)));

  const deduped: RawJob[] = [];
  const seenId = new Set<string>();
  for (const j of jobs) {
    if (seenId.has(j.external_id)) continue;
    seenId.add(j.external_id);
    deduped.push(j);
  }
  return { jobs: deduped, queries, errors };
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

const HEX = "0123456789abcdef";
const PLACEHOLDER_JK = new Set(
  Array.from({ length: HEX.length }, (_, i) => HEX.slice(i) + HEX.slice(0, i))
);

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
      // Titles render as markdown links to /rc/clk?jk=… or /viewjob?jk=…, with
      // the employer and its city on the two <br>-separated lines that follow.
      // Reading those is why rows no longer land as "See posting".
      for (const m of md.matchAll(
        /\[([^\]]{4,120})\]\((https?:\/\/[^)]*?[?&]jk=([a-z0-9]+)[^)]*)\)((?:<br>[^<|\n]{0,120}){0,2})/gi
      )) {
        const [, rawTitle, url, jk, tail] = m;
        const title = rawTitle.replace(/\s+/g, " ").trim();
        // Skip Indeed's own nav/search chrome, which also links with jk params.
        if (/salaries|company reviews|sign in|post your resume/i.test(title)) continue;
        // Indeed's markup carries template links whose id is just the hex
        // alphabet rotated ("123456789abcdef0"); they ingest as real postings
        // pointing at a dead page.
        if (PLACEHOLDER_JK.has(jk.toLowerCase())) continue;
        if (seen.has(jk)) continue;
        seen.add(jk);

        const [company, where] = (tail ?? "")
          .split("<br>")
          .map((s) => s.trim())
          .filter(Boolean);

        jobs.push({
          source: "indeed",
          external_id: `indeed-${jk}`,
          title,
          company: company || "See posting",
          // Fall back to the searched place only when the card omits a city.
          location: where || t.place,
          remote: /remote|work from home/i.test(`${title} ${where ?? ""} ${t.place}`),
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
