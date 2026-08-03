import Database from "better-sqlite3";
import path from "path";
import { DATA_DIR, ensureDataDirs } from "./paths";

ensureDataDirs();

const db = new Database(path.join(DATA_DIR, "agent.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  resume_text TEXT,
  resume_json TEXT,
  prefs_json TEXT,
  resume_path TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  remote INTEGER DEFAULT 0,
  salary TEXT,
  url TEXT,
  apply_url TEXT,
  description TEXT,
  posted_at TEXT,
  fetched_at TEXT DEFAULT (datetime('now')),
  score INTEGER,
  score_reason TEXT,
  status TEXT DEFAULT 'new'
);

CREATE TABLE IF NOT EXISTS apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  cover_letter TEXT,
  answers_json TEXT,
  status TEXT DEFAULT 'draft',
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  applied_at TEXT
);

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,               -- 'outreach' | 'bizdev'
  job_id INTEGER REFERENCES jobs(id),
  lead_id INTEGER,
  to_email TEXT NOT NULL,
  to_name TEXT,
  company TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'draft',      -- draft | approved | sent | failed
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id TEXT UNIQUE,
  name TEXT NOT NULL,
  region TEXT,
  category TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  rating REAL,
  notes TEXT,
  status TEXT DEFAULT 'new',        -- new | pitched | replied | won | dead
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

export default db;

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export type Prefs = {
  roles: string[];
  keywords: string[];
  minSalary?: number;
  currency?: string;
  locations: string[];       // e.g. ["Remote", "Bengaluru", "Mumbai"]
  remoteOnly: boolean;
  ghCompanies: string[];     // greenhouse board slugs
  leverCompanies: string[];  // lever slugs
};

export function getProfile() {
  const row = db.prepare("SELECT * FROM profile WHERE id = 1").get() as
    | {
        resume_text: string | null;
        resume_json: string | null;
        prefs_json: string | null;
        resume_path: string | null;
      }
    | undefined;
  return {
    resumeText: row?.resume_text ?? null,
    resume: row?.resume_json ? JSON.parse(row.resume_json) : null,
    prefs: row?.prefs_json ? (JSON.parse(row.prefs_json) as Prefs) : null,
    resumePath: row?.resume_path ?? null,
  };
}

export function sentToday(): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n FROM emails WHERE status = 'sent' AND date(sent_at) = date('now')"
    )
    .get() as { n: number };
  return row.n;
}
