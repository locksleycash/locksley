import { NextResponse, type NextRequest } from "next/server";

/** Hosts that serve the dashboard at their root. Everything else - the apex,
 *  vercel.app, localhost - gets the landing at / and the app at /app. Only the
 *  root path is rewritten, so /docs and /api behave the same on every host. */
const APP_HOSTS = new Set(
  (process.env.NEXT_PUBLIC_APP_HOSTS ?? "bank.locksley.cash")
    .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean),
);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0].toLowerCase() ?? "";
  if (APP_HOSTS.has(host) && request.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL("/app", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/"] };
