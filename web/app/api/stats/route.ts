// Protocol-wide live stats: what the three bank contracts hold right now, plus
// a merged activity tape. Balances are read on-chain; the tape comes from
// Blockscout (the public RPC refuses eth_getLogs).

import { decodeEventLog } from "viem";
import { server, erc20Abi } from "../../../src/chain.ts";
import { USDG_DECIMALS, STOCK_DECIMALS } from "../../../src/stocks.ts";
import { SAVINGS, PAYMENTS, LOAN, SGOV, paymentsAbi, loanAbi, readSgovPrice } from "../../../src/bank.ts";
import { EXPLORER } from "../../../src/site.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SWEEP = 400;
const usd = (v: bigint) => Number(v) / 10 ** USDG_DECIMALS;

const eventsAbi = [
  { type: "event", name: "Deposited", inputs: [{ name: "user", type: "address", indexed: true }, { name: "usdgIn", type: "uint256" }, { name: "sgovOut", type: "uint256" }, { name: "locked", type: "bool" }] },
  { type: "event", name: "Withdrawn", inputs: [{ name: "user", type: "address", indexed: true }, { name: "sgovIn", type: "uint256" }, { name: "usdgOut", type: "uint256" }, { name: "locked", type: "bool" }] },
  { type: "event", name: "Created", inputs: [{ name: "id", type: "uint256", indexed: true }, { name: "owner", type: "address", indexed: true }, { name: "recipient", type: "address", indexed: true }, { name: "token", type: "address" }, { name: "amount", type: "uint256" }, { name: "budget", type: "uint256" }] },
  { type: "event", name: "Paid", inputs: [{ name: "id", type: "uint256", indexed: true }, { name: "recipient", type: "address", indexed: true }, { name: "by", type: "address" }, { name: "amount", type: "uint256" }, { name: "remaining", type: "uint256" }] },
  { type: "event", name: "Supplied", inputs: [{ name: "user", type: "address", indexed: true }, { name: "usdgIn", type: "uint256" }, { name: "shares", type: "uint256" }] },
  { type: "event", name: "Borrowed", inputs: [{ name: "user", type: "address", indexed: true }, { name: "amount", type: "uint256" }] },
  { type: "event", name: "Repaid", inputs: [{ name: "user", type: "address", indexed: true }, { name: "amount", type: "uint256" }] },
  { type: "event", name: "Liquidated", inputs: [{ name: "user", type: "address", indexed: true }, { name: "by", type: "address", indexed: true }, { name: "repaid", type: "uint256" }, { name: "seized", type: "uint256" }] },
] as const;

export interface StatAct { kind: string; user: string; detail: string; tx: string; block: number; }

async function logsOf(addr: string) {
  const out: { topics: (string | null)[]; data: string; transaction_hash: string; block_number: number }[] = [];
  try {
    const r = await fetch(`${EXPLORER}/api/v2/addresses/${addr}/logs`, { headers: { accept: "application/json" } });
    if (!r.ok) return out;
    const j = (await r.json()) as { items?: typeof out };
    return j.items ?? out;
  } catch { return out; }
}

export async function GET() {
  const client = server();
  const live = { savings: !!SAVINGS, payments: !!PAYMENTS, loan: !!LOAN };
  const sgovPrice = await readSgovPrice(client);

  let savingsTvl = 0, lendingReserve = 0, totalBorrowed = 0, activeOrders = 0, escrowed = 0;

  if (SAVINGS) {
    try {
      const held = await client.readContract({ address: SGOV, abi: erc20Abi, functionName: "balanceOf", args: [SAVINGS] });
      savingsTvl = (Number(held as bigint) / 10 ** STOCK_DECIMALS) * sgovPrice;
    } catch { /* leave 0 */ }
  }
  if (LOAN) {
    try {
      const [res, bor] = await Promise.all([
        client.readContract({ address: LOAN, abi: loanAbi, functionName: "reserveValue" }),
        client.readContract({ address: LOAN, abi: loanAbi, functionName: "totalBorrows" }),
      ]);
      lendingReserve = usd(res as bigint);
      totalBorrowed = usd(bor as bigint);
    } catch { /* leave 0 */ }
  }
  if (PAYMENTS) {
    try {
      const nextId = Number(await client.readContract({ address: PAYMENTS, abi: paymentsAbi, functionName: "nextId" }));
      const first = Math.max(1, nextId - MAX_SWEEP);
      const ids = Array.from({ length: nextId - first }, (_, i) => first + i);
      const reads = ids.length ? await client.multicall({ allowFailure: true, contracts: ids.map((id) => ({ address: PAYMENTS as `0x${string}`, abi: paymentsAbi, functionName: "orderOf" as const, args: [BigInt(id)] as const })) }) : [];
      const now = Math.floor(Date.now() / 1000);
      reads.forEach((r) => {
        if (r.status !== "success") return;
        const o = r.result;
        if (o.remaining > 0n && (o.expiry === 0n || now <= Number(o.expiry))) { activeOrders++; escrowed += usd(o.remaining); }
      });
    } catch { /* leave 0 */ }
  }

  // ---- merged activity tape ----
  const users = new Set<string>();
  const activity: StatAct[] = [];
  const addrs = [SAVINGS, PAYMENTS, LOAN].filter(Boolean) as string[];
  for (const a of addrs) {
    for (const log of await logsOf(a)) {
      try {
        const dec = decodeEventLog({ abi: eventsAbi, data: log.data as `0x${string}`, topics: log.topics.filter(Boolean) as [`0x${string}`, ...`0x${string}`[]] });
        const base = { tx: log.transaction_hash, block: Number(log.block_number) };
        const g = dec.args as Record<string, unknown>;
        const who = String(g.user ?? g.owner ?? g.recipient ?? "");
        if (who) users.add(who.toLowerCase());
        const n = (k: string) => usd((g[k] as bigint) ?? 0n).toLocaleString("en-US", { maximumFractionDigits: 2 });
        const detail =
          dec.eventName === "Deposited" ? `${n("usdgIn")} USDG saved${g.locked ? " (locked)" : ""}`
          : dec.eventName === "Withdrawn" ? `${n("usdgOut")} USDG withdrawn`
          : dec.eventName === "Created" ? `standing order · ${n("amount")} USDG each`
          : dec.eventName === "Paid" ? `${n("amount")} USDG paid out`
          : dec.eventName === "Supplied" ? `${n("usdgIn")} USDG supplied`
          : dec.eventName === "Borrowed" ? `${n("amount")} USDG borrowed`
          : dec.eventName === "Repaid" ? `${n("amount")} USDG repaid`
          : `${n("repaid")} USDG liquidated`;
        activity.push({ kind: dec.eventName, user: who, detail, ...base });
      } catch { /* not one of ours */ }
    }
  }
  activity.sort((a, b) => b.block - a.block);

  return Response.json(
    { live, sgovPrice, savingsTvl, lendingReserve, totalBorrowed, activeOrders, escrowed, participants: users.size, activity: activity.slice(0, 20), at: Date.now() },
    { headers: { "cache-control": "no-store" } },
  );
}
