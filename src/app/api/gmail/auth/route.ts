import { NextResponse } from "next/server";
import { authUrl } from "@/lib/gmail";

export async function GET() {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.json(
      { error: "Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.local first" },
      { status: 400 }
    );
  }
  return NextResponse.redirect(authUrl());
}
