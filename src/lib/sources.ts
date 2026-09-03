// Job discovery via public/no-auth APIs — no ToS-violating scraping, no login automation.
import db from "./db";

export type RawJob = {
  source: string;
  external_id: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  salary: string | null;
  url: string;
  apply_url: string | null;
  description: string | null;
  posted_at: string | null;
};

const UA = { "User-Agent": "job-agent/0.1 (personal job search tool)" };

async function getJSON(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// Favour recall here — Claude scoring downstream does the precision pass.
// Matching title/tags alone drops jobs that only name the stack in the body.
function matchesKeywords(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const t = text.toLowerCase();
  return keywords.some((k) => t.includes(k.toLowerCase()));
}

export async function fetchRemoteOK(keywords: string[]): Promise<RawJob[]> {
  const data = (await getJSON("https://remoteok.com/api")) as Array<Record<string, unknown>>;
  return data
    // The feed mixes blog posts and nav entries in with real postings; genuine
    // jobs always carry a company and a posting date.
    .filter((j) => j.id && j.position && j.company && j.date)
    .filter((j) =>
      matchesKeywords(
        `${j.position} ${(j.tags as string[])?.join(" ") ?? ""} ${String(j.description ?? "").slice(0, 2000)}`,
        keywords
      )
    )
    .map((j) => ({
      source: "remoteok",
      external_id: `remoteok-${j.id}`,
      title: String(j.position),
      company: String(j.company ?? "Unknown"),
      location: (j.location as string) || "Remote",
      remote: true,
      salary:
        j.salary_min && j.salary_max ? `$${j.salary_min}–$${j.salary_max}` : null,
      url: String(j.url ?? `https://remoteok.com/l/${j.id}`),
      apply_url: (j.apply_url as string) ?? null,
      description: (j.description as string) ?? null,
      posted_at: (j.date as string) ?? null,
    }));
}

// Remotive searches one term per request — query the top keywords in parallel.
export async function fetchRemotive(keywords: string[]): Promise<RawJob[]> {
  const terms = keywords.length ? keywords.slice(0, 4) : [""];
  const batches = await Promise.allSettled(
    terms.map((t) =>
      getJSON(
        `https://remotive.com/api/remote-jobs?limit=100${t ? `&search=${encodeURIComponent(t)}` : ""}`
      ) as Promise<{ jobs: Array<Record<string, unknown>> }>
    )
  );
  const seen = new Set<unknown>();
  const jobs: Array<Record<string, unknown>> = [];
  for (const b of batches) {
    if (b.status !== "fulfilled") continue;
    for (const j of b.value.jobs) {
      if (seen.has(j.id)) continue;
      seen.add(j.id);
      jobs.push(j);
    }
  }
  return jobs
    .filter((j) =>
      matchesKeywords(
        `${j.title} ${j.tags} ${j.category} ${String(j.description ?? "").slice(0, 2000)}`,
        keywords
      )
    )
    .map((j) => ({
      source: "remotive",
      external_id: `remotive-${j.id}`,
      title: String(j.title),
      company: String(j.company_name),
      location: (j.candidate_required_location as string) || "Remote",
      remote: true,
      salary: (j.salary as string) || null,
      url: String(j.url),
      apply_url: null,
      description: (j.description as string) ?? null,
      posted_at: (j.publication_date as string) ?? null,
    }));
}

export async function fetchArbeitnow(keywords: string[]): Promise<RawJob[]> {
  const data = (await getJSON("https://www.arbeitnow.com/api/job-board-api")) as {
    data: Array<Record<string, unknown>>;
  };
  return data.data
    .filter((j) =>
      matchesKeywords(
        `${j.title} ${(j.tags as string[])?.join(" ") ?? ""} ${String(j.description ?? "").slice(0, 2000)}`,
        keywords
      )
    )
    .map((j) => ({
      source: "arbeitnow",
      external_id: `arbeitnow-${j.slug}`,
      title: String(j.title),
      company: String(j.company_name),
      location: (j.location as string) || null,
      remote: Boolean(j.remote),
      salary: null,
      url: String(j.url),
      apply_url: String(j.url),
      description: (j.description as string) ?? null,
      posted_at: j.created_at ? new Date(Number(j.created_at) * 1000).toISOString() : null,
    }));
}

export async function fetchGreenhouse(slug: string): Promise<RawJob[]> {
  const data = (await getJSON(
    `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`
  )) as { jobs: Array<Record<string, unknown>> };
  return data.jobs.map((j) => ({
    source: "greenhouse",
    external_id: `gh-${slug}-${j.id}`,
    title: String(j.title),
    company: slug,
    location: ((j.location as Record<string, unknown>)?.name as string) ?? null,
    remote: /remote/i.test(String((j.location as Record<string, unknown>)?.name ?? "")),
    salary: null,
    url: String(j.absolute_url),
    apply_url: String(j.absolute_url),
    description: (j.content as string) ?? null,
    posted_at: (j.updated_at as string) ?? null,
  }));
}

export async function fetchLever(slug: string): Promise<RawJob[]> {
  const data = (await getJSON(
    `https://api.lever.co/v0/postings/${slug}?mode=json`
  )) as Array<Record<string, unknown>>;
  return data.map((j) => {
    const cats = (j.categories as Record<string, unknown>) ?? {};
    return {
      source: "lever",
      external_id: `lever-${slug}-${j.id}`,
      title: String(j.text),
      company: slug,
      location: (cats.location as string) ?? null,
      remote: /remote/i.test(String(cats.location ?? "") + String(j.workplaceType ?? "")),
      salary: null,
      url: String(j.hostedUrl),
      apply_url: `${j.hostedUrl}/apply`,
      description: (j.descriptionPlain as string) ?? null,
      posted_at: j.createdAt ? new Date(Number(j.createdAt)).toISOString() : null,
    };
  });
}

export async function fetchAshby(slug: string): Promise<RawJob[]> {
  const data = (await getJSON(
    `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`
  )) as { jobs?: Array<Record<string, unknown>> };
  return (data.jobs ?? []).map((j) => ({
    source: "ashby",
    external_id: `ashby-${slug}-${j.id}`,
    title: String(j.title),
    company: String(j.companyName ?? slug),
    location: (j.location as string) ?? null,
    remote: Boolean(j.isRemote),
    salary:
      (j.compensation as Record<string, unknown> | undefined)?.compensationTierSummary
        ? String((j.compensation as Record<string, unknown>).compensationTierSummary)
        : null,
    url: String(j.jobUrl ?? j.applyUrl),
    apply_url: (j.applyUrl as string) ?? null,
    description: (j.descriptionPlain as string) ?? (j.descriptionHtml as string) ?? null,
    posted_at: (j.publishedAt as string) ?? null,
  }));
}

export async function fetchSmartRecruiters(slug: string): Promise<RawJob[]> {
  const data = (await getJSON(
    `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`
  )) as { content?: Array<Record<string, unknown>> };
  return (data.content ?? []).map((j) => {
    const loc = (j.location as Record<string, unknown>) ?? {};
    const city = [loc.city, loc.country].filter(Boolean).join(", ");
    return {
      source: "smartrecruiters",
      external_id: `sr-${slug}-${j.id}`,
      title: String(j.name),
      company: String((j.company as Record<string, unknown>)?.name ?? slug),
      location: city || null,
      remote: Boolean(loc.remote),
      salary: null,
      url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
      apply_url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
      description: null,
      posted_at: (j.releasedDate as string) ?? null,
    };
  });
}

export async function fetchJobicy(keywords: string[]): Promise<RawJob[]> {
  const data = (await getJSON("https://jobicy.com/api/v2/remote-jobs?count=50")) as {
    jobs?: Array<Record<string, unknown>>;
  };
  return (data.jobs ?? [])
    .filter((j) =>
      matchesKeywords(
        `${j.jobTitle} ${(j.jobIndustry as string[])?.join(" ") ?? ""} ${String(j.jobExcerpt ?? "")}`,
        keywords
      )
    )
    .map((j) => ({
      source: "jobicy",
      external_id: `jobicy-${j.id}`,
      title: String(j.jobTitle),
      company: String(j.companyName),
      location: (j.jobGeo as string) || "Remote",
      remote: true,
      salary:
        j.annualSalaryMin && j.annualSalaryMax
          ? `${j.salaryCurrency ?? ""}${j.annualSalaryMin}–${j.annualSalaryMax}`
          : null,
      url: String(j.url),
      apply_url: String(j.url),
      description: (j.jobDescription as string) ?? (j.jobExcerpt as string) ?? null,
      posted_at: (j.pubDate as string) ?? null,
    }));
}

// Himalayas caps each response at 20 regardless of `limit`, so page through it.
export async function fetchHimalayas(keywords: string[], pages = 5): Promise<RawJob[]> {
  const batches = await Promise.allSettled(
    Array.from({ length: pages }, (_, i) =>
      getJSON(`https://himalayas.app/jobs/api?limit=20&offset=${i * 20}`) as Promise<{
        jobs?: Array<Record<string, unknown>>;
      }>
    )
  );
  const rows: Array<Record<string, unknown>> = [];
  for (const b of batches) if (b.status === "fulfilled") rows.push(...(b.value.jobs ?? []));

  return rows
    .filter((j) =>
      matchesKeywords(
        `${j.title} ${(j.categories as string[])?.join(" ") ?? ""} ${String(j.excerpt ?? "").slice(0, 1500)}`,
        keywords
      )
    )
    .map((j) => ({
      source: "himalayas",
      external_id: `himalayas-${j.guid ?? j.slug ?? j.applicationLink}`,
      title: String(j.title),
      company: String(j.companyName ?? "Unknown"),
      location: (j.locationRestrictions as string[])?.join(", ") || "Remote",
      remote: true,
      salary:
        j.minSalary && j.maxSalary ? `$${j.minSalary}–$${j.maxSalary}` : null,
      url: String(j.applicationLink ?? j.url ?? ""),
      apply_url: (j.applicationLink as string) ?? null,
      description: (j.description as string) ?? (j.excerpt as string) ?? null,
      posted_at: j.pubDate ? new Date(Number(j.pubDate) * 1000).toISOString() : null,
    }))
    .filter((j) => j.url);
}

// We Work Remotely publishes RSS only — parse the feed rather than scrape HTML.
export async function fetchWeWorkRemotely(keywords: string[]): Promise<RawJob[]> {
  const res = await fetch("https://weworkremotely.com/remote-jobs.rss", { headers: UA });
  if (!res.ok) throw new Error(`wwr -> ${res.status}`);
  const xml = await res.text();

  const pick = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
  };

  return (xml.match(/<item>[\s\S]*?<\/item>/g) ?? [])
    .map((item) => {
      const title = pick(item, "title");
      const [company, ...rest] = title.split(":");
      return {
        source: "weworkremotely",
        external_id: `wwr-${pick(item, "guid") || pick(item, "link")}`,
        title: (rest.join(":") || title).trim(),
        company: (rest.length ? company : "Unknown").trim(),
        location: pick(item, "region") || "Remote",
        remote: true,
        salary: null,
        url: pick(item, "link"),
        apply_url: pick(item, "link"),
        description: pick(item, "description") || null,
        posted_at: pick(item, "pubDate") || null,
      };
    })
    .filter((j) => j.url && matchesKeywords(`${j.title} ${j.description ?? ""}`, keywords));
}

// Company boards return every opening — sales, legal, warehouse. Scoring all of
// them with an LLM is the expensive mistake, so gate on role/keyword relevance
// before anything reaches the database.
// Roles a candidate at this experience level cannot realistically land. Ingesting
// them cost real money to score and buried the board: 1,566 of 1,621 scored jobs
// came back under 40, almost all "requires 7+ years" or Staff/Principal titles.
const OUT_OF_REACH_TITLE =
  /\b(staff|principal|distinguished|fellow|director|vp|head of|chief|architect)\b/i;

function tooSenior(job: RawJob, yearsExperience: number): boolean {
  if (OUT_OF_REACH_TITLE.test(job.title)) return true;

  // "7+ years", "minimum 8 years" — allow a stretch of 3 over the candidate.
  const demands = [...`${job.title} ${job.description?.slice(0, 2500) ?? ""}`.matchAll(
    /(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?years?/gi
  )].map((m) => Number(m[1]));
  if (demands.length === 0) return false;
  return Math.min(...demands) > yearsExperience + 3;
}

function relevant(
  job: RawJob,
  keywords: string[],
  roles: string[],
  yearsExperience?: number
): boolean {
  if (yearsExperience != null && tooSenior(job, yearsExperience)) return false;

  const terms = [...keywords, ...roles];
  if (terms.length === 0) return true;
  const hay = `${job.title} ${job.description?.slice(0, 1200) ?? ""}`.toLowerCase();

  // The title carries the signal; a description mention alone is too loose for
  // a board dump (every posting lists "collaborate with engineering").
  const title = job.title.toLowerCase();
  if (terms.some((t) => title.includes(t.toLowerCase()))) return true;

  const ENGINEERING =
    /\b(engineer|developer|programmer|software|frontend|front-end|backend|back-end|full.?stack|web dev|sde)\b/;
  if (!ENGINEERING.test(title)) return false;

  // Board dumps hand back every open role at a company, so they still have to
  // earn their place with a keyword. Sources that already searched by role
  // server-side do not: demanding our own phrasing reappear in the title threw
  // away Amazon's entire India board, where the roles are all titled "Software
  // Development Engineer" and the stack only shows up in the body.
  const SEARCHED = new Set(["amazon", "indeed", "linkedin", "web"]);
  return SEARCHED.has(job.source) || terms.some((t) => hay.includes(t.toLowerCase()));
}

/**
 * Amazon runs no ATS we can query and blocks scrapers, but amazon.jobs backs its
 * own search box with a public JSON endpoint. It is the one FAANG board
 * reachable without Firecrawl, and it is India-heavy: 273 open roles under
 * normalized_country_code[]=IND at the time of writing.
 */
export async function fetchAmazonJobs(opts: {
  roles: string[];
  locations: string[];
  remoteOnly: boolean;
}): Promise<RawJob[]> {
  const INDIA =
    /india|bengaluru|bangalore|mumbai|delhi|hyderabad|pune|chennai|gurgaon|noida|jaipur|kolkata|ahmedabad/i;

  // loc_query is ignored by the endpoint; only the country facet actually
  // filters. An empty facet means "anywhere", which is what "Remote" wants.
  const countries = opts.remoteOnly
    ? [""]
    : [
        ...new Set(
          opts.locations.map((l) =>
            INDIA.test(l) ? "IND" : /remote|anywhere/i.test(l) ? "" : "USA"
          )
        ),
      ];

  // base_query matches the posting body, not the title, and Amazon titles
  // everything "Software Development Engineer" — searching for the user's own
  // role names alone returns nothing ("Full Stack Developer" → 0 hits), so
  // Amazon's own vocabulary is appended as a floor.
  const roles = [...opts.roles.slice(0, 2), "software development engineer"];

  const jobs: RawJob[] = [];
  const seen = new Set<string>();

  for (const role of roles) {
    for (const country of countries) {
      const url =
        "https://www.amazon.jobs/en/search.json" +
        `?base_query=${encodeURIComponent(role)}` +
        (country ? `&normalized_country_code%5B%5D=${country}` : "") +
        "&result_limit=100&sort=recent";
      try {
        const data = (await getJSON(url)) as { jobs?: Array<Record<string, unknown>> };
        for (const j of data.jobs ?? []) {
          const id = String(j.id_icims ?? j.id ?? "");
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const where = String(j.normalized_location ?? j.location ?? "");
          jobs.push({
            source: "amazon",
            external_id: `amazon-${id}`,
            title: String(j.title ?? "Open role"),
            company: String(j.company_name ?? "Amazon"),
            location: where || null,
            remote: /remote|virtual/i.test(`${j.title ?? ""} ${where}`),
            salary: null,
            url: `https://www.amazon.jobs${j.job_path ?? `/en/jobs/${id}`}`,
            // Amazon's flow needs an account; never auto-submit.
            apply_url: null,
            description: [j.description_short, j.basic_qualifications]
              .filter(Boolean)
              .join("\n\n")
              .slice(0, 6000) || null,
            posted_at: (j.posted_date as string) ?? null,
          });
        }
      } catch {
        /* one country/role miss should not fail the hunt */
      }
    }
  }
  return jobs;
}

export async function huntAll(opts: {
  keywords: string[];
  roles?: string[];
  yearsExperience?: number;
  ghCompanies: string[];
  leverCompanies: string[];
  ashbyCompanies?: string[];
  smartRecruitersCompanies?: string[];
  webJobs?: RawJob[];
  linkedInOpts?: { roles: string[]; locations: string[]; remoteOnly: boolean };
  searchOpts?: { roles: string[]; locations: string[]; remoteOnly: boolean };
}): Promise<{ fetched: number; inserted: number; errors: string[] }> {
  const errors: string[] = [];
  const batches = await Promise.allSettled([
    fetchRemoteOK(opts.keywords),
    fetchRemotive(opts.keywords),
    fetchArbeitnow(opts.keywords),
    fetchJobicy(opts.keywords),
    fetchHimalayas(opts.keywords),
    fetchWeWorkRemotely(opts.keywords),
    ...opts.ghCompanies.map((s) => fetchGreenhouse(s)),
    ...opts.leverCompanies.map((s) => fetchLever(s)),
    ...(opts.ashbyCompanies ?? []).map((s) => fetchAshby(s)),
    ...(opts.smartRecruitersCompanies ?? []).map((s) => fetchSmartRecruiters(s)),
    Promise.resolve(opts.webJobs ?? []),
    opts.linkedInOpts ? fetchLinkedIn(opts.linkedInOpts) : Promise.resolve([]),
    opts.searchOpts ? fetchAmazonJobs(opts.searchOpts) : Promise.resolve([]),
  ]);

  const all: RawJob[] = [];
  for (const b of batches) {
    if (b.status === "fulfilled") all.push(...b.value);
    else errors.push(String(b.reason).slice(0, 200));
  }
  const jobs = all.filter((j) =>
    relevant(j, opts.keywords, opts.roles ?? [], opts.yearsExperience)
  );

  const insert = db.prepare(`
    INSERT OR IGNORE INTO jobs
      (source, external_id, title, company, location, remote, salary, url, apply_url, description, posted_at)
    VALUES (@source, @external_id, @title, @company, @location, @remote, @salary, @url, @apply_url, @description, @posted_at)
  `);
  let inserted = 0;
  const tx = db.transaction((rows: RawJob[]) => {
    for (const r of rows) {
      const res = insert.run({ ...r, remote: r.remote ? 1 : 0 });
      inserted += res.changes;
    }
  });
  tx(jobs);
  return { fetched: all.length, inserted, errors };
}

/**
 * LinkedIn's logged-out job-search fragment. No auth and no cookie, so no
 * account is exposed — but automated access still breaches LinkedIn's User
 * Agreement and they rate-limit by IP, so it is opt-in via ENABLE_LINKEDIN and
 * fetched sequentially at low volume.
 */
export async function fetchLinkedIn(opts: {
  roles: string[];
  locations: string[];
  remoteOnly: boolean;
}): Promise<RawJob[]> {
  if (process.env.ENABLE_LINKEDIN !== "true") return [];

  const places = opts.remoteOnly
    ? ["Remote"]
    : (opts.locations.length ? opts.locations : ["Remote"]).slice(0, 2);
  const roles = opts.roles.slice(0, 2);

  const jobs: RawJob[] = [];
  const seen = new Set<string>();

  for (const role of roles) {
    for (const place of places) {
      const url =
        "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search" +
        `?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(place)}&start=0`;
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) continue;
        const html = await res.text();

        // Each result is a <li> carrying a /jobs/view/<slug>-<id> link.
        for (const card of html.split("<li>").slice(1)) {
          const link = card.match(/href="(https:\/\/[a-z.]*linkedin\.com\/jobs\/view\/[^"?]+)/i)?.[1];
          const id = link?.match(/\/jobs\/view\/(?:.*-)?(\d+)/)?.[1];
          if (!link || !id || seen.has(id)) continue;

          const strip = (s?: string) =>
            s ? s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() : "";
          const title = strip(card.match(/base-search-card__title"[^>]*>([\s\S]*?)</i)?.[1]);
          const company = strip(card.match(/hidden-nested-link[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
          const location = strip(card.match(/job-search-card__location"[^>]*>([\s\S]*?)</i)?.[1]);
          if (!title) continue;

          seen.add(id);
          jobs.push({
            source: "linkedin",
            external_id: `linkedin-${id}`,
            title,
            company: company || "Unknown",
            location: location || place,
            remote: /remote/i.test(`${title} ${location} ${place}`),
            salary: null,
            url: link,
            apply_url: null, // Applying needs a session; never automate it.
            description: null,
            posted_at: null,
          });
        }
      } catch {
        /* skip this query */
      }
    }
  }
  return jobs;
}
