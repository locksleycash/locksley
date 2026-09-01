import { STOCK_DECIMALS, USDG, USDG_DECIMALS } from "./stocks.ts";

const Q96 = 2 ** 96;

/**
 * USDG per share, from a v3 pool's sqrtPriceX96.
 *
 * Uniswap sorts a pool's tokens by address, so whether the stock is token0 or
 * token1 flips the ratio. Comparing the two addresses tells us which side we
 * are on without another RPC call.
 */
export function priceFromSqrt(sqrtPriceX96: bigint, stock: string): number {
  const ratio = (Number(sqrtPriceX96) / Q96) ** 2; // token1 per token0, raw units
  const stockIsToken0 = stock.toLowerCase() < USDG.toLowerCase();

  return stockIsToken0
    ? ratio * 10 ** (STOCK_DECIMALS - USDG_DECIMALS) // USDG per share already
    : 1 / (ratio * 10 ** (USDG_DECIMALS - STOCK_DECIMALS)); // invert: shares per USDG
}

/** Shares held, as a plain number. */
export const shares = (raw: bigint): number => Number(raw) / 10 ** STOCK_DECIMALS;

/** USDG held, as a plain number. */
export const usdg = (raw: bigint): number => Number(raw) / 10 ** USDG_DECIMALS;
