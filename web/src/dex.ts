// Uniswap on Robinhood Chain (chain 4663).
//
// Taken from Uniswap's own deployment docs, then checked against the chain by
// scripts/check-swap.mjs: every address holds code, and SwapRouter02.factory()
// returns the same factory our pools were discovered from.
//
// That last check is the one that matters. Blockscout lists dozens of
// look-alikes — Rob0SwapRouter, HoodlumSwapRouterV2_1, InSwapRouter,
// StockmonUniversalRouterAdapterUsdg — and a router paired with a different
// factory would route trades into pools we never priced. Never add an address
// here on the strength of its name; re-run check-swap.mjs instead.

export const V3_FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA" as const;
export const SWAP_ROUTER_02 = "0xcaf681a66d020601342297493863e78c959e5cb2" as const;
export const QUOTER_V2 = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7" as const;
export const UNIVERSAL_ROUTER = "0x8876789976decbfcbbbe364623c63652db8c0904" as const;
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

/** Wrapped ETH. 392k holders; the other "WETH" entries on this chain are fakes. */
export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as const;

/**
 * Deepest WETH/USDG pool, the bridge for any ETH-denominated trade.
 * 0.01% fee tier, ~2.85M USDG — an order of magnitude deeper than the others.
 */
export const WETH_USDG_FEE = 100;

/**
 * Direct WETH/stock pools exist for a few names but quote worse than hopping
 * through USDG (0.1 ETH buys 0.8548 NVDA direct vs 0.8560 via USDG), because
 * the USDG legs are far deeper. Quote both and take the better one rather than
 * assuming one always wins — the gap is small enough to flip.
 */
export const preferTwoHopThroughUsdg = true;

export const quoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [{
      type: "tuple",
      components: [
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" },
        { name: "amountIn", type: "uint256" },
        { name: "fee", type: "uint24" },
        { name: "sqrtPriceLimitX96", type: "uint160" },
      ],
    }],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "quoteExactInput",
    stateMutability: "nonpayable",
    inputs: [{ name: "path", type: "bytes" }, { name: "amountIn", type: "uint256" }],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96AfterList", type: "uint160[]" },
      { name: "initializedTicksCrossedList", type: "uint32[]" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;
