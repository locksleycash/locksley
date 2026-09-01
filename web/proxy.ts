import { NextResponse, type NextRequest } from "next/server";
import { APEX_HOSTS } from "./src/site.ts";

/** The apex serves the landing; every other host (app., vercel.app, localhost)
 *  gets the dashboard. Naming the marketing hosts means a new host defaults to
 *  the thing people are actually trying to use. Only the root is swapped. */
const LANDING = new Set(APEX_HOSTS);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0].toLowerCase() ?? "";
  if (LANDING.has(host) && request.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL("/home", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg)$).*)"] };