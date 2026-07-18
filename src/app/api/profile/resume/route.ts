import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import db from "@/lib/db";
import { parseResume } from "@/lib/claude";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("resume") as File | null;
  if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Upload a PDF resume" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const savePath = path.join(process.cwd(), "data", "resume", "resume.pdf");
  fs.writeFileSync(savePath, buf);

  try {
    const resume = await parseResume(buf.toString("base64"));
    db.prepare(
      `INSERT INTO profile (id, resume_json, resume_path, updated_at) VALUES (1, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET resume_json = excluded.resume_json, resume_path = excluded.resume_path, updated_at = excluded.updated_at`
    ).run(JSON.stringify(resume), savePath);
    return NextResponse.json({ ok: true, resume });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
