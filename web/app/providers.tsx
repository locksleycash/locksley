"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { robinhoodChain } from "../src/chain.ts";

/**
 * Privy app ids are ~25 lowercase alphanumerics. The shape is checked before
 * the provider sees it because Privy throws on a bad id, and that throw during
 * prerender takes down the whole page â€” a mistyped environment variable should
 * cost the login button, not the site.
 */
const RAW = (process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "").trim();
const APP_ID = /^[a-z0-9]{20,32}$/i.test(RAW) ? RAW : "";

/**
 * Privy needs a chain whose RPC a browser can actually fetch. The shared chain
 * object carries "/api/rpc" â€” correct for the app, useless to Privy's own
 * client â€” so the absolute form is substituted here at render time.
 */
function browserChain() {
  const url = new URL("/api/rpc", window.location.origin).toString();
  return { ...robinhoodChain, rpcUrls: { default: { http: [url] } } };
}

export function Providers({ children }: { children: React.ReactNode }) {
  // No usable id: the board, the market and the read-only address box all work
  // without login, so degrade to those rather than showing a blank screen.
  if (!APP_ID) return <>{children}</>;

  const chain = typeof window === "undefined" ? robinhoodChain : browserChain();

  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ["email", "google", "wallet"],
        defaultChain: chain,
        supportedChains: [chain],
        // v3 nests this per chain family; a flat createOnLogin is silently the
        // wrong shape and leaves email users with no wallet to sign with.
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        appearance: {
          theme: "dark",
          accentColor: "#0f9d6b",
          logo: undefined,
          walletChainType: "ethereum-only",
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

