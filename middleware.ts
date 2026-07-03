import { NextRequest, NextResponse } from "next/server";

// petezha.xyz is the canonical domain; every other attached hostname
// permanent-redirects to it, preserving path and query.
const CANONICAL = "petezha.xyz";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (host !== CANONICAL && !host.endsWith(".workers.dev")) {
    return NextResponse.redirect(
      new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${CANONICAL}`),
      308
    );
  }
  return NextResponse.next();
}
