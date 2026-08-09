import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const dynamic = "force-dynamic";

// Full record incl. description — the list endpoint deliberately omits it so the
// table payload stays small.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(Number(id));
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const app = db
    .prepare("SELECT id, status, cover_letter FROM apps WHERE job_id = ? ORDER BY id DESC LIMIT 1")
    .get(Number(id));

  return NextResponse.json({ job, app: app ?? null });
}
