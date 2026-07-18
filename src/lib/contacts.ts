// Hiring-manager email lookup: Apollo primary, Hunter fallback.
export type Contact = {
  name: string | null;
  title: string | null;
  email: string;
  source: "apollo" | "hunter";
};

const HIRING_TITLES = [
  "recruiter",
  "talent acquisition",
  "head of talent",
  "hiring manager",
  "engineering manager",
  "head of engineering",
  "cto",
  "founder",
];

function companyToDomain(company: string, website?: string | null): string | null {
  if (website) {
    try {
      return new URL(website).hostname.replace(/^www\./, "");
    } catch {
      /* fall through */
    }
  }
  // crude guess — apollo also accepts org names, hunter needs a domain
  return null;
}

export async function findViaApollo(company: string, domain: string | null): Promise<Contact | null> {
  const key = process.env.APOLLO_API_KEY;
  if (!key) return null;

  const res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify({
      q_organization_name: domain ? undefined : company,
      q_organization_domains_list: domain ? [domain] : undefined,
      person_titles: HIRING_TITLES,
      per_page: 5,
    }),
  });
  if (!res.ok) throw new Error(`Apollo search ${res.status}`);
  const data = (await res.json()) as { people?: Array<Record<string, unknown>> };
  const person = data.people?.[0];
  if (!person) return null;

  // Reveal email (consumes an Apollo credit)
  const match = await fetch("https://api.apollo.io/api/v1/people/match", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify({ id: person.id, reveal_personal_emails: false }),
  });
  if (!match.ok) return null;
  const md = (await match.json()) as { person?: Record<string, unknown> };
  const email = md.person?.email as string | undefined;
  if (!email || email.includes("email_not_unlocked")) return null;

  return {
    name: (person.name as string) ?? null,
    title: (person.title as string) ?? null,
    email,
    source: "apollo",
  };
}

export async function findViaHunter(domain: string): Promise<Contact | null> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return null;
  const res = await fetch(
    `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&department=hr,management&limit=5&api_key=${key}`
  );
  if (!res.ok) throw new Error(`Hunter ${res.status}`);
  const data = (await res.json()) as {
    data?: { emails?: Array<{ value: string; first_name?: string; last_name?: string; position?: string }> };
  };
  const e = data.data?.emails?.[0];
  if (!e) return null;
  return {
    name: [e.first_name, e.last_name].filter(Boolean).join(" ") || null,
    title: e.position ?? null,
    email: e.value,
    source: "hunter",
  };
}

export async function findHiringContact(
  company: string,
  website?: string | null
): Promise<Contact | null> {
  const domain = companyToDomain(company, website);
  try {
    const apollo = await findViaApollo(company, domain);
    if (apollo) return apollo;
  } catch {
    /* try hunter */
  }
  if (domain) {
    try {
      return await findViaHunter(domain);
    } catch {
      /* none */
    }
  }
  return null;
}
