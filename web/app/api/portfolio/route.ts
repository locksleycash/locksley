// Portfolio value over time.
//
// Built by taking today's holdings and walking the transfer log backwards to
// recover what the wallet held at each earlier moment, then valuing every point
// at *today's* prices.
//
// That last part is a deliberate limitation, not an oversight. Valuing each
// past moment at its own price would need a price history for all 52 pools at
// every sample — dozens of rate-limited explorer calls per chart. So the line
// shows how the position was built, not how the market moved, and the UI says
// exactly that rather than letting it be mistaken for a performance curve.

import { erc20Abi, server, slot0Abi } from "../../../src/chain.ts";
import { POOLS } from "../../../src/pools.ts";
import { priceFromSqrt, shares, usdg } from "../../../src/prices.ts";
import { STOCKS, STOCK_DECIMALS, USDG, USDG_DECIMALS, bySymbol } from "../../../src/stocks.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLOCKSCOUT = "https://robinhoodchain.blockscout.com/api/v2";
export const RANGES = { "1D": 1, "1W": 7, "1M": 30 } as const;
export type RangeKey = keyof typeof RANGES;

const POINTS = 40;
const TTL_MS = 60_000;

export interface PVPoint {
  t: number;
  value: number;
}

const cache = new Map<string, { at: number; body: unknown }>();
const KNOWN = new Map(STOCKS.map((s) => [s.address.toLowerCase(), s]));

/**
 * Transfers, newest first, paged until they reach back past `from`.
 *
 * Paging by window rather than by a fixed count: a quiet wallet needs one page
 * for a month, a market maker needs six for ten minutes. A fixed number is
 * either wasteful for the first or a lie for the second.
 *
 * `covered` says the log reaches the start of the window — the difference
 * between "the line really is flat back there" and "we stopped reading".
 *
 * The page cap is a latency ceiling, not a data limit. Each page costs the
 * explorer several seconds, and a market maker doing fifty transfers a minute
 * would page forever; better to stop, say `covered: false`, and let the chart
 * start where the data does than to make everyone wait a minute.
 */
async function fetchTransfers(address: string, from: number, maxPages = 3) {
  const transfers: Transfer[] = [];
  let next: Record<string, string> | null = null;
  let covered = false;

  for (let i = 0; i < maxPages; i++) {
    const qs = new URLSearchParams({ type: "ERC-20", ...(next ?? {}) });
    const r = await fetch(`${BLOCKSCOUT}/addresses/${address}/token-transfers?${qs}`, { cache: "no-store" });
    if (!r.ok) break;
    const j = (await r.json()) as { items?: Transfer[]; next_page_params?: Record<string, string> | null };
    const items = j.items ?? [];
    transfers.push(...items);

    // Reached back past the window, or ran out of history — either way there
    // is nothing older worth asking for.
    const oldest = items.length ? Date.parse(items[items.length - 1].timestamp ?? "") : NaN;
    next = j.next_page_params ?? null;
    if (!next || (Number.isFinite(oldest) && oldest <= from)) {
      covered = true;
      break;
    }
  }
  return { transfers, covered };
}

interface Transfer {
  timestamp?: string;
  from?: { hash?: string };
  to?: { hash?: string };
  total?: { value?: string };
  token?: { address?: string; address_hash?: string };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("address")?.trim() ?? "";
  const rangeKey = (url.searchParams.get("range") ?? "1W") as RangeKey;
  const days = RANGES[rangeKey] ?? RANGES["1W"];

  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    return Response.json({ error: "A wallet address is required", points: [] }, { status: 400 });
  }
  const me = raw.toLowerCase();
  const key = `${me}:${days}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return Response.json(hit.body, { headers: { "cache-control": "no-store" } });
  }

  try {
    const client = server();
    const tradable = POOLS.map((p) => ({ pool: p, stock: bySymbol.get(p.symbol)! })).filter((x) => x.stock);

    // Today's prices and today's balances — the anchor the walk starts from.
    const [prices, balances, cashRaw, transfersRes] = await Promise.all([
      client.multicall({
        contracts: tradable.map((x) => ({ address: x.pool.pool, abi: slot0Abi, functionName: "slot0" as const })),
        allowFailure: true,
      }),
      client.multicall({
        contracts: tradable.map((x) => ({
          address: x.stock.address, abi: erc20Abi, functionName: "balanceOf" as const, args: [raw as `0x${string}`],
        })),
        allowFailure: true,
      }),
      client.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [raw as `0x${string}`] }).catch(() => 0n),
      fetchTransfers(raw, Date.now() - days * 86_400_000),
    ]);

    const priceOf = new Map<string, number>();
    const holding = new Map<string, number>();
    tradable.forEach((x, i) => {
      const p = prices[i];
      if (p.status === "success") {
        const price = priceFromSqrt(p.result[0] as bigint, x.stock.address);
        if (Number.isFinite(price) && price > 0) priceOf.set(x.stock.address.toLowerCase(), price);
      }
      const b = balances[i];
      if (b?.status === "success") holding.set(x.stock.address.toLowerCase(), shares(b.result as bigint));
    });
    let cash = usdg(cashRaw as bigint);

    const { transfers, covered } = transfersRes;

    const now = Date.now();
    const from = now - days * 86_400_000;

    // Newest first from the explorer, which is the order the walk backwards
    // wants: undo each transfer to recover the balance before it happened.
    const value = () => {
      let v = cash;
      for (const [addr, qty] of holding) v += qty * (priceOf.get(addr) ?? 0);
      return v;
    };

    const stamps: { t: number; value: number }[] = [{ t: now, value: value() }];

    for (const tr of transfers) {
      const at = Date.parse(tr.timestamp ?? "");
      // Skip one unreadable stamp; stop only when we are genuinely past the
      // window. Breaking on either killed the whole walk on the first oddity
      // and left every range showing one flat value.
      if (!Number.isFinite(at)) continue;
      if (at < from) break;

      const token = (tr.token?.address ?? tr.token?.address_hash ?? "").toLowerCase();
      const isCash = token === USDG.toLowerCase();
      if (!isCash && !KNOWN.has(token)) continue;

      const out = tr.from?.hash?.toLowerCase() === me;
      const amt = Number(BigInt(tr.total?.value ?? "0")) / 10 ** (isCash ? USDG_DECIMALS : STOCK_DECIMALS);

      // Undo: an inbound transfer means the balance before it was lower.
      if (isCash) cash += out ? amt : -amt;
      else holding.set(token, (holding.get(token) ?? 0) + (out ? amt : -amt));

      stamps.push({ t: at, value: value() });
    }

    // How far back the walk is actually trustworthy. Past this the transfer log
    // ran out, and drawing a line there would assert a balance we never saw.
    const oldest = stamps.length ? Math.min(...stamps.map((s) => s.t)) : now;
    const reachedStart = covered || oldest <= from;
    const start = reachedStart ? from : oldest;

    // Resample onto an even grid so the line is not bunched around busy hours.
    stamps.sort((a, b) => a.t - b.t);
    const points: PVPoint[] = [];
    for (let i = 0; i < POINTS; i++) {
      const t = start + ((now - start) * i) / (POINTS - 1);
      // The value at time t is whatever it was at the last event on or before t.
      let v = stamps[0]?.value ?? 0;
      for (const s of stamps) {
        if (s.t <= t) v = s.value;
        else break;
      }
      points.push({ t, value: Math.max(0, v) });
    }

    const body = {
      points,
      range: rangeKey,
      current: points[points.length - 1]?.value ?? 0,
      // Never let the caller present this as a performance chart.
      basis: "holdings valued at today's prices",
      // False means the window is longer than the history we could read, and
      // the chart starts where the data does rather than where you asked.
      full: reachedStart,
      from: start,
    };
    cache.set(key, { at: Date.now(), body });
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const stale = cache.get(key);
    if (stale) return Response.json({ ...(stale.body as object), stale: true });
    return Response.json(
      { error: "Couldn't rebuild this wallet's history", detail: (e as Error).message, points: [] },
      { status: 503 }
    );
  }
}
