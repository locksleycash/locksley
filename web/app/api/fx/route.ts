// USD → display-currency rate, proxied server-side.
//
// Same reason HoodBank proxies it: called straight from the browser, something
// on the client — an ad-blocker, an extension, a CSP — eats the request often
// enough to matter. A same-origin endpoint is immune, and these are ECB daily
// fixes, so an hour of caching costs nothing.

export const runtime = "nodejs";

const ALLOWED = new Set(["IDR", "JPY", "EUR", "GBP", "SGD"]);

export async function GET(req: Request) {
  const to = new URL(req.url).searchParams.get("to") ?? "";
  if (!ALLOWED.has(to)) {
    return Response.json({ error: "Unsupported currency" }, { status: 400 });
  }
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${to}`, {
      next: { revalidate: 3600 },
    });
    const j = (await r.json()) as { rates?: Record<string, number> };
    const rate = j?.rates?.[to];
    if (!rate) throw new Error("no rate in response");
    return Response.json({ rate });
  } catch {
    return Response.json({ error: "Rate source unavailable" }, { status: 502 });
  }
}
