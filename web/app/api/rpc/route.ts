// JSON-RPC proxy for Robinhood Chain.
//
// Same reason as HoodBank's: rpc.*.chain.robinhood.com is DNS-blocked by some
// Indonesian ISPs, so a browser on those networks can never reach it directly.
// A same-origin call always gets through and the server side is unblocked.
//
// EVM_RPC_URL overrides the target for local dev behind such an ISP.

export const runtime = "nodejs";

const TARGET = (process.env.EVM_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com").trim();

// Read-only calls get a short cache. The stock board asks for 60-odd pools at
// once and several people may load it in the same second; without this every
// visitor multiplies the upstream traffic for answers that are identical.
const TTL_MS = 2_000;
const CHAIN_ID_TTL_MS = 5 * 60_000;
const CACHEABLE = new Set(["eth_getBalance", "eth_call", "eth_chainId", "eth_blockNumber"]);

const cache = new Map<string, { at: number; body: string }>();

const ttlFor = (method: string) =>
  method === "eth_chainId" ? CHAIN_ID_TTL_MS : method === "eth_blockNumber" ? 1_000 : TTL_MS;

export async function POST(req: Request) {
  const body = await req.text();

  // Batched or malformed payloads skip the cache rather than risk handing back
  // someone else's answer.
  let key: string | null = null;
  let ttl = 0;
  try {
    const rpc = JSON.parse(body) as { method?: string; params?: unknown };
    if (rpc?.method && CACHEABLE.has(rpc.method)) {
      key = `${rpc.method}:${JSON.stringify(rpc.params ?? [])}`;
      ttl = ttlFor(rpc.method);
    }
  } catch {
    /* not JSON we understand — forward it untouched */
  }

  if (key) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) {
      // The id must match the caller's, or viem discards the response.
      const id = (JSON.parse(body) as { id?: unknown }).id ?? null;
      return Response.json({ ...(JSON.parse(hit.body) as Record<string, unknown>), id });
    }
  }

  try {
    const r = await fetch(TARGET, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
    });
    const text = await r.text();

    if (key && r.ok && !text.includes('"error"')) {
      cache.set(key, { at: Date.now(), body: text });
      if (cache.size > 400) {
        for (const [k, v] of cache) if (Date.now() - v.at > CHAIN_ID_TTL_MS) cache.delete(k);
      }
    }

    return new Response(text, { status: r.status, headers: { "content-type": "application/json" } });
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "RPC upstream unreachable" } },
      { status: 502 }
    );
  }
}
