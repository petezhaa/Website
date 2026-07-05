import { NextRequest, NextResponse } from "next/server";

// petezha.xyz is the canonical domain; every other attached hostname
// permanent-redirects to it, preserving path and query.
const CANONICAL = "petezha.xyz";

export function middleware(req: NextRequest) {
  // never force the canonical host during local development — otherwise
  // localhost 308-redirects straight to production and you can't test.
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const host = req.headers.get("host") ?? "";
  if (host !== CANONICAL && !host.endsWith(".workers.dev")) {
    return NextResponse.redirect(
      new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${CANONICAL}`),
      308
    );
  }
  return NextResponse.next();
}
