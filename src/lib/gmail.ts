import { google } from "googleapis";
import { getSetting, setSetting, sentToday } from "./db";

const REDIRECT = "http://localhost:3040/api/gmail/callback";

export function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT
  );
}

export function authUrl(): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.send"],
  });
}

export async function saveTokensFromCode(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  setSetting("gmail_tokens", JSON.stringify(tokens));
}

export function gmailReady(): boolean {
  return Boolean(getSetting("gmail_tokens"));
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  body: string;
  fromName?: string;
}): Promise<string> {
  const cap = Number(process.env.DAILY_EMAIL_CAP ?? 40);
  if (sentToday() >= cap) {
    throw new Error(`Daily email cap (${cap}) reached — try again tomorrow`);
  }
  const tokens = getSetting("gmail_tokens");
  if (!tokens) throw new Error("Gmail not connected. Visit /api/gmail/auth first.");

  const client = oauthClient();
  client.setCredentials(JSON.parse(tokens));
  const gmail = google.gmail({ version: "v1", auth: client });

  const raw = Buffer.from(
    [
      `To: ${opts.to}`,
      `Subject: ${opts.subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      opts.body,
    ].join("\r\n")
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
  return res.data.id ?? "sent";
}
