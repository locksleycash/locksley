import { encodePacked, type Address } from "viem";
import { WETH, WETH_USDG_FEE } from "./dex.ts";
import { USDG, USDG_DECIMALS, STOCK_DECIMALS } from "./stocks.ts";

export type PayWith = "USDG" | "ETH";
export type Side = "buy" | "sell";

/** How much price movement a trade tolerates before it reverts. */
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%
export const MAX_SLIPPAGE_BPS = 500; // 5% — past this a user is being farmed

/**
 * The floor an output must clear, or the swap reverts.
 *
 * This is the only thing standing between a user and a sandwich attack, so it
 * is computed from the quote rather than trusted from the client, and it
 * rounds *down* — a floor that rounds up would reject honest fills.
 */
export function minOut(quoted: bigint, slippageBps: number): bigint {
  const bps = Math.min(Math.max(Math.round(slippageBps), 0), MAX_SLIPPAGE_BPS);
  return (quoted * BigInt(10_000 - bps)) / 10_000n;
}

/** Above this, a trade is eating the pool rather than trading against it. */
export const MAX_IMPACT = 0.15;
/** Above this, the trade still goes through but the user is warned first. */
export const WARN_IMPACT = 0.03;

/**
 * How much worse the full trade prices than a dust-sized one on the same route.
 *
 * Slippage tolerance cannot catch this: it only checks the fill against the
 * quote, and a quote that already drains the pool is a bad quote honoured
 * exactly. Comparing unit rates at two sizes is what exposes it.
 *
 * Returns 0 when the reference is unusable, so a missing check never reads as
 * a catastrophic one.
 */
export function priceImpact(
  smallIn: bigint,
  smallOut: bigint,
  fullIn: bigint,
  fullOut: bigint
): number {
  if (smallIn <= 0n || smallOut <= 0n || fullIn <= 0n || fullOut <= 0n) return 0;
  const smallRate = Number(smallOut) / Number(smallIn);
  const fullRate = Number(fullOut) / Number(fullIn);
  if (!Number.isFinite(smallRate) || !Number.isFinite(fullRate) || smallRate <= 0) return 0;
  return Math.max(0, 1 - fullRate / smallRate);
}

/** Uniswap v3 path: token, fee, token, fee, token… packed tight. */
export function encodePath(tokens: Address[], fees: number[]): `0x${string}` {
  if (tokens.length !== fees.length + 1) throw new Error("path: need one more token than fees");
  const types: string[] = ["address"];
  const values: unknown[] = [tokens[0]];
  fees.forEach((fee, i) => {
    types.push("uint24", "address");
    values.push(fee, tokens[i + 1]);
  });
  return encodePacked(types, values);
}

export interface Route {
  /** Human label, shown so the user can see where their money goes. */
  label: string;
  tokens: Address[];
  fees: number[];
  /** Single-hop trades use the cheaper exactInputSingle entry point. */
  single: boolean;
}

/**
 * Every way to get from what the user holds to what they want.
 *
 * ETH gets two candidates on purpose: the direct WETH/stock pool is one hop but
 * quotes worse than hopping through USDG, because the USDG legs carry far more
 * depth. The gap is small enough to flip, so both are quoted and the better
 * one wins — never assume the shorter path is the cheaper one.
 */
export function routesFor(
  side: Side,
  payWith: PayWith,
  stock: Address,
  stockFee: number,
  directEthFee: number | null
): Route[] {
  if (side === "sell") {
    // Selling always settles in USDG: that is where the depth is.
    return [{ label: "via USDG", tokens: [stock, USDG], fees: [stockFee], single: true }];
  }

  if (payWith === "USDG") {
    return [{ label: "direct", tokens: [USDG, stock], fees: [stockFee], single: true }];
  }

  const routes: Route[] = [
    { label: "ETH → USDG → stock", tokens: [WETH, USDG, stock], fees: [WETH_USDG_FEE, stockFee], single: false },
  ];
  if (directEthFee !== null) {
    routes.push({ label: "ETH → stock", tokens: [WETH, stock], fees: [directEthFee], single: true });
  }
  return routes;
}

/** Decimals of whatever the user is spending. */
export const decimalsIn = (side: Side, payWith: PayWith) =>
  side === "sell" ? STOCK_DECIMALS : payWith === "USDG" ? USDG_DECIMALS : 18;

/** Decimals of whatever the user receives. */
export const decimalsOut = (side: Side) => (side === "sell" ? USDG_DECIMALS : STOCK_DECIMALS);

/** Transactions that sit unmined past this are stale; 20 minutes is the Uniswap norm. */
export const deadlineFrom = (nowMs: number) => BigInt(Math.floor(nowMs / 1000) + 20 * 60);
