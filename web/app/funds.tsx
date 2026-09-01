"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createPublicClient, encodeFunctionData, http, parseUnits } from "viem";
import { robinhoodChain } from "../src/chain.ts";
import { friendly, type Wallet } from "./wallet.ts";

const reader = createPublicClient({ chain: robinhoodChain, transport: http("/api/rpc") });

type Tab = "send" | "receive" | "deposit";
type Stage = "idle" | "quoting" | "signing" | "landing" | "done";

const erc20 = [
  {
    type: "function", name: "transfer", stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }],
  },
] as const;

export interface Holding {
  symbol: string;
  address: `0x${string}`;
  amount: number;
  decimals: number;
}

export function FundsPanel({
  tab,
  wallet,
  holdings,
  onClose,
  onDone,
}: {
  tab: Tab;
  wallet: Wallet;
  holdings: Holding[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [view, setView] = useState<Tab>(tab);
  const [copied, setCopied] = useState(false);

  return (
    <div className="sheet" role="dialog" aria-label="Move funds">
      <div className="sheet-head">
        <div>
          <div className="sym">Your balance</div>
          <div className="nm">Send, receive or top up</div>
        </div>
        <button onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="seg">
        <button className={view === "send" ? "on" : ""} onClick={() => setView("send")}>Send</button>
        <button className={view === "receive" ? "on" : ""} onClick={() => setView("receive")}>Receive</button>
        <button className={view === "deposit" ? "on" : ""} onClick={() => setView("deposit")}>Buy USDG</button>
      </div>

      {!wallet.address ? (
        <>
          <p className="sub" style={{ fontSize: 13 }}>Connect a wallet first — there is nothing to move yet.</p>
          <button className="primary wide" onClick={wallet.connect} disabled={wallet.busy}>
            {wallet.busy ? "Connecting…" : "Connect wallet"}
          </button>
        </>
      ) : view === "receive" ? (
        <Receive address={wallet.address} copied={copied} setCopied={setCopied} />
      ) : view === "send" ? (
        <Send wallet={wallet} holdings={holdings} onDone={onDone} />
      ) : (
        <Deposit wallet={wallet} onDone={onDone} />
      )}
    </div>
  );
}

/** Sends USDG or any held stock to another address on Robinhood Chain. */
function Send({
  wallet,
  holdings,
  onDone,
}: {
  wallet: Wallet;
  holdings: Holding[];
  onDone: () => void;
}) {
  const [pick, setPick] = useState(0);
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | null>(null);

  const asset = holdings[pick];
  const busy = stage === "signing" || stage === "landing";
  const value = Number(amount);
  const toOk = /^0x[a-fA-F0-9]{40}$/.test(to.trim());
  const amountOk = value > 0 && asset && value <= asset.amount;
  // Sending to yourself burns gas and changes nothing; sending to the token
  // itself is how people lose funds forever.
  const selfSend = toOk && to.trim().toLowerCase() === wallet.address?.toLowerCase();

  const run = useCallback(async () => {
    if (!asset || !amountOk || !toOk) return;
    setError(null);
    setHash(null);
    try {
      setStage("signing");
      const h = await wallet.send({
        to: asset.address,
        data: encodeFunctionData({
          abi: erc20,
          functionName: "transfer",
          args: [to.trim() as `0x${string}`, parseUnits(amount, asset.decimals)],
        }),
      });
      setHash(h);
      setStage("landing");
      const receipt = await reader.waitForTransactionReceipt({ hash: h });
      if (receipt.status !== "success") throw new Error("The transfer reverted on-chain");
      setStage("done");
      setAmount("");
      onDone();
    } catch (e) {
      setError(friendly(e));
      setStage("idle");
    }
  }, [asset, amount, to, amountOk, toOk, wallet, onDone]);

  if (!holdings.length) {
    return <p className="sub" style={{ fontSize: 13 }}>Nothing to send — this wallet is empty.</p>;
  }

  return (
    <>
      <label className="field">
        <span>Asset</span>
        <div className="fieldrow">
          <select
            className="picker"
            value={pick}
            onChange={(e) => { setPick(Number(e.target.value)); setAmount(""); }}
            disabled={busy}
          >
            {holdings.map((h, i) => (
              <option key={h.address} value={i}>
                {h.symbol} — {h.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })}
              </option>
            ))}
          </select>
        </div>
      </label>

      <label className="field">
        <span>Amount</span>
        <div className="fieldrow">
          <input
            type="text" inputMode="decimal" placeholder="0.00" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            disabled={busy} spellCheck={false}
          />
          <button className="max" onClick={() => setAmount(String(asset.amount))} disabled={busy}>
            Max
          </button>
        </div>
      </label>

      <label className="field">
        <span>To address</span>
        <div className="fieldrow">
          <input
            type="text" placeholder="0x…" value={to}
            onChange={(e) => setTo(e.target.value.trim())}
            disabled={busy} spellCheck={false}
            style={{ fontSize: 14, fontWeight: 400 }}
          />
        </div>
      </label>

      {to && !toOk && <div className="alert">That is not a valid address.</div>}
      {selfSend && <div className="warn">This is your own address — the transfer would only cost gas.</div>}
      {value > 0 && asset && value > asset.amount && (
        <div className="alert">You hold {asset.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} {asset.symbol}.</div>
      )}
      {error && <div className="alert">{error}</div>}
      {stage === "done" && hash && (
        <div className="ok">
          Sent —{" "}
          <a href={`https://robinhoodchain.blockscout.com/tx/${hash}`} target="_blank" rel="noreferrer">
            view on explorer ↗
          </a>
        </div>
      )}

      <button className="primary wide" onClick={run} disabled={!amountOk || !toOk || busy}>
        {stage === "signing" ? "Sign in your wallet…" : stage === "landing" ? "Confirming…" : `Send ${asset?.symbol ?? ""}`}
      </button>
      <p className="sub" style={{ fontSize: 12, marginTop: 8 }}>
        Transfers are final. There is no reversal and nobody can undo an address typed wrong.
      </p>
    </>
  );
}

function Receive({
  address,
  copied,
  setCopied,
}: {
  address: string;
  copied: boolean;
  setCopied: (v: boolean) => void;
}) {
  return (
    <>
      <div className="qrbox">
        {/* Plain address, not an EIP-681 URI: wallets disagree on how to read
            those, and a QR that scans into the wrong chain sends money nowhere. */}
        <QRCodeSVG value={address} size={168} bgColor="#ffffff" fgColor="#0b0d0c" level="M" includeMargin />
      </div>

      <div className="field">
        <span>Your address on RH Chain</span>
        <div className="addrbox">
          <code>{address}</code>
          <button
            className={copied ? "primary" : ""}
            onClick={() => {
              void navigator.clipboard.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="warn">
        Send <b>USDG on RH Chain</b> only. The same address exists on other networks, but
        anything sent there will not show up here.
      </div>
      <p className="sub" style={{ fontSize: 12, marginTop: 10 }}>
        Keep a little ETH here too — every trade pays gas in ETH, though a fraction of a cent covers it.
      </p>
    </>
  );
}

interface Quote {
  route: string;
  amountOutFormatted: string;
  minOutFormatted: string;
  slippageBps: number;
  tx: { to: `0x${string}`; data: `0x${string}`; value: string };
}

/**
 * ETH into USDG, without leaving Robinhood Chain.
 *
 * Deliberately not a bridge. Everything here settles on one chain, so there is
 * no network to switch to, no intent to wait on, and no way to end up holding
 * funds somewhere the rest of the app cannot see them.
 */
function Deposit({ wallet, onDone }: { wallet: Wallet; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | null>(null);
  const seq = useRef(0);

  const busy = stage === "signing" || stage === "landing";

  useEffect(() => {
    if (busy) return;
    const v = amount.trim();
    if (!v || Number(v) <= 0 || !wallet.address) {
      setQuote(null);
      setError(null);
      return;
    }
    const mine = ++seq.current;
    setStage("quoting");
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            symbol: "USDG", side: "buy", payWith: "ETH",
            amount: v, recipient: wallet.address,
          }),
        });
        const j = await r.json();
        if (mine !== seq.current) return;
        if (!r.ok) { setQuote(null); setError(j.error ?? "Couldn't price that"); }
        else { setQuote(j as Quote); setError(null); }
      } catch {
        if (mine === seq.current) setError("Couldn't reach the pricing service");
      } finally {
        if (mine === seq.current) setStage("idle");
      }
    }, 350);
    return () => clearTimeout(t);
  }, [amount, wallet.address, busy]);

  const run = useCallback(async () => {
    if (!quote) return;
    setError(null);
    setHash(null);
    try {
      setStage("signing");
      const h = await wallet.send({
        to: quote.tx.to,
        data: quote.tx.data,
        value: BigInt(quote.tx.value),
      });
      setHash(h);
      setStage("landing");
      const receipt = await reader.waitForTransactionReceipt({ hash: h });
      if (receipt.status !== "success") throw new Error("The swap reverted on-chain");

      setStage("done");
      setAmount("");
      setQuote(null);
      onDone();
    } catch (e) {
      setError(friendly(e));
      setStage("idle");
    }
  }, [quote, wallet, onDone]);

  return (
    <>
      <p className="sub" style={{ fontSize: 13, margin: "0 0 12px" }}>
        Turn ETH you already hold on RH Chain into USDG. One chain, one signature — nothing
        is bridged anywhere.
      </p>

      <label className="field">
        <span>Spend (ETH)</span>
        <div className="fieldrow">
          <input
            type="text" inputMode="decimal" placeholder="0.01" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            disabled={busy} spellCheck={false}
          />
        </div>
      </label>

      <div className="quote">
        {stage === "quoting" && <span className="dim">Pricing…</span>}
        {quote && stage !== "quoting" && (
          <>
            <div className="qrow">
              <span>You receive</span>
              <b>
                {Number(quote.amountOutFormatted).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDG
              </b>
            </div>
            <div className="qrow dim">
              <span>Minimum after {quote.slippageBps / 100}% slippage</span>
              <span>{Number(quote.minOutFormatted).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="qrow dim"><span>Route</span><span>{quote.route}</span></div>
          </>
        )}
        {!quote && stage === "idle" && !error && (
          <span className="dim">Enter an amount to see a price.</span>
        )}
      </div>

      {error && <div className="alert">{error}</div>}
      {stage === "done" && hash && (
        <div className="ok">
          Done —{" "}
          <a href={`https://robinhoodchain.blockscout.com/tx/${hash}`} target="_blank" rel="noreferrer">
            view on explorer ↗
          </a>
        </div>
      )}

      <button className="primary wide" onClick={run} disabled={!quote || busy}>
        {stage === "signing" ? "Sign in your wallet…" : stage === "landing" ? "Confirming…" : "Buy USDG"}
      </button>
      <p className="sub" style={{ fontSize: 12, marginTop: 8 }}>
        Keep a little ETH back — gas is paid in ETH, so spending all of it strands the wallet.
      </p>
    </>
  );
}

