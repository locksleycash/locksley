// One call gives the browser the whole board: a price for every tradable stock
// and, when an address is supplied, that wallet's holdings alongside it.
//
// Doing it here rather than in the browser keeps ~130 chain reads on one warm
// server connection instead of 130 round-trips fighting over the browser's
// six-per-origin limit.

import { erc20Abi, server, slot0Abi } from "../../../src/chain.ts";
import { POOLS } from "../../../src/pools.ts";
import { priceFromSqrt, shares, usdg } from "../../../src/prices.ts";
import { STOCKS, USDG, bySymbol } from "../../../src/stocks.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** No listed equity trades below a cent or above six figures a share. */
const MIN_SANE_PRICE = 0.01;
const MAX_SANE_PRICE = 100_000;

export interface Row {
  symbol: string;
  name: string;
  address: string;
  price: number;
  held: number;
  value: number;
  holders: number;
}

/** A listed stock with no pool deep enough to price or trade against. */
export interface Dormant {
  symbol: string;
  name: string;
  address: string;
  holders: number;
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("address")?.trim() ?? "";
  const address = /^0x[a-fA-F0-9]{40}$/.test(raw) ? (raw as `0x${string}`) : null;

  const client = server();
  const tradable = POOLS.map((p) => ({ pool: p, stock: bySymbol.get(p.symbol)! })).filter((x) => x.stock);

  const [priceCalls, balanceCalls] = [
    tradable.map((x) => ({ address: x.pool.pool, abi: slot0Abi, functionName: "slot0" as const })),
    address
      ? tradable.map((x) => ({
          address: x.stock.address,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [address] as const,
        }))
      : [],
  ];

  const [prices, balances, cash, ethWei] = await Promise.all([
    client.multicall({ contracts: priceCalls, allowFailure: true }),
    balanceCalls.length
      ? client.multicall({ contracts: balanceCalls, allowFailure: true })
      : Promise.resolve([]),
    address
      ? client
          .readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [address] })
          .catch(() => 0n)
      : Promise.resolve(0n),
    // Native ETH: every trade pays gas in it, so a wallet full of USDG and no
    // ETH cannot buy anything. The UI has to be able to say so.
    address ? client.getBalance({ address }).catch(() => 0n) : Promise.resolve(0n),
  ]);

  const rows: Row[] = [];
  tradable.forEach((x, i) => {
    const p = prices[i];
    // A pool we cannot read is left out entirely. Showing a stock at price 0
    // would look like a crash to zero rather than missing data.
    if (p.status !== "success") return;

    const price = priceFromSqrt(p.result[0] as bigint, x.stock.address);
    // Sanity-check at read time, not just when pools.ts was generated. A pool
    // whose liquidity has since drained still answers slot0 — pinned at the
    // tick boundary — and that decodes to a price in the undecillions. The
    // snapshot can go stale; this guard cannot.
    if (!Number.isFinite(price) || price < MIN_SANE_PRICE || price > MAX_SANE_PRICE) return;

    const b = balances[i];
    const held = b?.status === "success" ? shares(b.result as bigint) : 0;
    rows.push({
      symbol: x.stock.symbol,
      name: x.stock.name,
      address: x.stock.address,
      price,
      held,
      value: held * price,
      holders: x.stock.holders,
    });
  });

  rows.sort((a, b) => b.value - a.value || b.price - a.price);

  // The catalog holds 90 names; only some have a market. The rest are listed
  // separately rather than hidden — a stock vanishing without explanation
  // reads as a bug, not as "nobody has opened a pool for it yet".
  const priced = new Set(rows.map((r) => r.symbol));
  const dormant: Dormant[] = STOCKS.filter((s) => !priced.has(s.symbol))
    .map((s) => ({ symbol: s.symbol, name: s.name, address: s.address, holders: s.holders }))
    .sort((a, b) => b.holders - a.holders);

  return Response.json(
    {
      rows,
      dormant,
      cash: usdg(cash as bigint),
      eth: Number(ethWei as bigint) / 1e18,
      portfolio: rows.reduce((sum, r) => sum + r.value, 0),
      at: Date.now(),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
