// StocksPilot keeper — deploys users' pending cash buckets by calling the
// permissionless invest(). It is only a convenience: anyone can run one, and
// users can always invest their own buckets from the app. The keeper holds no
// power over funds — invest() credits the user, never the caller.
//
//   RPC_URL=... PILOT=0x... KEEPER_KEY=0x... node scripts/keeper.mjs
//
// Optional: EXPLORER (Blockscout base), INTERVAL_MS (default 60000).

import { createPublicClient, createWalletClient, http, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = process.env.RPC_URL ?? "https://robinhood-rpc.publicnode.com";
const PILOT = process.env.PILOT;
const KEY = process.env.KEEPER_KEY;
const EXPLORER = process.env.EXPLORER ?? "https://robinhoodchain.blockscout.com";
const INTERVAL = Number(process.env.INTERVAL_MS ?? 60_000);

if (!PILOT || !KEY) { console.error("Set PILOT and KEEPER_KEY"); process.exit(1); }

const chain = { id: 4663, name: "RH Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const account = privateKeyToAccount(KEY.startsWith("0x") ? KEY : `0x${KEY}`);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: http(RPC) });

const abi = [
  { type: "function", name: "enrolled", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "strategyOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint8" }] },
  { type: "function", name: "strategyTokens", stateMutability: "view", inputs: [{ type: "uint8" }], outputs: [{ type: "address[]" }, { type: "uint24[]" }, { type: "uint16[]" }] },
  { type: "function", name: "cash", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "invest", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
];
const depositedEvent = [{ type: "event", name: "Deposited", inputs: [{ name: "user", type: "address", indexed: true }, { name: "strategy", type: "uint8" }, { name: "amount", type: "uint256" }] }];

/** Every address that has ever deposited, from Blockscout logs. */
async function depositors() {
  const set = new Set();
  let url = `${EXPLORER}/api/v2/addresses/${PILOT}/logs`;
  for (let p = 0; p < 5 && url; p++) {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) break;
    const j = await r.json();
    for (const it of j.items ?? []) {
      try {
        const dec = decodeEventLog({ abi: depositedEvent, data: it.data, topics: it.topics.filter(Boolean) });
        set.add(dec.args.user.toLowerCase());
      } catch { /* not ours */ }
    }
    url = j.next_page_params ? `${EXPLORER}/api/v2/addresses/${PILOT}/logs?${new URLSearchParams(j.next_page_params)}` : null;
  }
  return [...set];
}

async function sweep() {
  const users = await depositors();
  let sent = 0;
  for (const user of users) {
    try {
      const on = await pub.readContract({ address: PILOT, abi, functionName: "enrolled", args: [user] });
      if (!on) continue;
      const s = await pub.readContract({ address: PILOT, abi, functionName: "strategyOf", args: [user] });
      const [tokens] = await pub.readContract({ address: PILOT, abi, functionName: "strategyTokens", args: [s] });
      for (let i = 0; i < tokens.length; i++) {
        const c = await pub.readContract({ address: PILOT, abi, functionName: "cash", args: [user, tokens[i]] });
        if (c > 0n) {
          const hash = await wallet.writeContract({ address: PILOT, abi, functionName: "invest", args: [user, BigInt(i)] });
          console.log(`invest ${user} #${i} -> ${hash}`);
          await pub.waitForTransactionReceipt({ hash });
          sent++;
        }
      }
    } catch (e) { console.warn(`skip ${user}: ${e.shortMessage ?? e.message}`); }
  }
  console.log(`[${new Date().toISOString()}] ${users.length} users · ${sent} invests`);
}

console.log(`Keeper up · ${account.address} · pilot ${PILOT} · every ${INTERVAL / 1000}s`);
await sweep();
setInterval(() => sweep().catch((e) => console.error(e)), INTERVAL);
