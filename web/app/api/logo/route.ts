// Streams a company logo through our own origin.
//
// Proxied rather than hot-linked so the browser makes one same-origin request
// it can cache, and so a source that dies can be swapped here instead of in
// every component.
//
// Only tickers in the catalog are served: an open image relay is an open
// redirect with extra steps.

import { STOCKS, bySymbol } from "../../../src/stocks.ts";
import { LOGO_SOURCES } from "../../../src/logos.ts";

export const runtime = "nodejs";

const BY_ADDRESS = new Map(STOCKS.map((s) => [s.address.toLowerCase(), s.symbol]));
const DAY = 60 * 60 * 24;

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const fromAddr = BY_ADDRESS.get((p.get("address") ?? "").toLowerCase());
  const asked = p.get("symbol")?.toUpperCase() ?? "";
  const symbol = fromAddr ?? (bySymbol.has(asked) ? asked : null);

  if (!symbol) return new Response("Unknown token", { status: 404 });

  for (const source of LOGO_SOURCES) {
    try {
      // Short timeout per source: two slow misses must not add up to a request
      // the browser gives up on.
      const upstream = await fetch(source(symbol), {
        cache: "no-store",
        signal: AbortSignal.timeout(3500),
      });
      if (!upstream.ok || !upstream.body) continue;

      const type = upstream.headers.get("content-type") ?? "";
      if (!type.startsWith("image/")) continue;

      return new Response(upstream.body, {
        headers: {
          "content-type": type,
          // Logos change about never; let the browser and the edge keep them.
          "cache-control": `public, max-age=${DAY}, s-maxage=${DAY * 30}, immutable`,
        },
      });
    } catch {
      // Try the next source rather than failing on the first slow one.
    }
  }

  return new Response("No logo", { status: 404 });
}
