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
function relevant(job: RawJob, keywords: string[], roles: string[]): boolean {
  const terms = [...keywords, ...roles];
  if (terms.length === 0) return true;
  const hay = `${job.title} ${job.description?.slice(0, 1200) ?? ""}`.toLowerCase();

  // The title carries the signal; a description mention alone is too loose for
  // a board dump (every posting lists "collaborate with engineering").
  const title = job.title.toLowerCase();
  if (terms.some((t) => title.includes(t.toLowerCase()))) return true;

  const ENGINEERING =
    /\b(engineer|developer|programmer|software|frontend|front-end|backend|back-end|full.?stack|web dev|sde)\b/;
  return ENGINEERING.test(title) && terms.some((t) => hay.includes(t.toLowerCase()));
}

export async function huntAll(opts: {
  keywords: string[];
  roles?: string[];
  ghCompanies: string[];
  leverCompanies: string[];
  ashbyCompanies?: string[];
  smartRecruitersCompanies?: string[];
  webJobs?: RawJob[];
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
  ]);

  const all: RawJob[] = [];
  for (const b of batches) {
    if (b.status === "fulfilled") all.push(...b.value);
    else errors.push(String(b.reason).slice(0, 200));
  }
  const jobs = all.filter((j) => relevant(j, opts.keywords, opts.roles ?? []));

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
