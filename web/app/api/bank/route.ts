// One call gives the browser a wallet's whole bank: savings balance and lock,
// the lending/borrowing position, standing orders, plus the live SGOV price
// and USDG on hand. Kept server-side so the reads share one warm connection.

import { server, slot0Abi, erc20Abi } from "../../../src/chain.ts";
import { V3_FACTORY } from "../../../src/pools.ts";
import { priceFromSqrt } from "../../../src/prices.ts";
import { USDG_DECIMALS, STOCK_DECIMALS } from "../../../src/stocks.ts";
import { SAVINGS, PAYMENTS, LOAN, SGOV, SGOV_FEE, USDG, savingsAbi, paymentsAbi, loanAbi } from "../../../src/bank.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const factoryAbi = [{ type: "function", name: "getPool", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }], outputs: [{ type: "address" }] }] as const;
const MAX_SWEEP = 400;

export interface BankOrder { id: number; recipient: string; amount: number; remaining: number; intervalS: number; nextDue: number; expiry: number; open: boolean; }

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("address")?.trim() ?? "";
  const user = /^0x[a-fA-F0-9]{40}$/.test(raw) ? (raw as `0x${string}`) : null;

  const client = server();
  const out: Record<string, unknown> = {
    deployed: { savings: !!SAVINGS, payments: !!PAYMENTS, loan: !!LOAN },
  };

  // ---- SGOV price (USDG per SGOV) ----
  let sgovPrice = 0;
  try {
    const pool = await client.readContract({ address: V3_FACTORY, abi: factoryAbi, functionName: "getPool", args: [SGOV, USDG as `0x${string}`, SGOV_FEE] });
    if (pool && pool !== "0x0000000000000000000000000000000000000000") {
      const s = await client.readContract({ address: pool as `0x${string}`, abi: slot0Abi, functionName: "slot0" });
      const p = priceFromSqrt((s as unknown as bigint[])[0], SGOV);
      if (Number.isFinite(p) && p > 0) sgovPrice = p;
    }
  } catch { /* leave 0 */ }
  out.sgovPrice = sgovPrice;

  if (!user) return Response.json(out, { headers: { "cache-control": "no-store" } });

  // ---- wallet USDG ----
  try {
    const bal = await client.readContract({ address: USDG as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [user] });
    out.usdg = Number(bal as bigint) / 10 ** USDG_DECIMALS;
  } catch { out.usdg = 0; }

  // ---- savings ----
  if (SAVINGS) {
    try {
      const [sh, lk, un] = await Promise.all([
        client.readContract({ address: SAVINGS, abi: savingsAbi, functionName: "shares", args: [user] }),
        client.readContract({ address: SAVINGS, abi: savingsAbi, functionName: "lockedShares", args: [user] }),
        client.readContract({ address: SAVINGS, abi: savingsAbi, functionName: "unlockAt", args: [user] }),
      ]);
      const free = Number(sh as bigint) / 10 ** STOCK_DECIMALS;
      const locked = Number(lk as bigint) / 10 ** STOCK_DECIMALS;
      out.savings = {
        freeShares: (sh as bigint).toString(), lockedSharesRaw: (lk as bigint).toString(),
        freeValue: free * sgovPrice, lockedValue: locked * sgovPrice,
        unlockAt: Number(un), free, locked,
      };
    } catch { /* skip */ }
  }

  // ---- loan position + lender ----
  if (LOAN) {
    try {
      const [debt, collVal, supSh, totSup, resVal, pos] = await Promise.all([
        client.readContract({ address: LOAN, abi: loanAbi, functionName: "debtOf", args: [user] }),
        client.readContract({ address: LOAN, abi: loanAbi, functionName: "collateralValue", args: [user] }),
        client.readContract({ address: LOAN, abi: loanAbi, functionName: "supplyShares", args: [user] }),
        client.readContract({ address: LOAN, abi: loanAbi, functionName: "totalSupplyShares" }),
        client.readContract({ address: LOAN, abi: loanAbi, functionName: "reserveValue" }),
        client.readContract({ address: LOAN, abi: loanAbi, functionName: "positions", args: [user] }),
      ]);
      const ts = totSup as bigint;
      const supplied = ts > 0n ? (Number(supSh as bigint) * Number(resVal as bigint)) / Number(ts) / 10 ** USDG_DECIMALS : 0;
      const p = pos as unknown as [string, number, bigint, bigint];
      out.loan = {
        debt: Number(debt as bigint) / 10 ** USDG_DECIMALS,
        collateralValue: Number(collVal as bigint) / 10 ** USDG_DECIMALS,
        collToken: p[0], collFee: Number(p[1]), collateral: Number(p[2] as bigint) / 10 ** STOCK_DECIMALS,
        supplied,
        supplyShares: (supSh as bigint).toString(),
      };
    } catch { /* skip */ }
  }

  // ---- standing orders owned by user ----
  if (PAYMENTS) {
    try {
      const nextId = Number(await client.readContract({ address: PAYMENTS, abi: paymentsAbi, functionName: "nextId" }));
      const first = Math.max(1, nextId - MAX_SWEEP);
      const ids = Array.from({ length: nextId - first }, (_, i) => first + i);
      const reads = ids.length ? await client.multicall({ allowFailure: true, contracts: ids.map((id) => ({ address: PAYMENTS as `0x${string}`, abi: paymentsAbi, functionName: "orderOf" as const, args: [BigInt(id)] as const })) }) : [];
      const now = Math.floor(Date.now() / 1000);
      const orders: BankOrder[] = [];
      reads.forEach((r, i) => {
        if (r.status !== "success") return;
        const o = r.result;
        if (o.owner.toLowerCase() !== user.toLowerCase()) return;
        const expiry = Number(o.expiry);
        orders.push({
          id: ids[i], recipient: o.recipient, amount: Number(o.amount) / 10 ** USDG_DECIMALS,
          remaining: Number(o.remaining) / 10 ** USDG_DECIMALS, intervalS: Number(o.interval),
          nextDue: Number(o.nextDue), expiry, open: o.remaining > 0n && (expiry === 0 || now <= expiry),
        });
      });
      orders.sort((a, b) => b.id - a.id);
      out.orders = orders;
    } catch { /* skip */ }
  }

  return Response.json(out, { headers: { "cache-control": "no-store" } });
}
