// What this wallet has actually done: every stock and USDG movement, newest
// first, read from the explorer's token-transfer index.
//
// Read from the chain rather than kept in a table of our own. A local ledger
// would miss anything done elsewhere — a transfer from another app, a swap on
// Uniswap directly — and show a history that quietly disagrees with the wallet.

import { STOCKS, USDG, USDG_DECIMALS, STOCK_DECIMALS } from "../../../src/stocks.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLOCKSCOUT = "https://robinhoodchain.blockscout.com/api/v2";
const TTL_MS = 45_000;

const KNOWN = new Map(STOCKS.map((s) => [s.address.toLowerCase(), s]));

export interface Move {
  hash: string;
  at: number;
  symbol: string;
  name: string;
  address: string;
  direction: "in" | "out";
  amount: number;
  /** USDG legs are cash; stock legs are shares. */
  kind: "cash" | "stock";
}

const cache = new Map<string, { at: number; body: unknown }>();

interface Transfer {
  transaction_hash?: string;
  timestamp?: string;
  from?: { hash?: string };
  to?: { hash?: string };
  total?: { value?: string; decimals?: string };
  token?: { address?: string; address_hash?: string; symbol?: string };
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("address")?.trim() ?? "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    return Response.json({ error: "A wallet address is required", moves: [] }, { status: 400 });
  }
  const me = raw.toLowerCase();

  const hit = cache.get(me);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return Response.json(hit.body, { headers: { "cache-control": "no-store" } });
  }

  try {
    const r = await fetch(`${BLOCKSCOUT}/addresses/${raw}/token-transfers?type=ERC-20`, {
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`explorer returned ${r.status}`);
    const j = (await r.json()) as { items?: Transfer[] };

    const moves: Move[] = [];
    for (const t of j.items ?? []) {
      const token = (t.token?.address ?? t.token?.address_hash ?? "").toLowerCase();
      const isCash = token === USDG.toLowerCase();
      const stock = KNOWN.get(token);
      // Anything that is neither a listed stock nor USDG is somebody else's
      // token drifting through; it belongs on a block explorer, not here.
      if (!isCash && !stock) continue;

      const out = t.from?.hash?.toLowerCase() === me;
      const decimals = isCash ? USDG_DECIMALS : STOCK_DECIMALS;
      const amount = Number(BigInt(t.total?.value ?? "0")) / 10 ** decimals;
      const at = Date.parse(t.timestamp ?? "");
      if (!Number.isFinite(at) || amount <= 0) continue;

      moves.push({
        hash: t.transaction_hash ?? "",
        at,
        symbol: isCash ? "USDG" : stock!.symbol,
        name: isCash ? "USDG" : stock!.name,
        address: token,
        direction: out ? "out" : "in",
        amount,
        kind: isCash ? "cash" : "stock",
      });
    }

    moves.sort((a, b) => b.at - a.at);
    const body = { moves: moves.slice(0, 60) };
    cache.set(me, { at: Date.now(), body });
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    // Serve what we had rather than an empty list: "no history" and "could not
    // read the history" look identical to a user and mean opposite things.
    const stale = cache.get(me);
    if (stale) return Response.json({ ...(stale.body as object), stale: true });
    return Response.json(
      { error: "Couldn't read this wallet's history right now", detail: (e as Error).message, moves: [] },
      { status: 503 }
    );
  }
}
