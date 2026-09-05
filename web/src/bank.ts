import { USDG } from "./stocks.ts";
import { V3_FACTORY } from "./pools.ts";
import { priceFromSqrt } from "./prices.ts";

/** The three bank contracts. Empty until deployed — the UI checks before signing. */
export const SAVINGS = (process.env.NEXT_PUBLIC_SAVINGS_ADDRESS ?? "") as `0x${string}` | "";
export const PAYMENTS = (process.env.NEXT_PUBLIC_PAYMENTS_ADDRESS ?? "") as `0x${string}` | "";
export const LOAN = (process.env.NEXT_PUBLIC_LOAN_ADDRESS ?? "") as `0x${string}` | "";

/** SGOV — the short-treasury token the savings vault holds; USDG pool fee 3000. */
export const SGOV = "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5" as const;
export const SGOV_FEE = 3000;
export { USDG };

export const erc20ApproveAbi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export const savingsAbi = [
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "usdgIn", type: "uint256" }, { name: "minSgovOut", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "depositLocked", stateMutability: "nonpayable", inputs: [{ name: "usdgIn", type: "uint256" }, { name: "minSgovOut", type: "uint256" }, { name: "term", type: "uint64" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "sgovShares", type: "uint256" }, { name: "minUsdgOut", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "withdrawLocked", stateMutability: "nonpayable", inputs: [{ name: "sgovShares", type: "uint256" }, { name: "minUsdgOut", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "shares", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lockedShares", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "unlockAt", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint64" }] },
] as const;

export const paymentsAbi = [
  { type: "function", name: "create", stateMutability: "nonpayable", inputs: [
    { name: "token", type: "address" }, { name: "recipient", type: "address" }, { name: "amount", type: "uint256" },
    { name: "interval", type: "uint64" }, { name: "payments", type: "uint32" }, { name: "startDelay", type: "uint64" }, { name: "expiry", type: "uint64" },
  ], outputs: [{ type: "uint256" }] },
  { type: "function", name: "execute", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "cancel", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "nextId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "orderOf", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{
    type: "tuple", components: [
      { name: "owner", type: "address" }, { name: "recipient", type: "address" }, { name: "token", type: "address" },
      { name: "amount", type: "uint256" }, { name: "remaining", type: "uint256" },
      { name: "interval", type: "uint64" }, { name: "nextDue", type: "uint64" }, { name: "expiry", type: "uint64" },
    ],
  }] },
] as const;

export const loanAbi = [
  { type: "function", name: "supply", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "redeem", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "depositCollateral", stateMutability: "nonpayable", inputs: [{ name: "token", type: "address" }, { name: "fee", type: "uint24" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "borrow", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "repay", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "withdrawCollateral", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "debtOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "collateralValue", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "supplyShares", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupplyShares", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "reserveValue", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalBorrows", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "positions", stateMutability: "view", inputs: [{ type: "address" }], outputs: [
    { name: "collToken", type: "address" }, { name: "collFee", type: "uint24" }, { name: "collateral", type: "uint256" }, { name: "principalScaled", type: "uint256" },
  ] },
] as const;

const factoryAbi = [{ type: "function", name: "getPool", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }], outputs: [{ type: "address" }] }] as const;
const slot0Abi = [{ type: "function", name: "slot0", stateMutability: "view", inputs: [], outputs: [
  { type: "uint160" }, { type: "int24" }, { type: "uint16" }, { type: "uint16" }, { type: "uint16" }, { type: "uint8" }, { type: "bool" },
] }] as const;

/** USDG per SGOV from the pool, or 0 when it can't be read. Takes the client so
 *  this file stays free of server-only imports. */
export async function readSgovPrice(client: {
  readContract: (a: never) => Promise<unknown>;
}): Promise<number> {
  try {
    const pool = (await client.readContract({ address: V3_FACTORY, abi: factoryAbi, functionName: "getPool", args: [SGOV, USDG, SGOV_FEE] } as never)) as string;
    if (!pool || pool === "0x0000000000000000000000000000000000000000") return 0;
    const s = (await client.readContract({ address: pool, abi: slot0Abi, functionName: "slot0" } as never)) as readonly unknown[];
    const p = priceFromSqrt(s[0] as bigint, SGOV);
    return Number.isFinite(p) && p > 0 ? p : 0;
  } catch { return 0; }
}

export const MAX_LTV_BPS = 5000;
export const LIQ_THRESHOLD_BPS = 6000;
export const BORROW_APR = 8; // %, matches contract RATE_PER_SEC
