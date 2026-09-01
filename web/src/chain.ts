import { createPublicClient, http, type Chain } from "viem";

/**
 * RH Chain mainnet (EVM 4663). Gas is ETH; blocks land every 100ms.
 *
 * The display name is the short form. It appears in the wallet's add-network
 * prompt, and the chain id is what actually identifies the network — the label
 * is cosmetic, so it costs nothing to keep the brokerage's name off the screen.
 */
export const robinhoodChain: Chain = {
  id: 4663,
  name: "RH Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["/api/rpc"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
};

/**
 * Server-side client. Goes straight out rather than through /api/rpc — the
 * proxy exists for browsers behind a blocking ISP, and calling ourselves from
 * our own route handler would just add a hop.
 */
export const server = () =>
  createPublicClient({
    chain: robinhoodChain,
    transport: http(process.env.EVM_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com", {
      batch: true,
    }),
  });

export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export const slot0Abi = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { type: "uint160" }, { type: "int24" }, { type: "uint16" },
      { type: "uint16" }, { type: "uint16" }, { type: "uint8" }, { type: "bool" },
    ],
  },
] as const;
