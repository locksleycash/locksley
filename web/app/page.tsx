"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData, parseUnits } from "viem";
import { useWallet } from "./wallet.ts";
import { makeFormat } from "../src/money.ts";
import { STOCKS, USDG, USDG_DECIMALS, STOCK_DECIMALS } from "../src/stocks.ts";
import { poolFor } from "../src/pools.ts";
import {
  SAVINGS, PAYMENTS, LOAN, SGOV, SGOV_FEE, savingsAbi, paymentsAbi, loanAbi, erc20ApproveAbi,
  MAX_LTV_BPS, LIQ_THRESHOLD_BPS, BORROW_APR,
} from "../src/bank.ts";
import type { BankOrder } from "./api/bank/route.ts";
import { CandleChart, Spark, useSgovSeries } from "./dash.tsx";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const SLIP = 0.99; // 1% floor on the SGOV swaps

interface Bank {
  deployed: { savings: boolean; payments: boolean; loan: boolean };
  sgovPrice: number; usdg?: number;
  savings?: { freeShares: string; lockedSharesRaw: string; freeValue: number; lockedValue: number; unlockAt: number; free: number; locked: number };
  loan?: { debt: number; collateralValue: number; collToken: string; collFee: number; collateral: number; supplied: number; supplyShares: string };
  orders?: BankOrder[];
}

type Tab = "overview" | "save" | "pay" | "borrow";
const COLLATERAL = STOCKS.filter((s) => poolFor.has(s.symbol)).slice(0, 40);
const TERMS: [string, number][] = [["30 days", 30 * 86400], ["90 days", 90 * 86400], ["180 days", 180 * 86400]];
const INTERVALS: [string, number][] = [["Daily", 86400], ["Weekly", 7 * 86400], ["Monthly", 30 * 86400]];

export default function Page() {
  const wallet = useWallet();
  const fmt = useMemo(() => makeFormat("USD", 1), []);
  const [tab, setTab] = useState<Tab>("overview");
  const [b, setB] = useState<Bank | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sgovSeries = useSgovSeries();

  const load = useCallback(async (addr: string) => {
    try { const r = await fetch(`/api/bank${addr ? `?address=${addr}` : ""}`); setB(await r.json()); } catch { /* keep */ }
  }, []);
  useEffect(() => { void load(wallet.address ?? ""); }, [wallet.address, load]);

  const sgovPrice = b?.sgovPrice ?? 0;
  const usdg = b?.usdg ?? 0;
  const done = (text: string) => { setMsg({ ok: true, text }); void load(wallet.address ?? ""); };
  const fail = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); setMsg({ ok: false, text: /reject|denied/i.test(m) ? "You rejected the request." : /insufficient/i.test(m) ? "Not enough ETH for gas." : "Transaction failed." }); };
  const send = (to: `0x${string}`, data: `0x${string}`) => wallet.send({ to, data });

  const savingsVal = (b?.savings?.freeValue ?? 0) + (b?.savings?.lockedValue ?? 0);
  const total = savingsVal + (b?.loan?.supplied ?? 0);
  const HEAD: Record<Tab, string> = { overview: "Activity Dashboard", save: "Savings", pay: "Payments", borrow: "Borrow & Earn" };
  const NAV: [Tab, React.ReactNode][] = [
    ["overview", <path key="o" d="M3 10 12 4l9 6M5 10v9h14v-9M9 19v-5h6v5" />],
    ["save", <><circle key="c" cx="12" cy="12" r="8" /><path key="p" d="M12 8v8M9.5 10.2c0-1 1.1-1.7 2.5-1.7s2.5.7 2.5 1.7-1.1 1.5-2.5 1.9-2.5.9-2.5 1.9 1.1 1.7 2.5 1.7 2.5-.7 2.5-1.7" /></>],
    ["pay", <path key="s" d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />],
    ["borrow", <><path key="b" d="M3 10 12 4l9 6M4 10v8h16v-8" /><path key="c2" d="M8 18v-4M12 18v-4M16 18v-4" /></>],
  ];

  return (
    <div className="bnk">
      <div className="bshell">
        {/* ---- rail ---- */}
        <aside className="brail">
          <span className="brail-logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></svg></span>
          {NAV.map(([t, icon]) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => { setTab(t); setMsg(null); }} aria-label={HEAD[t]}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
            </button>
          ))}
          <span className="sp" />
          <span className="brail-av" />
        </aside>

        {/* ---- main ---- */}
        <main className="bmain">
          <div className="bhead">
            <h1>{HEAD[tab]}</h1>
            <span className="sp" />
            {wallet.address && <span className="bnk-usdg">Wallet: <b>{fmt(usdg)}</b> USDG</span>}
            {wallet.address
              ? <button className="bnk-btn ghost" onClick={() => wallet.disconnect()}>{short(wallet.address)}</button>
              : <button className="bnk-btn" onClick={() => void wallet.connect()} disabled={wallet.busy}>{wallet.busy ? "…" : "Connect"}</button>}
          </div>

          {msg && <div className={`bnk-msg ${msg.ok ? "ok" : "err"}`} style={{ marginBottom: 16, marginTop: 0 }}>{msg.text}</div>}

          {tab === "overview" && (
            <div className="bover">
              {/* left: balance card + actions + activity */}
              <div>
                <h2 className="bsec">Your account</h2>
                <div className="bbal">Total balance</div>
                <div className="bbal-row"><span className="bbal-v">{fmt(total)}</span></div>
                <div className="bcard">
                  <span className="visa">SAVE</span>
                  <span className="tag">HoodSave · Savings</span>
                  <span className="sp" />
                  <div className="nm">{wallet.address ? "Your vault" : "Not connected"}</div>
                  <div className="no">{wallet.address ? `${wallet.address.slice(2, 6)}  ${wallet.address.slice(6, 10)}  ${wallet.address.slice(10, 14)}  ${wallet.address.slice(-4)}` : "•••• •••• •••• ••••"}</div>
                  <div className="meta"><span>Backed by SGOV</span><span>Balance {fmt(savingsVal)}</span></div>
                </div>
                <div className="bacts">
                  <button className="bact primary" onClick={() => setTab("save")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg>Deposit</button>
                  <button className="bact" onClick={() => setTab("pay")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>Send</button>
                  <button className="bact" onClick={() => setTab("borrow")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9 12 4l9 5M5 9v9h14V9" /></svg>Borrow</button>
                </div>
                <h2 className="bsec" style={{ fontSize: 15, marginTop: 8 }}>Recent activity</h2>
                {!wallet.address ? <div className="bnk-empty">Connect a wallet to see activity.</div> : (
                  <div>
                    {savingsVal > 0 && <div className="btx"><span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 6v12M6 12l6 6 6-6" /></svg></span><div className="id"><b>Savings balance</b><span>SGOV-backed</span></div><span className="amt up">{fmt(savingsVal)}</span></div>}
                    {(b?.loan?.supplied ?? 0) > 0 && <div className="btx"><span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16v10H4zM4 11h16" /></svg></span><div className="id"><b>Lending supplied</b><span>earning interest</span></div><span className="amt up">{fmt(b?.loan?.supplied ?? 0)}</span></div>}
                    {(b?.loan?.debt ?? 0) > 0 && <div className="btx"><span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 3 9v11h18V9z" /></svg></span><div className="id"><b>Borrowed</b><span>against collateral</span></div><span className="amt down">−{fmt(b?.loan?.debt ?? 0)}</span></div>}
                    {(b?.orders ?? []).slice(0, 4).map((o) => (
                      <div className="btx" key={o.id}><span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14M12 5l7 7-7 7" /></svg></span><div className="id"><b>Pay → {short(o.recipient)}</b><span>every {Math.round(o.intervalS / 86400)}d · {o.open ? "active" : "done"}</span></div><span className="amt down">−{fmt(o.amount)}</span></div>
                    ))}
                    {savingsVal === 0 && (b?.loan?.supplied ?? 0) === 0 && (b?.loan?.debt ?? 0) === 0 && (b?.orders ?? []).length === 0 && <div className="bnk-empty">Nothing yet — deposit to get started.</div>}
                  </div>
                )}
              </div>

              {/* right: activity board */}
              <div className="bboard">
                <h2 className="bsec">Highlighted</h2>
                <div className="bhl">
                  <div className="bhl-card"><span className="bhl-ic">S</span><div className="bhl-id"><b>Savings</b><span>SGOV</span></div><span className="bhl-spark"><Spark points={sgovSeries} /></span><div className="bhl-v"><b>{fmt(savingsVal)}</b><span>balance</span></div></div>
                  <div className="bhl-card"><span className="bhl-ic">L</span><div className="bhl-id"><b>Lending</b><span>earn</span></div><span className="bhl-spark"><Spark points={sgovSeries} /></span><div className="bhl-v"><b>{fmt(b?.loan?.supplied ?? 0)}</b><span>supplied</span></div></div>
                  <div className="bhl-card"><span className="bhl-ic">B</span><div className="bhl-id"><b>Borrowed</b><span>debt</span></div><div className="bhl-v" style={{ marginLeft: "auto" }}><b>{fmt(b?.loan?.debt ?? 0)}</b><span>owed</span></div></div>
                  <div className="bhl-card"><span className="bhl-ic">$</span><div className="bhl-id"><b>SGOV</b><span>price</span></div><span className="bhl-spark"><Spark points={sgovSeries} /></span><div className="bhl-v"><b>{fmt(sgovPrice)}</b><span>now</span></div></div>
                </div>

                <CandleChart symbol="SGOV" />

                <div className="bres">
                  <div className="bres-card"><div className="k"><span>Lending reserve</span><a onClick={() => setTab("borrow")}>Manage</a></div><div className="v">{fmt(b?.loan?.supplied ?? 0)}</div><span className="chip">≈ {8}% APR</span></div>
                  <div className="bres-card"><div className="k"><span>Borrow capacity</span><a onClick={() => setTab("borrow")}>Use</a></div><div className="v">{fmt(Math.max(0, (b?.loan?.collateralValue ?? 0) * 0.5 - (b?.loan?.debt ?? 0)))}</div><span className="chip">up to 50% LTV</span></div>
                </div>
              </div>
            </div>
          )}

          {tab === "save" && <SaveTab b={b} fmt={fmt} usdg={usdg} sgovPrice={sgovPrice} busy={busy} setBusy={setBusy} send={send} done={done} fail={fail} wallet={wallet} />}
          {tab === "pay" && <PayTab b={b} fmt={fmt} busy={busy} setBusy={setBusy} send={send} done={done} fail={fail} wallet={wallet} />}
          {tab === "borrow" && <BorrowTab b={b} fmt={fmt} usdg={usdg} busy={busy} setBusy={setBusy} send={send} done={done} fail={fail} wallet={wallet} />}
        </main>
      </div>
    </div>
  );
}

type Common = {
  b: Bank | null; fmt: (n: number) => string; busy: string | null; setBusy: (s: string | null) => void;
  send: (to: `0x${string}`, data: `0x${string}`) => Promise<`0x${string}`>; done: (t: string) => void; fail: (e: unknown) => void;
  wallet: ReturnType<typeof useWallet>;
};

// ---------------------------------------------------------------- Save

function SaveTab({ b, fmt, usdg, sgovPrice, busy, setBusy, send, done, fail, wallet }: Common & { usdg: number; sgovPrice: number }) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"open" | "locked">("open");
  const [term, setTerm] = useState(TERMS[0][1]);
  const [wamount, setWamount] = useState("");
  const deployed = b?.deployed.savings;
  const free = b?.savings?.freeValue ?? 0;
  const locked = b?.savings?.lockedValue ?? 0;
  const unlockAt = b?.savings?.unlockAt ?? 0;
  const amt = Number(amount) || 0;

  const deposit = async () => {
    if (!SAVINGS || !wallet.address || amt <= 0 || sgovPrice <= 0) return;
    setBusy("Depositing…");
    try {
      const raw = parseUnits(amt.toFixed(USDG_DECIMALS), USDG_DECIMALS);
      const minSgov = parseUnits(((amt / sgovPrice) * SLIP).toFixed(STOCK_DECIMALS), STOCK_DECIMALS);
      await send(USDG as `0x${string}`, encodeFunctionData({ abi: erc20ApproveAbi, functionName: "approve", args: [SAVINGS, raw] }));
      const data = mode === "locked"
        ? encodeFunctionData({ abi: savingsAbi, functionName: "depositLocked", args: [raw, minSgov, BigInt(term)] })
        : encodeFunctionData({ abi: savingsAbi, functionName: "deposit", args: [raw, minSgov] });
      await send(SAVINGS, data);
      setAmount(""); done(mode === "locked" ? "Locked deposit added." : "Deposited to savings.");
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const withdraw = async () => {
    if (!SAVINGS || !wallet.address || !b?.savings || sgovPrice <= 0) return;
    const w = Number(wamount) || 0; if (w <= 0) return;
    setBusy("Withdrawing…");
    try {
      const shares = w >= free ? BigInt(b.savings.freeShares) : parseUnits((w / sgovPrice).toFixed(STOCK_DECIMALS), STOCK_DECIMALS);
      const minUsdg = parseUnits((w * SLIP).toFixed(USDG_DECIMALS), USDG_DECIMALS);
      await send(SAVINGS, encodeFunctionData({ abi: savingsAbi, functionName: "withdraw", args: [shares, minUsdg] }));
      setWamount(""); done("Withdrawn to your wallet.");
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  return (
    <div className="bnk-grid">
      <div className="bnk-card">
        <h3>Savings</h3>
        <p className="sub">Your USDG is held as SGOV — short U.S. treasuries — so the balance grows on its own. Withdraw the free part any time.</p>
        <div className="bnk-kv"><span>Free balance</span><b>{fmt(free)}</b></div>
        <div className="bnk-kv"><span>Locked balance</span><b>{fmt(locked)}{unlockAt > 0 && locked > 0 ? ` · until ${new Date(unlockAt * 1000).toLocaleDateString()}` : ""}</b></div>
        <div className="bnk-kv"><span>Yield source</span><b>SGOV t-bills</b></div>
        <div style={{ marginTop: 16 }}>
          <div className="bnk-fk"><span>Withdraw (USDG)</span>{free > 0 && <button onClick={() => setWamount(String(Math.floor(free * 100) / 100))}>MAX {fmt(free)}</button>}</div>
          <div className="bnk-inp"><input type="number" min="0" step="any" placeholder="0.00" value={wamount} onChange={(e) => setWamount(e.target.value)} /><span className="unit">USDG</span></div>
          <button className="bnk-btn ghost wide" style={{ marginTop: 10 }} disabled={!deployed || !wallet.address || !!busy || !(Number(wamount) > 0)} onClick={withdraw}>{busy ?? "Withdraw"}</button>
        </div>
      </div>

      <div className="bnk-card">
        <h3>Deposit</h3>
        <p className="sub">{deployed ? "Add USDG to your savings." : "The savings vault isn't deployed yet — this opens once it is."}</p>
        <div className="bnk-seg">
          <button className={mode === "open" ? "on" : ""} onClick={() => setMode("open")}>Flexible</button>
          <button className={mode === "locked" ? "on" : ""} onClick={() => setMode("locked")}>Locked</button>
        </div>
        <div className="bnk-field">
          <div className="bnk-fk"><span>Amount</span>{usdg > 0 && <button onClick={() => setAmount(String(Math.floor(usdg * 100) / 100))}>MAX {fmt(usdg)}</button>}</div>
          <div className="bnk-inp"><input type="number" min="0" step="any" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /><span className="unit">USDG</span></div>
        </div>
        {mode === "locked" && (
          <div className="bnk-field">
            <div className="bnk-fk"><span>Lock term</span></div>
            <div className="bnk-inp"><select value={term} onChange={(e) => setTerm(Number(e.target.value))}>{TERMS.map(([l, s]) => <option key={s} value={s}>{l}</option>)}</select></div>
          </div>
        )}
        <button className="bnk-btn wide" disabled={!deployed || !wallet.address || !!busy || amt <= 0 || amt > usdg + 1e-9} onClick={deposit}>{busy ?? (!wallet.address ? "Connect wallet" : mode === "locked" ? "Lock & deposit" : "Deposit")}</button>
        <p className="bnk-note">{sgovPrice > 0 ? `1 SGOV ≈ ${fmt(sgovPrice)} · ` : ""}Yield is SGOV appreciating vs USDG — real, not promised. Non-custodial: only you can withdraw.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Pay

function PayTab({ b, fmt, busy, setBusy, send, done, fail, wallet }: Common) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [interval, setInterval_] = useState(INTERVALS[1][1]);
  const [count, setCount] = useState("6");
  const deployed = b?.deployed.payments;
  const orders = b?.orders ?? [];
  const amt = Number(amount) || 0; const n = Number(count) || 0;
  const valid = /^0x[a-fA-F0-9]{40}$/.test(to.trim()) && amt > 0 && n > 0;

  const create = async () => {
    if (!PAYMENTS || !wallet.address || !valid) return;
    setBusy("Scheduling…");
    try {
      const each = parseUnits(amt.toFixed(USDG_DECIMALS), USDG_DECIMALS);
      const budget = each * BigInt(n);
      await send(USDG as `0x${string}`, encodeFunctionData({ abi: erc20ApproveAbi, functionName: "approve", args: [PAYMENTS, budget] }));
      await send(PAYMENTS, encodeFunctionData({ abi: paymentsAbi, functionName: "create", args: [USDG as `0x${string}`, to.trim() as `0x${string}`, each, BigInt(interval), n, 0n, 0n] }));
      setTo(""); setAmount(""); done("Standing order created.");
    } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const cancel = async (id: number) => {
    if (!PAYMENTS) return; setBusy("Cancelling…");
    try { await send(PAYMENTS, encodeFunctionData({ abi: paymentsAbi, functionName: "cancel", args: [BigInt(id)] })); done("Order cancelled, remainder refunded."); }
    catch (e) { fail(e); } finally { setBusy(null); }
  };
  const every = (s: number) => (s === 86400 ? "day" : s === 604800 ? "week" : s === 2592000 ? "month" : `${Math.round(s / 86400)}d`);

  return (
    <div className="bnk-grid">
      <div className="bnk-card">
        <h3>New standing order</h3>
        <p className="sub">{deployed ? "Escrow USDG and it pays out on schedule — rent, salary, an allowance. Cancel any time, the rest comes back." : "Payments aren't deployed yet."}</p>
        <div className="bnk-field"><div className="bnk-fk"><span>Recipient address</span></div><div className="bnk-inp"><input placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} style={{ fontSize: 13 }} /></div></div>
        <div className="bnk-row2">
          <div className="bnk-field"><div className="bnk-fk"><span>Amount each</span></div><div className="bnk-inp"><input type="number" min="0" step="any" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /><span className="unit">USDG</span></div></div>
          <div className="bnk-field"><div className="bnk-fk"><span>Payments</span></div><div className="bnk-inp"><input type="number" min="1" step="1" value={count} onChange={(e) => setCount(e.target.value)} /><span className="unit">×</span></div></div>
        </div>
        <div className="bnk-field"><div className="bnk-fk"><span>Every</span></div><div className="bnk-inp"><select value={interval} onChange={(e) => setInterval_(Number(e.target.value))}>{INTERVALS.map(([l, s]) => <option key={s} value={s}>{l}</option>)}</select></div></div>
        <button className="bnk-btn wide" disabled={!deployed || !wallet.address || !!busy || !valid} onClick={create}>{busy ?? (!wallet.address ? "Connect wallet" : `Escrow ${fmt(amt * n)} & schedule`)}</button>
      </div>

      <div className="bnk-card">
        <h3>Your orders</h3>
        <p className="sub">Scheduled payments from this wallet.</p>
        {!wallet.address ? <div className="bnk-empty">Connect a wallet to see your orders.</div>
          : orders.length === 0 ? <div className="bnk-empty">No standing orders yet.</div>
          : orders.map((o) => (
            <div className="bnk-order" key={o.id}>
              <div><b>{fmt(o.amount)} → {short(o.recipient)}</b><span>every {every(o.intervalS)} · {fmt(o.remaining)} left{o.open ? ` · next ${new Date(o.nextDue * 1000).toLocaleDateString()}` : ""}</span></div>
              <span className={`bnk-tag ${o.open ? "open" : "done"}`}>{o.open ? "Active" : "Done"}</span>
              {o.open ? <button className="cancel" disabled={!!busy} onClick={() => cancel(o.id)}>Cancel</button> : <span />}
            </div>
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Borrow

function BorrowTab({ b, fmt, usdg, busy, setBusy, send, done, fail, wallet }: Common & { usdg: number }) {
  const [sup, setSup] = useState("");
  const [red, setRed] = useState("");
  const [collSym, setCollSym] = useState(COLLATERAL[0]?.symbol ?? "");
  const [collAmt, setCollAmt] = useState("");
  const [borrowAmt, setBorrowAmt] = useState("");
  const [repayAmt, setRepayAmt] = useState("");
  const deployed = b?.deployed.loan;
  const L = b?.loan;
  const coll = COLLATERAL.find((s) => s.symbol === collSym);
  const collFee = coll ? poolFor.get(coll.symbol)?.fee ?? 3000 : 3000;

  const debt = L?.debt ?? 0; const collVal = L?.collateralValue ?? 0;
  const maxBorrow = collVal * MAX_LTV_BPS / 10000;
  const healthPct = collVal > 0 ? Math.min(100, (debt / (collVal * LIQ_THRESHOLD_BPS / 10000)) * 100) : 0;
  const healthColor = healthPct < 60 ? "var(--em)" : healthPct < 90 ? "var(--amber)" : "var(--rose)";

  const supply = async () => {
    if (!LOAN || !wallet.address) return; const a = Number(sup) || 0; if (a <= 0) return;
    setBusy("Supplying…");
    try { const raw = parseUnits(a.toFixed(USDG_DECIMALS), USDG_DECIMALS);
      await send(USDG as `0x${string}`, encodeFunctionData({ abi: erc20ApproveAbi, functionName: "approve", args: [LOAN, raw] }));
      await send(LOAN, encodeFunctionData({ abi: loanAbi, functionName: "supply", args: [raw] }));
      setSup(""); done("Supplied to the lending pool.");
    } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const redeem = async () => {
    if (!LOAN || !wallet.address || !L) return; const a = Number(red) || 0; if (a <= 0) return;
    setBusy("Redeeming…");
    try {
      const sh = a >= L.supplied ? BigInt(L.supplyShares) : parseUnits((a * Number(L.supplyShares) / (L.supplied * 1e18)).toFixed(0), 0);
      await send(LOAN, encodeFunctionData({ abi: loanAbi, functionName: "redeem", args: [sh] }));
      setRed(""); done("Redeemed to your wallet.");
    } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const addCollateral = async () => {
    if (!LOAN || !wallet.address || !coll) return; const a = Number(collAmt) || 0; if (a <= 0) return;
    setBusy("Adding collateral…");
    try { const raw = parseUnits(a.toFixed(STOCK_DECIMALS), STOCK_DECIMALS);
      await send(coll.address as `0x${string}`, encodeFunctionData({ abi: erc20ApproveAbi, functionName: "approve", args: [LOAN, raw] }));
      await send(LOAN, encodeFunctionData({ abi: loanAbi, functionName: "depositCollateral", args: [coll.address as `0x${string}`, collFee, raw] }));
      setCollAmt(""); done(`${coll.symbol} added as collateral.`);
    } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const borrow = async () => {
    if (!LOAN || !wallet.address) return; const a = Number(borrowAmt) || 0; if (a <= 0) return;
    setBusy("Borrowing…");
    try { await send(LOAN, encodeFunctionData({ abi: loanAbi, functionName: "borrow", args: [parseUnits(a.toFixed(USDG_DECIMALS), USDG_DECIMALS)] })); setBorrowAmt(""); done("Borrowed USDG to your wallet."); }
    catch (e) { fail(e); } finally { setBusy(null); }
  };
  const repay = async () => {
    if (!LOAN || !wallet.address) return; const a = Number(repayAmt) || 0; if (a <= 0) return;
    setBusy("Repaying…");
    try { const raw = parseUnits(a.toFixed(USDG_DECIMALS), USDG_DECIMALS);
      await send(USDG as `0x${string}`, encodeFunctionData({ abi: erc20ApproveAbi, functionName: "approve", args: [LOAN, raw] }));
      await send(LOAN, encodeFunctionData({ abi: loanAbi, functionName: "repay", args: [raw] }));
      setRepayAmt(""); done("Repaid.");
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  return (
    <div className="bnk-grid">
      <div className="bnk-card">
        <h3>Earn — lend USDG</h3>
        <p className="sub">{deployed ? `Supply USDG for borrowers to draw against; you earn the ~${BORROW_APR}% borrow interest.` : "Lending isn't deployed yet."}</p>
        <div className="bnk-kv"><span>Your supplied</span><b>{fmt(L?.supplied ?? 0)}</b></div>
        <div className="bnk-field" style={{ marginTop: 12 }}><div className="bnk-fk"><span>Supply</span>{usdg > 0 && <button onClick={() => setSup(String(Math.floor(usdg * 100) / 100))}>MAX</button>}</div><div className="bnk-inp"><input type="number" min="0" step="any" placeholder="0.00" value={sup} onChange={(e) => setSup(e.target.value)} /><span className="unit">USDG</span></div></div>
        <button className="bnk-btn wide" disabled={!deployed || !wallet.address || !!busy || !(Number(sup) > 0)} onClick={supply}>{busy ?? "Supply"}</button>
        {(L?.supplied ?? 0) > 0 && (
          <>
            <div className="bnk-field" style={{ marginTop: 12 }}><div className="bnk-fk"><span>Redeem</span><button onClick={() => setRed(String(Math.floor((L?.supplied ?? 0) * 100) / 100))}>MAX</button></div><div className="bnk-inp"><input type="number" min="0" step="any" placeholder="0.00" value={red} onChange={(e) => setRed(e.target.value)} /><span className="unit">USDG</span></div></div>
            <button className="bnk-btn ghost wide" disabled={!!busy || !(Number(red) > 0)} onClick={redeem}>{busy ?? "Redeem"}</button>
          </>
        )}
      </div>

      <div className="bnk-card">
        <h3>Borrow against stocks</h3>
        <p className="sub">{deployed ? `Post a stock as collateral and borrow up to ${MAX_LTV_BPS / 100}% of its value — without selling.` : "Borrowing isn't deployed yet."}</p>
        {collVal > 0 && (
          <>
            <div className="bnk-kv"><span>Collateral{L?.collateral ? ` · ${L.collateral} shares` : ""}</span><b>{fmt(collVal)}</b></div>
            <div className="bnk-kv"><span>Debt</span><b>{fmt(debt)}</b></div>
            <div className="bnk-kv"><span>Borrowable left</span><b>{fmt(Math.max(0, maxBorrow - debt))}</b></div>
            <div className="bnk-health"><span style={{ width: `${healthPct}%`, background: healthColor }} /></div>
            <p className="bnk-note" style={{ marginTop: 2 }}>Liquidated if debt passes {LIQ_THRESHOLD_BPS / 100}% of collateral. Keep this bar out of the red.</p>
          </>
        )}
        <div className="bnk-row2" style={{ marginTop: 12 }}>
          <div className="bnk-field"><div className="bnk-fk"><span>Collateral</span></div><div className="bnk-inp"><select value={collSym} onChange={(e) => setCollSym(e.target.value)} disabled={!!L?.collateral && L.collToken.toLowerCase() !== (coll?.address.toLowerCase() ?? "")}>{COLLATERAL.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}</select></div></div>
          <div className="bnk-field"><div className="bnk-fk"><span>Shares</span></div><div className="bnk-inp"><input type="number" min="0" step="any" placeholder="0.0" value={collAmt} onChange={(e) => setCollAmt(e.target.value)} /></div></div>
        </div>
        <button className="bnk-btn ghost wide" disabled={!deployed || !wallet.address || !!busy || !(Number(collAmt) > 0)} onClick={addCollateral}>{busy ?? "Add collateral"}</button>
        <div className="bnk-row2" style={{ marginTop: 12 }}>
          <div className="bnk-field"><div className="bnk-fk"><span>Borrow</span></div><div className="bnk-inp"><input type="number" min="0" step="any" placeholder="0.00" value={borrowAmt} onChange={(e) => setBorrowAmt(e.target.value)} /><span className="unit">USDG</span></div><button className="bnk-btn wide" style={{ marginTop: 8 }} disabled={!deployed || !!busy || !(Number(borrowAmt) > 0)} onClick={borrow}>{busy ?? "Borrow"}</button></div>
          <div className="bnk-field"><div className="bnk-fk"><span>Repay</span>{debt > 0 && <button onClick={() => setRepayAmt(String(Math.ceil(debt * 100) / 100))}>ALL</button>}</div><div className="bnk-inp"><input type="number" min="0" step="any" placeholder="0.00" value={repayAmt} onChange={(e) => setRepayAmt(e.target.value)} /><span className="unit">USDG</span></div><button className="bnk-btn ghost wide" style={{ marginTop: 8 }} disabled={!!busy || !(Number(repayAmt) > 0)} onClick={repay}>{busy ?? "Repay"}</button></div>
        </div>
      </div>
    </div>
  );
}
