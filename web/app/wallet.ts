"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type Address } from "viem";
import { robinhoodChain } from "../src/chain.ts";

export interface Wallet {
  address: Address | null;
  chainOk: boolean;
  busy: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  send: (tx: { to: Address; data: `0x${string}`; value?: bigint }) => Promise<`0x${string}`>;
}

const CHAIN_CAIP = `eip155:${robinhoodChain.id}`;

export function useWallet(): Wallet {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  // Privy hands back every wallet the user has linked; the first is the active
  // one, and an embedded wallet is created for anyone who logged in by email.
  const wallet = wallets[0] ?? null;
  const address = (wallet?.address as Address | undefined) ?? null;
  const chainOk = wallet?.chainId === CHAIN_CAIP;

  // A wallet on the wrong network reads a zero balance and cannot estimate gas,
  // so move it across as soon as it appears rather than failing at signing time.
  useEffect(() => {
    if (!wallet || chainOk || switching) return;
    setSwitching(true);
    void wallet
      .switchChain(robinhoodChain.id)
      .catch((e: unknown) => setError(friendly(e)))
      .finally(() => setSwitching(false));
  }, [wallet, chainOk, switching]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      if (!authenticated) {
        login();
        return;
      }
      if (wallet && !chainOk) await wallet.switchChain(robinhoodChain.id);
    } catch (e) {
      setError(friendly(e));
    }
  }, [authenticated, login, wallet, chainOk]);

  const disconnect = useCallback(() => {
    setError(null);
    void logout();
  }, [logout]);

  const send = useCallback(
    async (tx: { to: Address; data: `0x${string}`; value?: bigint }) => {
      if (!wallet || !address) throw new Error("Connect a wallet first");
      // Prove the network before asking for a signature: signing on the wrong
      // chain produces a transaction that can never land here.
      if (wallet.chainId !== CHAIN_CAIP) await wallet.switchChain(robinhoodChain.id);

      const provider = await wallet.getEthereumProvider();
      const client = createWalletClient({
        account: address,
        chain: robinhoodChain,
        transport: custom(provider),
      });
      return client.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ?? 0n });
    },
    [wallet, address]
  );

  return useMemo(
    () => ({
      address,
      chainOk,
      busy: !ready || switching,
      error,
      connect,
      disconnect,
      send,
    }),
    [address, chainOk, ready, switching, error, connect, disconnect, send]
  );
}

/** Wallet errors arrive as provider dumps; turn the common ones into English. */
export function friendly(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: number })?.code;

  if (code === 4001 || /user rejected|denied|cancell?ed/i.test(raw)) return "You cancelled the signature.";
  if (/insufficient funds/i.test(raw)) return "Not enough ETH to cover gas.";
  if (/transfer amount exceeds balance|exceeds balance/i.test(raw)) return "Not enough balance for that amount.";
  if (/Too little received|STF|slippage/i.test(raw)) return "Price moved past your slippage limit — try again.";
  if (/gas required exceeds|intrinsic gas/i.test(raw)) return "Gas estimate failed — the trade would revert.";
  if (/nonce/i.test(raw)) return "A previous transaction is still pending.";
  if (/chain|network/i.test(raw) && /mismatch|unsupported|switch/i.test(raw)) return "Switch your wallet to RH Chain.";
  if (/fetch|network error|failed to fetch/i.test(raw)) return "Couldn't reach the network — check your connection.";

  return raw.split("\n")[0].slice(0, 160);
}
