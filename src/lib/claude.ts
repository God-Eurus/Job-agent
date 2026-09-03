import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const client = new Anthropic();
// Scoring runs on every hunt (25 jobs/run) — cheap model by default.
// Drafting is low-volume outbound text — capable model by default.
const SCORE_MODEL = process.env.SCORE_MODEL ?? "claude-haiku-4-5";
const DRAFT_MODEL = process.env.DRAFT_MODEL ?? "claude-opus-4-8";

export const ResumeSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  headline: z.string(),
  years_experience: z.number(),
  skills: z.array(z.string()),
  roles: z.array(z.string()).describe("Job titles this person should target"),
  summary: z.string().describe("3-sentence professional summary"),
  links: z.array(z.string()).describe("Portfolio/GitHub/LinkedIn URLs found"),
});
export type Resume = z.infer<typeof ResumeSchema>;

export async function parseResume(pdfBase64: string): Promise<Resume> {
  const res = await client.messages.parse({
    model: DRAFT_MODEL,
    max_tokens: 4096,
    output_config: { format: zodOutputFormat(ResumeSchema) },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          {
            type: "text",
            text: "Extract this resume into the structured format. Infer target roles from experience.",
          },
        ],
      },
    ],
  });
  if (!res.parsed_output) throw new Error("Resume parse failed");
  return res.parsed_output as Resume;
}

const ScoreSchema = z.object({
  score: z.number().describe("0-100 fit score"),
  reason: z.string().describe("One sentence: why this score"),
});
type Score = z.infer<typeof ScoreSchema>;

export async function scoreJob(
  resume: Resume,
  prefs: { roles: string[]; minSalary?: number; locations: string[]; remoteOnly: boolean },
  job: { title: string; company: string; location: string | null; salary: string | null; description: string | null }
) {
  const res = await client.messages.parse({
    model: SCORE_MODEL,
    max_tokens: 1024,
    output_config: { format: zodOutputFormat(ScoreSchema) },
    messages: [
      {
        role: "user",
        content: `Score this job 0-100 for fit against the candidate. Score below 40 if role mismatch, below 30 if location/remote requirements conflict, below 30 if stated salary is clearly under the minimum.

CANDIDATE: ${resume.headline}, ${resume.years_experience}y exp. Skills: ${resume.skills.join(", ")}. Target roles: ${prefs.roles.join(", ")}. Min salary: ${prefs.minSalary ?? "unspecified"}. Locations OK: ${prefs.locations.join(", ")}${prefs.remoteOnly ? " (REMOTE ONLY)" : ""}.

JOB: ${job.title} @ ${job.company}. Location: ${job.location ?? "?"}. Salary: ${job.salary ?? "?"}.
${(job.description ?? "").slice(0, 4000)}`,
      },
    ],
  });
  if (!res.parsed_output) throw new Error("Score failed");
  return res.parsed_output as Score;
}

// Firecrawl returns whole pages, and most job pages on the open web are not on
// an ATS whose URL encodes the company. Rather than discard them (the old
// behaviour dropped 100% of real results — Amazon, Apple, Naukri, LinkedIn and
// every company careers site), read the page and pull the postings out of it.
// One page is one cheap model call, so this runs on the scoring model.
const ExtractedJobsSchema = z.object({
  jobs: z
    .array(
      z.object({
        title: z.string().describe("Exact job title as written on the page"),
        company: z
          .string()
          .describe("Employer doing the hiring — never the job board or aggregator name"),
        location: z
          .string()
          .describe("City/state/country as written, or 'Remote'. Empty string if unstated."),
        remote: z.boolean().describe("True only if the posting says remote/work-from-home"),
        salary: z.string().describe("Compensation as written, e.g. '₹8-12 LPA'. Empty if unstated."),
        url: z
          .string()
          .describe(
            "Absolute URL of this specific posting, copied verbatim from the page. " +
              "Empty string when the page itself is the posting."
          ),
        summary: z.string().describe("Up to 400 characters of the role's requirements/duties"),
      })
    )
    .describe("Every distinct job posting on this page; empty array if it has none"),
});

export type ExtractedJob = z.infer<typeof ExtractedJobsSchema>["jobs"][number];

export async function extractJobsFromPage(
  pageUrl: string,
  markdown: string
): Promise<ExtractedJob[]> {
  const res = await client.messages.parse({
    model: SCORE_MODEL,
    max_tokens: 8192,
    output_config: { format: zodOutputFormat(ExtractedJobsSchema) },
    system:
      "You extract job postings from a scraped web page. " +
      "A page is either ONE posting (return a single entry with an empty url) or a " +
      "search/listing page (return one entry per posting, each with its own url copied " +
      "exactly from the page). " +
      "Return an empty array for pages that advertise no specific role: category and " +
      "landing pages, office/location marketing pages, blog posts, login walls, and " +
      "'similar jobs'/'people also viewed' sidebars. " +
      "Never invent a URL, a company, or a salary — leave the field empty instead.",
    messages: [
      {
        role: "user",
        content: `Page URL: ${pageUrl}

---
${markdown.slice(0, 14000)}`,
      },
    ],
  });
  return (res.parsed_output as { jobs: ExtractedJob[] } | null)?.jobs ?? [];
}

export async function draftCoverLetter(
  resume: Resume,
  job: { title: string; company: string; description: string | null }
): Promise<string> {
  const res = await client.messages.create({
    model: DRAFT_MODEL,
    max_tokens: 2048,
    system:
      "You write short, specific cover letters. 150-200 words. No fluff, no 'I am writing to express'. Open with a concrete hook tying the candidate's strongest relevant work to the company's need. Plain text only.",
    messages: [
      {
        role: "user",
        content: `Candidate: ${resume.summary}\nSkills: ${resume.skills.join(", ")}\nLinks: ${resume.links.join(", ")}\n\nJob: ${job.title} at ${job.company}\n${(job.description ?? "").slice(0, 4000)}`,
      },
    ],
  });
  const block = res.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text : "";
}

// Rewrite an existing draft against a free-text instruction ("make it shorter",
// "lead with the Shopify work") so the user can iterate without starting over.
export async function refineDraft(
  current: string,
  instruction: string,
  context: string
): Promise<string> {
  const res = await client.messages.create({
    model: DRAFT_MODEL,
    max_tokens: 2048,
    system:
      "You revise job-application and outreach copy. Apply the user's instruction to their draft and return ONLY the revised text — no preamble, no explanation, no markdown fences. Keep any factual claims already present; never invent new ones.",
    messages: [
      {
        role: "user",
        content: `Context: ${context}\n\nCurrent draft:\n"""\n${current}\n"""\n\nInstruction: ${instruction}`,
      },
    ],
  });
  const block = res.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text.trim() : current;
}

const EmailSchema = z.object({
  subject: z.string().describe("Under 60 chars, specific, no clickbait"),
  body: z.string().describe("Plain-text email body"),
});
type EmailDraft = z.infer<typeof EmailSchema>;

export async function draftOutreachEmail(
  resume: Resume,
  job: { title: string; company: string },
  contact: { name: string | null; title: string | null }
) {
  const res = await client.messages.parse({
    model: DRAFT_MODEL,
    max_tokens: 1024,
    output_config: { format: zodOutputFormat(EmailSchema) },
    system:
      "You write cold emails to hiring managers. Under 120 words. Personalized, direct, zero flattery-filler. Structure: 1) why I'm emailing you specifically, 2) one concrete proof of relevant ability, 3) soft ask (15-min chat or 'happy to share more'). Sign with the candidate's name. Never fabricate facts about the recipient or company.",
    messages: [
      {
        role: "user",
        content: `Candidate: ${resume.name}, ${resume.headline}. ${resume.summary} Links: ${resume.links.join(", ")}\n\nRecipient: ${contact.name ?? "Hiring manager"}${contact.title ? `, ${contact.title}` : ""} at ${job.company}.\nContext: they have an open ${job.title} role I'm applying to.`,
      },
    ],
  });
  if (!res.parsed_output) throw new Error("Email draft failed");
  return res.parsed_output as EmailDraft;
}

// WhatsApp is a different register from email: shorter, no subject line, and
// it lands in a personal inbox — so it has to earn the interruption fast.
export async function draftWhatsAppPitch(
  resume: Resume,
  lead: { name: string; category: string | null; region: string | null; website: string | null }
): Promise<string> {
  const res = await client.messages.create({
    model: DRAFT_MODEL,
    max_tokens: 600,
    system:
      "You write short WhatsApp messages introducing a freelance web developer to a local business owner. Under 60 words, plain language, no jargon, no emoji spam (at most one). Structure: who you are in half a sentence, one specific observation about their web presence, what you could build, and a low-friction question. Never invent facts about the business. End with: 'Reply STOP and I won't message again.' Return only the message text.",
    messages: [
      {
        role: "user",
        content: `Sender: ${resume.name}, freelance website & e-commerce store builder. Portfolio: ${resume.links.join(", ")}\n\nBusiness: ${lead.name} (${lead.category ?? "local business"}) in ${lead.region ?? "their area"}. Website: ${lead.website ?? "NONE — no website found"}.`,
      },
    ],
  });
  const block = res.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text.trim() : "";
}

export async function draftBizdevPitch(
  resume: Resume,
  lead: { name: string; category: string | null; region: string | null; website: string | null }
) {
  const res = await client.messages.parse({
    model: DRAFT_MODEL,
    max_tokens: 1024,
    output_config: { format: zodOutputFormat(EmailSchema) },
    system:
      "You write cold emails selling freelance web development (websites, e-commerce stores) to small businesses. Under 110 words. Plain language a non-technical owner understands. Structure: 1) one specific observation about their business/web presence, 2) what I build and one outcome it drives (more calls, online orders), 3) low-friction ask (free 10-min look, no obligation). No jargon, no hard sell, no fake urgency. Sign with the sender's name. Include one line at the end: 'If this isn't relevant, reply STOP and I won't email again.'",
    messages: [
      {
        role: "user",
        content: `Sender: ${resume.name}, freelance website & e-commerce store builder. ${resume.summary} Portfolio: ${resume.links.join(", ")}\n\nBusiness: ${lead.name} (${lead.category ?? "local business"}) in ${lead.region ?? "their area"}. Website: ${lead.website ?? "NONE — they have no website"}.`,
      },
    ],
  });
  if (!res.parsed_output) throw new Error("Pitch draft failed");
  return res.parsed_output as EmailDraft;
}
