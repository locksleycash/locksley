"use client";

import { useExportWallet } from "@privy-io/react-auth";
import { useState } from "react";
import { ic } from "./icons.tsx";
import { CURRENCIES } from "../src/money.ts";
import { USDG } from "../src/stocks.ts";
import { SWAP_ROUTER_02, V3_FACTORY } from "../src/dex.ts";
import { robinhoodChain } from "../src/chain.ts";
import { friendly, type Wallet } from "./wallet.ts";

const EXPLORER = "https://robinhoodchain.blockscout.com";
const short = (a: string) => `${a.slice(0, 6)}â€¦${a.slice(-4)}`;

/**
 * The wallet panel that slides out of the header.
 *
 * Holds the three things that belong to the account rather than to a trade:
 * where the money lives, the key that controls it, and the currency figures are
 * shown in. Everything here is read-only or a Privy-owned flow â€” no balance is
 * moved from this panel.
 */
export function AccountPanel({
  wallet,
  currency,
  onCurrency,
  rateNote,
  onClose,
}: {
  wallet: Wallet;
  currency: string;
  onCurrency: (code: string) => void;
  rateNote: string | null;
  onClose: () => void;
}) {
  const { exportWallet } = useExportWallet();
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copy = (text: string, tag: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(null), 1500);
  };

  const contracts = [
    { label: "Your wallet", value: wallet.address ?? "", link: `${EXPLORER}/address/${wallet.address}` },
    { label: "USDG", value: USDG, link: `${EXPLORER}/token/${USDG}` },
    { label: "Uniswap router", value: SWAP_ROUTER_02, link: `${EXPLORER}/address/${SWAP_ROUTER_02}` },
    { label: "Uniswap factory", value: V3_FACTORY, link: `${EXPLORER}/address/${V3_FACTORY}` },
  ];

  return (
    <div className="wpanel" role="dialog" aria-label="Wallet">
      {/* ---- identity header (chrome, matches the sidebar wallet chip) ---- */}
      <div className="wp-head">
        <span className="wp-avatar" />
        <div className="wp-id">
          <span>Signed in</span>
          <b>{wallet.address ? short(wallet.address) : "â€”"}</b>
        </div>
        <button className="wp-copy" onClick={() => wallet.address && copy(wallet.address, "addr")} aria-label="Copy address">
          {copied === "addr" ? "Copied âœ“" : "Copy"}
        </button>
      </div>

      {/* ---- display currency ---- */}
      <div className="wp-sect">
        <div className="wp-k">Display currency</div>
        <div className="wp-cur">
          {CURRENCIES.map((c) => (
            <button key={c.code} className={currency === c.code ? "on" : ""} onClick={() => onCurrency(c.code)} title={c.name}>
              <span aria-hidden>{c.flag}</span>{c.code}
            </button>
          ))}
        </div>
        {rateNote && <p className="wp-note">{rateNote}</p>}
      </div>

      {/* ---- contracts ---- */}
      <div className="wp-sect">
        <div className="wp-k">Contracts Â· RH Chain</div>
        <div className="wp-rows">
          {contracts.map((c) => (
            <div className="wp-row" key={c.label}>
              <span>{c.label}</span>
              <a href={c.link} target="_blank" rel="noreferrer" className="wp-mono">{c.value ? short(c.value) : "â€”"} â†—</a>
              <button className="wp-tiny" onClick={() => c.value && copy(c.value, c.label)} aria-label={`Copy ${c.label}`}>
                {copied === c.label ? "âœ“" : ic.copy}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ---- keys ---- */}
      <div className="wp-sect">
        <div className="wp-k">Security</div>
        <button className="wp-export" disabled={!wallet.address}
          onClick={async () => { setError(null); try { await exportWallet(); } catch (e) { setError(friendly(e)); } }}>
          {ic.key}<span>Export private key</span>
        </button>
        <div className="wp-warn">
          Anyone holding this key owns everything in the wallet â€” no recovery, no support desk.
          Privy shows it in its own window; it never passes through StocksPilot.
        </div>
      </div>

      {error && <div className="note err" style={{ margin: "0 0 12px" }}>{error}</div>}

      <div className="wp-foot">
        <button onClick={onClose}>Close</button>
        <button className="wp-signout" onClick={() => { wallet.disconnect(); onClose(); }}>Sign out</button>
      </div>
    </div>
  );
}

