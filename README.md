# Job Agent

Personal job-hunt + outreach copilot. Reads your resume, learns your salary/location preferences, finds fresh jobs from safe public APIs, drafts tailored applications and cold emails, and — only after your approval — auto-applies and sends.

## Pipeline

1. **Profile** — upload resume PDF (Claude parses it), set salary / location / WFH / target roles.
2. **Hunt** — pulls latest jobs from RemoteOK, Remotive, Arbeitnow + any Greenhouse/Lever company boards you watch. Claude scores each 0–100 against your profile.
3. **Prep** — for a matched job: Claude drafts a cover letter, Apollo/Hunter finds the hiring manager's email, Claude drafts a personalized cold email. Both land in the Approval Queue.
4. **Approve** — you review/edit, then one click: Playwright auto-fills the application form; Gmail sends the email. Daily send cap enforced.
5. **Freelance leads** — Google Places finds businesses in a region with weak/no websites; Claude drafts a website/e-com pitch into the same queue.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env.local   # fill in keys
npm run dev                  # http://localhost:3040
```

### Keys

| Key | Needed for | Where |
|---|---|---|
| `ANTHROPIC_API_KEY` | everything (parse/score/draft) | console.anthropic.com |
| `GOOGLE_CLIENT_ID/SECRET` | sending email | Google Cloud Console → OAuth client (Web), redirect `http://localhost:3040/api/gmail/callback`, enable Gmail API |
| `APOLLO_API_KEY` | hiring-manager lookup | apollo.io → Settings → Integrations → API |
| `HUNTER_API_KEY` | email lookup fallback | hunter.io/api-keys |
| `GOOGLE_PLACES_API_KEY` | freelance lead search | Google Cloud Console → enable Places API (New) |

## Design constraints (on purpose)

- **No LinkedIn/Indeed bot automation** — account-ban risk. Sources are public APIs + hosted Greenhouse/Lever forms.
- **Approval queue** — nothing is ever sent or submitted without your explicit click.
- **Daily email cap** (`DAILY_EMAIL_CAP`, default 40) — protects your Gmail sender reputation.
- **Bizdev emails include an opt-out line** — reply STOP handling is yours to honor.
- Auto-apply handles standard Greenhouse/Lever forms; custom required questions get flagged for manual finish instead of guessing.
