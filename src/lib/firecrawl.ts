// Open-web job discovery via Firecrawl. The ATS adapters in sources.ts only see
// boards we know about; this reaches postings anywhere on the web.
// Requires FIRECRAWL_API_KEY (firecrawl.dev).
import type { RawJob } from "./sources";

const API = "https://api.firecrawl.dev/v2";

type SearchHit = { url?: string; title?: string; description?: string; markdown?: string };

export function firecrawlReady() {
  return Boolean(process.env.FIRECRAWL_API_KEY);
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

  const where = opts.remoteOnly ? "remote" : (opts.locations[0] ?? "remote");
  const roles = opts.roles.slice(0, 3);

  // Site-scoped queries beat generic ones: they land on real postings rather
  // than aggregator index pages.
  const queries = roles.flatMap((role) => [
    `site:boards.greenhouse.io "${role}" ${where}`,
    `site:jobs.lever.co "${role}" ${where}`,
    `site:jobs.ashbyhq.com "${role}" ${where}`,
  ]);

  const errors: string[] = [];
  const results = await Promise.allSettled(
    queries.map((q) => search(q, opts.perQuery ?? 8))
  );

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
