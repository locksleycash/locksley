// Price history for one stock, rebuilt from its pool's own Swap events.
//
// Source selection and its failure modes live in src/swaplogs.ts. What matters
// here: an empty chart and an unreadable one are reported differently. The
// first version conflated them, so a rate-limited explorer showed up as
// "no trades in the last hour" for every stock at once.

import { server } from "../../../src/chain.ts";
import { poolFor } from "../../../src/pools.ts";
import { priceFromSqrt } from "../../../src/prices.ts";
import { bySymbol } from "../../../src/stocks.ts";
import { readSwaps } from "../../../src/swaplogs.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Robinhood Chain produces a block every 100ms, so an hour is 36,000. */
const BLOCKS_PER_HOUR = 36_000;

/**
 * Windows are in days, not hours. Most of these markets trade a handful of
 * times a day — an hourly view was empty for nearly every stock, which read as
 * the app being broken rather than the market being quiet.
 */
export const RANGES = { "1D": 24, "7D": 168, "30D": 720 } as const;
export type RangeKey = keyof typeof RANGES;

/** A 560px chart cannot show a thousand points; more is only slower. */
const MAX_POINTS = 240;
/** Long, because the slow fallback costs seconds and this is settled history. */
const TTL_MS = 10 * 60_000;

export interface Point {
  t: number;
  price: number;
}

const cache = new Map<string, { at: number; body: unknown }>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol")?.trim().toUpperCase() ?? "";
  const rangeKey = (url.searchParams.get("range") ?? "7D") as RangeKey;
  const hours = RANGES[rangeKey] ?? RANGES["7D"];

  const stock = bySymbol.get(symbol);
  const pool = poolFor.get(symbol);
  if (!stock || !pool) {
    return Response.json({ error: `No market for ${symbol || "that stock"}` }, { status: 404 });
  }

  const key = `${symbol}:${hours}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return Response.json(hit.body, { headers: { "cache-control": "no-store" } });
  }

  let read;
  try {
    const head = Number(await server().getBlockNumber());
    read = await readSwaps({
      pool: pool.pool,
      fromBlock: Math.max(0, head - hours * BLOCKS_PER_HOUR),
      toBlock: head,
      rpcUrl: process.env.EVM_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com",
    });
  } catch (e) {
    // A chart we already drew is better than an error screen: the trades in it
    // still happened. Only admit defeat when there is nothing to fall back on.
    const stale = cache.get(key);
    if (stale) {
      return Response.json(
        { ...(stale.body as object), stale: true, ageMs: Date.now() - stale.at },
        { headers: { "cache-control": "no-store" } }
      );
    }
    // Say we could not look. Claiming "no trades" here is a lie that makes a
    // working market look dead.
    return Response.json(
      {
        error: "Couldn't read the trade history right now — the explorer is rate-limiting us.",
        detail: (e as Error).message,
        points: [],
        range: rangeKey,
        trades: 0,
        symbol,
      },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }

  let all: Point[] = [];
  for (const s of read.swaps) {
    const price = priceFromSqrt(s.sqrt, stock.address);
    if (Number.isFinite(price) && price > 0) all.push({ t: s.t, price });
  }
  all.sort((a, b) => a.t - b.t);

  // "recent" hands back the newest trades regardless of the window asked for.
  // When those trades happen to cover the window anyway, trim to it — that IS
  // the windowed answer, and it keeps the range picker meaningful on sources
  // that can't filter by block. Only a tape too short to trim stays unwindowed.
  let windowed = read.mode === "range";
  if (!windowed) {
    const inWindow = all.filter((p) => p.t >= Date.now() - hours * 3_600_000);
    // Only claim the window when trimming actually dropped older trades: that
    // proves the tape reaches past the window's start, so nothing is missing.
    // An untrimmed tape may be truncated by the source — keep the label honest.
    if (inWindow.length >= 2 && inWindow.length < all.length) { all = inWindow; windowed = true; }
  }

  // Thin evenly, but always keep the last point: that one is the current
  // price, and dropping it would make the chart disagree with the board.
  let points = all;
  if (all.length > MAX_POINTS) {
    const step = all.length / MAX_POINTS;
    points = Array.from({ length: MAX_POINTS }, (_, i) => all[Math.floor(i * step)]);
    points[points.length - 1] = all[all.length - 1];
  }

  const body = {
    points,
    range: rangeKey,
    trades: all.length,
    symbol,
    // False only when the source ignored the window AND the tape was too
    // short to trim to it; the label has to say so.
    windowed,
    source: read.source,
  };
  if (points.length) cache.set(key, { at: Date.now(), body });

  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
