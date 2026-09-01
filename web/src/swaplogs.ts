// Reading a pool's Swap events, from whichever source will actually answer.
//
// Three sources, none of them reliable alone:
//   · the chain RPC — free and fast, but the public node (PublicNode) refuses
//     every eth_getLogs as an "archive request", at any range. The official
//     Robinhood RPC does serve them, and is reachable from a server even where
//     an ISP blocks it on the user's machine.
//   · Blockscout v1 `getLogs` — a whole block range in one call, ~1s for
//     hundreds of logs, but unauthenticated and rate-limited. It starts
//     replying `status: "0", message: "Too many requests"` with a 200 status,
//     which is the trap: it looks like a successful empty answer.
//   · Blockscout v2 paged logs — slow (~4s per 50) but the most forgiving.
//
// The rule that matters: an empty result and a failed request are different
// answers, and this module never turns the second into the first.

const BLOCKSCOUT = "https://robinhoodchain.blockscout.com";
/** keccak256("Swap(address,address,int256,int256,uint160,uint128,int24)") */
export const SWAP_TOPIC = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";

export interface RawSwap {
  /** Unix ms. */
  t: number;
  /** sqrtPriceX96 straight out of the log. */
  sqrt: bigint;
}

export interface SwapRead {
  swaps: RawSwap[];
  /** "range" honoured the window asked for; "recent" is the newest N trades. */
  mode: "range" | "recent";
  source: string;
}

/** Rate limits are per-IP and last minutes; stop asking until they lift. */
const coolDown = new Map<string, number>();
const chilled = (k: string) => (coolDown.get(k) ?? 0) > Date.now();
const chill = (k: string, ms: number) => coolDown.set(k, Date.now() + ms);

const word = (data: string, i: number): bigint | null => {
  const words = data.slice(2).match(/.{64}/g);
  return words && words.length > i ? BigInt(`0x${words[i]}`) : null;
};

/** Swap data is five unindexed words; sqrtPriceX96 is the third. */
const parseSqrt = (data?: string) => (data ? word(data, 2) : null);

async function viaRpc(rpcUrl: string, pool: string, from: number, to: number): Promise<RawSwap[]> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getLogs",
      params: [{ address: pool, topics: [SWAP_TOPIC], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }],
    }),
    cache: "no-store",
  });
  const j = (await res.json()) as { result?: { data?: string; blockNumber?: string }[]; error?: { message?: string } };
  if (j.error) throw new Error(j.error.message ?? "rpc refused eth_getLogs");
  if (!Array.isArray(j.result)) throw new Error("rpc returned no result");

  // Logs carry a block number, not a timestamp. Blocks are 100ms apart, so the
  // head time plus the block delta is accurate to well under a second — far
  // finer than any point on this chart.
  const now = Date.now();
  return j.result.flatMap((l) => {
    const sqrt = parseSqrt(l.data);
    const blk = l.blockNumber ? Number.parseInt(l.blockNumber, 16) : NaN;
    if (sqrt === null || !Number.isFinite(blk)) return [];
    return [{ t: now - (to - blk) * 100, sqrt }];
  });
}

async function viaBlockscoutV1(pool: string, from: number, to: number): Promise<RawSwap[]> {
  if (chilled("v1")) throw new Error("v1 rate-limited");
  const q = new URLSearchParams({
    module: "logs", action: "getLogs",
    fromBlock: String(from), toBlock: String(to),
    address: pool, topic0: SWAP_TOPIC,
  });
  const res = await fetch(`${BLOCKSCOUT}/api?${q}`, { cache: "no-store" });
  const j = (await res.json()) as { status?: string; message?: string; result?: { data?: string; timeStamp?: string }[] };

  // A 200 with status "0" is the rate limit wearing a success costume.
  if (!Array.isArray(j.result)) {
    if (/too many requests/i.test(j.message ?? "")) {
      chill("v1", 5 * 60_000);
      throw new Error("Blockscout is rate-limiting us");
    }
    throw new Error(j.message || "v1 returned no result");
  }

  return j.result.flatMap((l) => {
    const sqrt = parseSqrt(l.data);
    const t = Number.parseInt(l.timeStamp ?? "", 16) * 1000;
    return sqrt === null || !Number.isFinite(t) || t <= 0 ? [] : [{ t, sqrt }];
  });
}

async function viaBlockscoutV2(pool: string, pages: number): Promise<RawSwap[]> {
  const out: RawSwap[] = [];
  let next: Record<string, string> | null = null;

  for (let i = 0; i < pages; i++) {
    const qs = next ? `?${new URLSearchParams(next)}` : "";
    const res = await fetch(`${BLOCKSCOUT}/api/v2/addresses/${pool}/logs${qs}`, { cache: "no-store" });
    if (!res.ok) {
      if (out.length) break; // keep what we already have
      throw new Error(`Blockscout returned ${res.status}`);
    }
    const j = (await res.json()) as {
      items?: { topics?: string[]; data?: string; block_timestamp?: string }[];
      next_page_params?: Record<string, string> | null;
    };
    for (const l of j.items ?? []) {
      if ((l.topics ?? [])[0] !== SWAP_TOPIC) continue;
      const sqrt = parseSqrt(l.data);
      const t = Date.parse(l.block_timestamp ?? "");
      if (sqrt === null || !Number.isFinite(t)) continue;
      out.push({ t, sqrt });
    }
    next = j.next_page_params ?? null;
    if (!next) break;
  }
  return out;
}

/**
 * Swap history for a pool. Throws if no source could answer — the caller must
 * be able to tell "this market is quiet" from "we could not look".
 */
export async function readSwaps(opts: {
  pool: string;
  fromBlock: number;
  toBlock: number;
  rpcUrl?: string;
  v2Pages?: number;
}): Promise<SwapRead> {
  // One v2 page by default: each costs ~5s, and 50 trades already draws a
  // readable line. Depth is not worth doubling the wait on the slow path.
  const { pool, fromBlock, toBlock, rpcUrl, v2Pages = 1 } = opts;
  const problems: string[] = [];

  if (rpcUrl && !chilled("rpc")) {
    try {
      return { swaps: await viaRpc(rpcUrl, pool, fromBlock, toBlock), mode: "range", source: "rpc" };
    } catch (e) {
      problems.push(`rpc: ${(e as Error).message}`);
      // Nodes that refuse logs refuse them permanently, so stop trying often.
      chill("rpc", 10 * 60_000);
    }
  }

  try {
    return { swaps: await viaBlockscoutV1(pool, fromBlock, toBlock), mode: "range", source: "blockscout-v1" };
  } catch (e) {
    problems.push(`v1: ${(e as Error).message}`);
  }

  try {
    return { swaps: await viaBlockscoutV2(pool, v2Pages), mode: "recent", source: "blockscout-v2" };
  } catch (e) {
    problems.push(`v2: ${(e as Error).message}`);
  }

  throw new Error(problems.join(" | "));
}
