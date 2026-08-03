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

function matchesKeywords(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const t = text.toLowerCase();
  return keywords.some((k) => t.includes(k.toLowerCase()));
}

export async function fetchRemoteOK(keywords: string[]): Promise<RawJob[]> {
  const data = (await getJSON("https://remoteok.com/api")) as Array<Record<string, unknown>>;
  return data
    .filter((j) => j.id && j.position)
    .filter((j) => matchesKeywords(`${j.position} ${(j.tags as string[])?.join(" ") ?? ""}`, keywords))
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
    .filter((j) => matchesKeywords(`${j.title} ${j.tags} ${j.category}`, keywords))
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
    .filter((j) => matchesKeywords(`${j.title} ${(j.tags as string[])?.join(" ") ?? ""}`, keywords))
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

export async function huntAll(opts: {
  keywords: string[];
  ghCompanies: string[];
  leverCompanies: string[];
}): Promise<{ fetched: number; inserted: number; errors: string[] }> {
  const errors: string[] = [];
  const batches = await Promise.allSettled([
    fetchRemoteOK(opts.keywords),
    fetchRemotive(opts.keywords),
    fetchArbeitnow(opts.keywords),
    ...opts.ghCompanies.map((s) => fetchGreenhouse(s)),
    ...opts.leverCompanies.map((s) => fetchLever(s)),
  ]);

  const jobs: RawJob[] = [];
  for (const b of batches) {
    if (b.status === "fulfilled") jobs.push(...b.value);
    else errors.push(String(b.reason).slice(0, 200));
  }

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
  return { fetched: jobs.length, inserted, errors };
}
