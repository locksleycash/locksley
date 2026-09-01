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

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const SLIP = 0.99; // 1% floor on the SGOV swaps

interface Bank {
  deployed: { savings: boolean; payments: boolean; loan: boolean };
  sgovPrice: number; usdg?: number;
  savings?: { freeShares: string; lockedSharesRaw: string; freeValue: number; lockedValue: number; unlockAt: number; free: number; locked: number };
  loan?: { debt: number; collateralValue: number; collToken: string; collFee: number; collateral: number; supplied: number; supplyShares: string };
  orders?: BankOrder[];
}

type Tab = "save" | "pay" | "borrow";
const COLLATERAL = STOCKS.filter((s) => poolFor.has(s.symbol)).slice(0, 40);
const TERMS: [string, number][] = [["30 days", 30 * 86400], ["90 days", 90 * 86400], ["180 days", 180 * 86400]];
const INTERVALS: [string, number][] = [["Daily", 86400], ["Weekly", 7 * 86400], ["Monthly", 30 * 86400]];

export default function Page() {
  const wallet = useWallet();
  const fmt = useMemo(() => makeFormat("USD", 1), []);
  const [tab, setTab] = useState<Tab>("save");
  const [b, setB] = useState<Bank | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (addr: string) => {
    try { const r = await fetch(`/api/bank${addr ? `?address=${addr}` : ""}`); setB(await r.json()); } catch { /* keep */ }
  }, []);
  useEffect(() => { void load(wallet.address ?? ""); }, [wallet.address, load]);

  const sgovPrice = b?.sgovPrice ?? 0;
  const usdg = b?.usdg ?? 0;
  const done = (text: string) => { setMsg({ ok: true, text }); void load(wallet.address ?? ""); };
  const fail = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); setMsg({ ok: false, text: /reject|denied/i.test(m) ? "You rejected the request." : /insufficient/i.test(m) ? "Not enough ETH for gas." : "Transaction failed." }); };
  const send = (to: `0x${string}`, data: `0x${string}`) => wallet.send({ to, data });

  return (
    <div className="bnk">
      <div className="bnk-wrap">
        <nav className="bnk-nav">
          <div className="bnk-brand">
            <span className="bnk-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10 12 4l9 6" /><path d="M5 10v9h14v-9" /><path d="M9 19v-5h6v5" /></svg></span>
            <span>HoodSave</span>
          </div>
          <span className="sp" />
          {wallet.address && <span className="bnk-usdg">Wallet: <b>{fmt(usdg)}</b> USDG</span>}
          {wallet.address
            ? <button className="bnk-btn ghost" onClick={() => wallet.disconnect()}>{short(wallet.address)}</button>
            : <button className="bnk-btn" onClick={() => void wallet.connect()} disabled={wallet.busy}>{wallet.busy ? "…" : "Connect"}</button>}
        </nav>

        {/* balance hero */}
        <div className="bnk-hero">
          <div className="k">Total balance</div>
          <div className="v">{fmt((b?.savings?.freeValue ?? 0) + (b?.savings?.lockedValue ?? 0) + (b?.loan?.supplied ?? 0))}</div>
          <div className="s">Savings, locked deposits and lending — earning on-chain, always yours.</div>
          <div className="bnk-hero-row">
            <div><span>Savings</span><b>{fmt((b?.savings?.freeValue ?? 0) + (b?.savings?.lockedValue ?? 0))}</b></div>
            <div><span>Lending</span><b>{fmt(b?.loan?.supplied ?? 0)}</b></div>
            <div><span>Borrowed</span><b>{fmt(b?.loan?.debt ?? 0)}</b></div>
            <div><span>Wallet USDG</span><b>{fmt(usdg)}</b></div>
          </div>
        </div>

        <div className="bnk-tabs">
          {(["save", "pay", "borrow"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => { setTab(t); setMsg(null); }}>
              {t === "save" ? "Save" : t === "pay" ? "Payments" : "Borrow"}
            </button>
          ))}
        </div>

        {msg && <div className={`bnk-msg ${msg.ok ? "ok" : "err"}`} style={{ marginBottom: 16, marginTop: 0 }}>{msg.text}</div>}

        {tab === "save" && <SaveTab b={b} fmt={fmt} usdg={usdg} sgovPrice={sgovPrice} busy={busy} setBusy={setBusy} send={send} done={done} fail={fail} wallet={wallet} />}
        {tab === "pay" && <PayTab b={b} fmt={fmt} busy={busy} setBusy={setBusy} send={send} done={done} fail={fail} wallet={wallet} />}
        {tab === "borrow" && <BorrowTab b={b} fmt={fmt} usdg={usdg} busy={busy} setBusy={setBusy} send={send} done={done} fail={fail} wallet={wallet} />}

        <footer className="bnk-foot">
          <span>HoodSave · non-custodial banking on RH Chain</span>
          <span>Savings backed by SGOV (t-bills) · no admin · no fees</span>
        </footer>
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
