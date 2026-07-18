import { NextRequest, NextResponse } from "next/server";
import db, { getProfile } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getProfile());
}

// Save preferences (the "interview": salary, location/WFH, roles, target boards)
export async function POST(req: NextRequest) {
  const prefs = await req.json();
  db.prepare(
    `INSERT INTO profile (id, prefs_json, updated_at) VALUES (1, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET prefs_json = excluded.prefs_json, updated_at = excluded.updated_at`
  ).run(JSON.stringify(prefs));
  return NextResponse.json({ ok: true });
}
