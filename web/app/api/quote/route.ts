// Quotes a swap and hands back a ready-to-sign transaction.
//
// The calldata is built here, not in the browser, so the slippage floor that
// protects the trade is computed from the quote the server just took. A client
// that could set its own amountOutMinimum could be talked into setting it to
// zero, which is exactly the shape of a sandwich attack.

import { encodeFunctionData, parseUnits, formatUnits, type Address } from "viem";
import { QUOTER_V2, SWAP_ROUTER_02, WETH, WETH_USDG_FEE, quoterAbi } from "../../../src/dex.ts";
import { POOLS, poolFor } from "../../../src/pools.ts";
import { USDG, USDG_DECIMALS, bySymbol } from "../../../src/stocks.ts";
import { server } from "../../../src/chain.ts";
import {
  DEFAULT_SLIPPAGE_BPS,
  MAX_IMPACT,
  MAX_SLIPPAGE_BPS,
  WARN_IMPACT,
  deadlineFrom,
  priceImpact,
  decimalsIn,
  decimalsOut,
  encodePath,
  minOut,
  routesFor,
  type PayWith,
  type Side,
} from "../../../src/swap.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routerAbi = [
  {
    type: "function", name: "exactInputSingle", stateMutability: "payable",
    inputs: [{
      type: "tuple", components: [
        { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" },
        { name: "fee", type: "uint24" }, { name: "recipient", type: "address" },
        { name: "amountIn", type: "uint256" }, { name: "amountOutMinimum", type: "uint256" },
        { name: "sqrtPriceLimitX96", type: "uint160" },
      ],
    }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "exactInput", stateMutability: "payable",
    inputs: [{
      type: "tuple", components: [
        { name: "path", type: "bytes" }, { name: "recipient", type: "address" },
        { name: "amountIn", type: "uint256" }, { name: "amountOutMinimum", type: "uint256" },
      ],
    }],
    outputs: [{ type: "uint256" }],
  },
  // The deadline overload, named explicitly — the router carries three.
  {
    type: "function", name: "multicall", stateMutability: "payable",
    inputs: [{ name: "deadline", type: "uint256" }, { name: "data", type: "bytes[]" }],
    outputs: [{ type: "bytes[]" }],
  },
] as const;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const symbol = String(body.symbol ?? "");
  const side = body.side === "sell" ? "sell" : ("buy" as Side);
  const payWith: PayWith = body.payWith === "ETH" ? "ETH" : "USDG";
  const amountText = String(body.amount ?? "").trim();
  const recipient = String(body.recipient ?? "") as Address;
  const slippageBps = Math.min(
    Math.max(Number(body.slippageBps ?? DEFAULT_SLIPPAGE_BPS) || DEFAULT_SLIPPAGE_BPS, 1),
    MAX_SLIPPAGE_BPS
  );

  // "USDG" is not a stock; it is the cash leg. Buying it with ETH is how funds
  // get in without leaving Robinhood Chain, and it rides the same router.
  const cashLeg = symbol === "USDG";
  const stock = cashLeg
    ? { symbol: "USDG", name: "USDG", address: USDG as Address, holders: 0 }
    : bySymbol.get(symbol);
  const pool = cashLeg ? { symbol: "USDG", pool: USDG as Address, fee: WETH_USDG_FEE, ethFee: WETH_USDG_FEE } : poolFor.get(symbol);
  if (!stock || !pool) {
    return Response.json({ error: `${symbol || "That stock"} isn't tradable here` }, { status: 400 });
  }
  if (cashLeg && (side !== "buy" || payWith !== "ETH")) {
    return Response.json({ error: "USDG can only be bought with ETH here" }, { status: 400 });
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
    return Response.json({ error: "Connect a wallet first" }, { status: 400 });
  }
  if (!/^\d*\.?\d+$/.test(amountText) || Number(amountText) <= 0) {
    return Response.json({ error: "Enter an amount greater than zero" }, { status: 400 });
  }

  const dIn = decimalsIn(side, payWith);
  // Buying the cash leg outputs USDG at 6 decimals, not a stock at 18. Reading
  // it as 18 divides the answer by a trillion, which is how "0.01 ETH → 0 USDG"
  // got past a route that was otherwise correct.
  const dOut = cashLeg ? USDG_DECIMALS : decimalsOut(side);
  let amountIn: bigint;
  try {
    amountIn = parseUnits(amountText, dIn);
  } catch {
    return Response.json({ error: "That amount has too many decimals" }, { status: 400 });
  }
  if (amountIn <= 0n) return Response.json({ error: "Enter an amount greater than zero" }, { status: 400 });

  const client = server();
  const routes = cashLeg
    ? [{ label: "ETH → USDG", tokens: [WETH as Address, USDG as Address], fees: [WETH_USDG_FEE], single: true }]
    : routesFor(side, payWith, stock.address as Address, pool.fee, pool.ethFee);

  // Quote every candidate; a route whose pool cannot fill this size simply drops out.
  const quoted = await Promise.all(
    routes.map(async (r) => {
      try {
        if (r.single) {
          const { result } = await client.simulateContract({
            address: QUOTER_V2, abi: quoterAbi, functionName: "quoteExactInputSingle",
            args: [{ tokenIn: r.tokens[0], tokenOut: r.tokens[1], amountIn, fee: r.fees[0], sqrtPriceLimitX96: 0n }],
          });
          return { route: r, out: result[0] as bigint };
        }
        const { result } = await client.simulateContract({
          address: QUOTER_V2, abi: quoterAbi, functionName: "quoteExactInput",
          args: [encodePath(r.tokens, r.fees), amountIn],
        });
        return { route: r, out: result[0] as bigint };
      } catch {
        return null;
      }
    })
  );

  const best = quoted.filter((q) => q !== null && q.out > 0n).sort((a, b) => (a!.out > b!.out ? -1 : 1))[0];
  if (!best) {
    return Response.json(
      { error: "No pool can fill that size right now — try a smaller amount" },
      { status: 409 }
    );
  }

  const { route } = best;

  // Re-quote the winning route at a thousandth of the size. Comparing the two
  // unit rates is the only thing that catches an order large enough to drain
  // the pool — the slippage floor would happily honour the terrible price.
  const probe = amountIn / 1000n;
  let impact = 0;
  if (probe > 0n) {
    try {
      const small = route.single
        ? await client.simulateContract({
            address: QUOTER_V2, abi: quoterAbi, functionName: "quoteExactInputSingle",
            args: [{ tokenIn: route.tokens[0], tokenOut: route.tokens[1], amountIn: probe, fee: route.fees[0], sqrtPriceLimitX96: 0n }],
          })
        : await client.simulateContract({
            address: QUOTER_V2, abi: quoterAbi, functionName: "quoteExactInput",
            args: [encodePath(route.tokens, route.fees), probe],
          });
      impact = priceImpact(probe, small.result[0] as bigint, amountIn, best.out);
    } catch {
      // A probe that fails tells us nothing; leave impact at zero rather than
      // blocking a trade on a missing measurement.
    }
  }

  if (impact > MAX_IMPACT) {
    return Response.json(
      {
        error: `That size would move the price ${(impact * 100).toFixed(1)}% against you. Try a smaller amount.`,
        impact,
      },
      { status: 409 }
    );
  }

  const floor = minOut(best.out, slippageBps);

  const swapData = route.single
    ? encodeFunctionData({
        abi: routerAbi, functionName: "exactInputSingle",
        args: [{
          tokenIn: route.tokens[0], tokenOut: route.tokens[1], fee: route.fees[0],
          recipient, amountIn, amountOutMinimum: floor, sqrtPriceLimitX96: 0n,
        }],
      })
    : encodeFunctionData({
        abi: routerAbi, functionName: "exactInput",
        args: [{ path: encodePath(route.tokens, route.fees), recipient, amountIn, amountOutMinimum: floor }],
      });

  const data = encodeFunctionData({
    abi: routerAbi, functionName: "multicall",
    args: [deadlineFrom(Date.now()), [swapData]],
  });

  // Paying in ETH means sending value; the router wraps it on the way in.
  const spendingEth = side === "buy" && payWith === "ETH";

  return Response.json(
    {
      route: route.label,
      alternatives: quoted.filter(Boolean).length,
      amountIn: amountIn.toString(),
      amountOut: best.out.toString(),
      amountOutFormatted: formatUnits(best.out, dOut),
      minOut: floor.toString(),
      minOutFormatted: formatUnits(floor, dOut),
      slippageBps,
      impact,
      // Below the refusal line but still costly — the UI says so before signing.
      warning:
        impact > WARN_IMPACT
          ? `This trade moves the price ${(impact * 100).toFixed(1)}% against you.`
          : null,
      // What the wallet needs, and nothing it has to compute itself.
      tx: { to: SWAP_ROUTER_02, data, value: spendingEth ? amountIn.toString() : "0" },
      // Non-ETH inputs must be approved to the router before the swap lands.
      approval: spendingEth
        ? null
        : { token: side === "sell" ? stock.address : (route.tokens[0] as Address), spender: SWAP_ROUTER_02, amount: amountIn.toString() },
      weth: WETH,
      pools: POOLS.length,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
