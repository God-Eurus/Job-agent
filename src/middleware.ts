import { NextRequest, NextResponse } from "next/server";

// Single-user basic auth. Set DASHBOARD_PASSWORD in production; skipped when unset (local dev).
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  // Local access needs no password. Public requests arrive via the Cloudflare
  // tunnel, which always injects cf-connecting-ip; direct localhost requests never have it.
  if (!req.headers.get("cf-connecting-ip")) return NextResponse.next();

  // Gmail OAuth callback must stay reachable by Google's redirect
  if (req.nextUrl.pathname === "/api/gmail/callback") return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const [user, pass] = Buffer.from(header.slice(6), "base64").toString().split(":");
    if (user === "admin" && pass === password) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="job-agent"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
