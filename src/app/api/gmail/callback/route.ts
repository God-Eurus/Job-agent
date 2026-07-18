import { NextRequest, NextResponse } from "next/server";
import { saveTokensFromCode } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });
  await saveTokensFromCode(code);
  return NextResponse.redirect(new URL("/?gmail=connected", req.url));
}
