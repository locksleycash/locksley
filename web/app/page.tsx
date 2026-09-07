"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { CandleChart, Donut, Spark, useSgovSeries } from "./dash.tsx";
import { StockLogo } from "./logo.tsx";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const SLIP = 0.99; // 1% floor on the SGOV swaps

interface Bank {
  deployed: { savings: boolean; payments: boolean; loan: boolean };
  sgovPrice: number; usdg?: number;
  savings?: { freeShares: string; lockedSharesRaw: string; freeValue: number; lockedValue: number; unlockAt: number; free: number; locked: number };
  loan?: { debt: number; collateralValue: number; collToken: string; collFee: number; collateral: number; supplied: number; supplyShares: string };
  orders?: BankOrder[];
}

type Tab = "overview" | "save" | "pay" | "borrow" | "live";

interface StatAct { kind: string; user: string; detail: string; tx: string; block: number }
interface Stats {
  live: { savings: boolean; payments: boolean; loan: boolean };
  sgovPrice: number; savingsTvl: number; lendingReserve: number; totalBorrowed: number;
  activeOrders: number; escrowed: number; participants: number; activity: StatAct[];
}
const COLLATERAL = STOCKS.filter((s) => poolFor.has(s.symbol)).slice(0, 40);
const TERMS: [string, number][] = [["30 days", 30 * 86400], ["90 days", 90 * 86400], ["180 days", 180 * 86400]];
const INTERVALS: [string, number][] = [["Daily", 86400], ["Weekly", 7 * 86400], ["Monthly", 30 * 86400]];

/** The header banner each menu opens with; Live Stats runs without one. */
const BANNER: Record<Tab, string> = { overview: "overview", save: "save", pay: "pay", borrow: "borrow", live: "" };

/** Which part of the bank an event came from. */
const GRP: Record<string, string> = {
  Deposited: "Savings", Withdrawn: "Savings",
  Created: "Payments", Paid: "Payments",
  Supplied: "Loan", Borrowed: "Loan", Repaid: "Loan", Liquidated: "Loan",
};

/** label, destination tab, icon path */
const QUICK: [string, string, string][] = [
  ["Deposit", "save", "M12 5v12M6 12l6 6 6-6"],
  ["Withdraw", "save", "M12 19V7M6 12l6-6 6 6"],
  ["Lock", "save", "M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z"],
  ["Send", "pay", "M5 12h14M12 5l7 7-7 7"],
  ["Schedule", "pay", "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7.5V12l3.2 2"],
  ["Lend", "borrow", "M4 7h16v10H4zM4 11h16"],
  ["Borrow", "borrow", "M3 9l9-5 9 5M5 9v9h14V9"],
  ["Live", "live", "M3 12h4l2.5-6 4 12 2.5-6h5"],
];

export default function Page() {
  const wallet = useWallet();
  const fmt = useMemo(() => makeFormat("USD", 1), []);
  const [tab, setTab] = useState<Tab>("overview");
  const [b, setB] = useState<Bank | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sgovSeries = useSgovSeries();
  const [stats, setStats] = useState<Stats | null>(null);
  const [showHow, setShowHow] = useState(true);

  useEffect(() => {
    let on = true;
    const pull = () => fetch("/api/stats").then((r) => r.json()).then((j) => on && setStats(j as Stats)).catch(() => {});
    pull();
    const t = setInterval(pull, 15_000);
    return () => { on = false; clearInterval(t); };
  }, []);

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
  const HEAD: Record<Tab, string> = { overview: "Overview", save: "Savings", pay: "Payments", borrow: "Borrow & Earn", live: "Live Stats" };
  const NO: Record<Tab, string> = { overview: "01", save: "02", pay: "03", borrow: "04", live: "05" };
  const NAV: [Tab, string][] = [["overview", "OVERVIEW"], ["save", "SAVE"], ["pay", "PAY"], ["borrow", "BORROW"], ["live", "LIVE"]];

  const alloc = [
    { label: "Savings", value: b?.savings?.freeValue ?? 0, color: "#0b7d46" },
    { label: "Locked", value: b?.savings?.lockedValue ?? 0, color: "#10a35c" },
    { label: "Lending", value: b?.loan?.supplied ?? 0, color: "#5cc48f" },
    { label: "Wallet USDG", value: usdg, color: "#b7c7bf" },
  ];
  const allocSum = alloc.reduce((s, p) => s + p.value, 0);

  /* the rail under the nav is protocol-wide, never per-wallet */
  const TICK: [string, string][] = [
    ["TVL", fmt((stats?.savingsTvl ?? 0) + (stats?.lendingReserve ?? 0))],
    ["BORROWED", fmt(stats?.totalBorrowed ?? 0)],
    ["ORDERS", String(stats?.activeOrders ?? 0)],
    ["USERS", String(stats?.participants ?? 0)],
    ["SGOV", fmt(sgovPrice)],
    ["CHAIN", "RH 4663"],
  ];

  const LEDGER: [string, string, string][] = [
    ["Total balance", fmt(total), "wallet"],
    ["Savings", fmt(savingsVal), "save"],
    ["Lending", fmt(b?.loan?.supplied ?? 0), "lend"],
    ["Debt", fmt(b?.loan?.debt ?? 0), "borrow"],
    ["Wallet USDG", fmt(usdg), "coin"],
    ["SGOV price", fmt(sgovPrice), "price"],
  ];

  return (
    <div className="bnk">
      {/* ---- full-width nav ---- */}
      <header className="btop">
        <div className="bwrap btop-in">
          <span className="btop-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></svg>
            HOODSAVE<i className="cur" />
          </span>
          <nav className="btabs">
            {NAV.map(([t, l]) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => { setTab(t); setMsg(null); }}>{l}</button>
            ))}
          </nav>
          <div className="btop-r">
            {wallet.address && <span className="bnk-usdg">{fmt(usdg)} USDG</span>}
            {wallet.address
              ? <button className="bnk-btn ghost sm" onClick={() => wallet.disconnect()}>{short(wallet.address)}</button>
              : <button className="bnk-btn sm" onClick={() => void wallet.connect()} disabled={wallet.busy}>{wallet.busy ? "…" : "CONNECT"}</button>}
          </div>
        </div>
      </header>

      {/* ---- status rail ---- */}
      <div className="btick">
        <div className="bwrap row">
          <span className="gt">&gt;</span>
          {TICK.map(([k, v]) => <span key={k}>{k} <b>{v}</b></span>)}
          <span className="sp" />
          <span className="lv">● live</span>
        </div>
      </div>

      <main className="bwrap bmain">
        <div className="bnum"><span className="no">{NO[tab]}</span><h2>{HEAD[tab]}</h2><span className="rule" /></div>

        {BANNER[tab] && (
          // eslint-disable-next-line @next/next/no-img-element -- a plain static
          // banner; next/image buys nothing for a single pre-sized asset.
          <div className="bban">
            <img src={`/banners/${BANNER[tab]}.jpg`} alt="" width={1800} height={450} />
          </div>
        )}

        {msg && <div className={`bnk-msg ${msg.ok ? "ok" : "err"}`} style={{ marginBottom: 16, marginTop: 0 }}>{msg.text}</div>}

        {tab === "overview" && (
          <>
            {/* one outlined slab, three columns split by hairlines — not three cards */}
            <div className="bhero">
              <div className="bhero-c wide">
                <div className="bpk">Total balance</div>
                <div className="bbal-v">{fmt(total)}</div>
                <div className="bcard">
                  <span className="visa">SAVE</span>
                  <span className="tag">HoodSave · Savings</span>
                  <span className="sp" />
                  <div className="nm">{wallet.address ? "Your vault" : "Not connected"}</div>
                  <div className="no">{wallet.address ? `${wallet.address.slice(2, 6)}  ${wallet.address.slice(6, 10)}  ${wallet.address.slice(10, 14)}  ${wallet.address.slice(-4)}` : "•••• •••• •••• ••••"}</div>
                  <div className="meta"><span>Backed by SGOV</span><span>Balance {fmt(savingsVal)}</span></div>
                </div>
                <div className="bacts">
                  <button className="bact primary" onClick={() => setTab("save")}><svg className="bani" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7" pathLength={1} /></svg>Deposit</button>
                  <button className="bact" onClick={() => setTab("pay")}><svg className="bani" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" pathLength={1} /></svg>Send</button>
                  <button className="bact" onClick={() => setTab("borrow")}><svg className="bani" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9 12 4l9 5M5 9v9h14V9" pathLength={1} /></svg>Borrow</button>
                </div>
              </div>

              <div className="bhero-c">
                <div className="bpk">Allocation</div>
                <div className="balloc">
                  <Donut parts={alloc} />
                  <div className="balloc-list">
                    {alloc.map((p) => {
                      const pc = allocSum > 0 ? (p.value / allocSum) * 100 : 0;
                      return (
                        <div className="balloc-row" key={p.label}>
                          <span className="dot" style={{ background: p.color }} />
                          <b>{p.label}</b>
                          <span className="bar"><i style={{ width: `${pc}%`, background: p.color }} /></span>
                          <span className="pv">{pc.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="bhero-f">Every dollar you hold, split by where it sits. Savings and Locked are SGOV; Lending is the USDG reserve borrowers draw from.</p>
              </div>

              <div className="bhero-c">
                <div className="bpk">Quick actions</div>
                <div className="bicons">
                  {QUICK.map(([label, to, d], i) => (
                    <button className="bico" key={label} onClick={() => setTab(to as Tab)}>
                      <span className="bico-i"><svg className="bani" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: `${(i % 6) * 0.4}s` }}><path d={d} pathLength={1} /></svg></span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* a flat ledger rail, no card chrome */}
            <div className="bledger">
              {LEDGER.map(([k, v, ic], i) => (
                <div key={k}><span><Ico k={ic} i={i} />{k}</span><b>{v}</b></div>
              ))}
            </div>

            {/* chart and positions share one outlined slab */}
            <div className="bboard2">
              <div className="bboard2-l"><CandleChart symbol="SGOV" /></div>
              <div className="bboard2-r">
                <div className="bpk">Your positions</div>
                {!wallet.address ? <div className="bnk-empty">Connect a wallet to see your positions.</div> : (
                  <>
                    {savingsVal > 0 && <div className="btx"><span className="ic"><svg className="bani" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 6v12M6 12l6 6 6-6" pathLength={1} /></svg></span><div className="id"><b>Savings balance</b><span>SGOV-backed</span></div><span className="amt up">{fmt(savingsVal)}</span></div>}
                    {(b?.loan?.supplied ?? 0) > 0 && <div className="btx"><span className="ic"><svg className="bani" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16v10H4zM4 11h16" pathLength={1} /></svg></span><div className="id"><b>Lending supplied</b><span>earning interest</span></div><span className="amt up">{fmt(b?.loan?.supplied ?? 0)}</span></div>}
                    {(b?.loan?.debt ?? 0) > 0 && <div className="btx"><span className="ic"><svg className="bani" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 3 9v11h18V9z" pathLength={1} /></svg></span><div className="id"><b>Borrowed</b><span>against collateral</span></div><span className="amt down">−{fmt(b?.loan?.debt ?? 0)}</span></div>}
                    {(b?.orders ?? []).slice(0, 4).map((o) => (
                      <div className="btx" key={o.id}><span className="ic"><svg className="bani" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14M12 5l7 7-7 7" pathLength={1} /></svg></span><div className="id"><b>Pay → {short(o.recipient)}</b><span>every {Math.round(o.intervalS / 86400)}d · {o.open ? "active" : "done"}</span></div><span className="amt down">−{fmt(o.amount)}</span></div>
                    ))}
                    {savingsVal === 0 && (b?.loan?.supplied ?? 0) === 0 && (b?.loan?.debt ?? 0) === 0 && (b?.orders ?? []).length === 0 && <div className="bnk-empty">Nothing yet — deposit to get started.</div>}
                  </>
                )}
                <div className="bboard2-cta">
                  <button className="bnk-btn ghost wide" onClick={() => setTab("live")}>See protocol-wide stats</button>
                </div>
              </div>
            </div>

            <div className="bhl">
              <div className="bhl-card"><span className="bhl-ic"><Ico k="save" i={0} /></span><div className="bhl-id"><b>Savings</b><span>SGOV</span></div><span className="bhl-spark"><Spark points={sgovSeries} /></span><div className="bhl-v"><b>{fmt(savingsVal)}</b><span>balance</span></div></div>
              <div className="bhl-card"><span className="bhl-ic"><Ico k="lend" i={1} /></span><div className="bhl-id"><b>Lending</b><span>earn</span></div><span className="bhl-spark"><Spark points={sgovSeries} /></span><div className="bhl-v"><b>{fmt(b?.loan?.supplied ?? 0)}</b><span>supplied</span></div></div>
              <div className="bhl-card"><span className="bhl-ic"><Ico k="borrow" i={2} /></span><div className="bhl-id"><b>Borrowed</b><span>debt</span></div><div className="bhl-v" style={{ marginLeft: "auto" }}><b>{fmt(b?.loan?.debt ?? 0)}</b><span>owed</span></div></div>
              <div className="bhl-card"><span className="bhl-ic"><Ico k="coin" i={3} /></span><div className="bhl-id"><b>SGOV</b><span>price</span></div><span className="bhl-spark"><Spark points={sgovSeries} /></span><div className="bhl-v"><b>{fmt(sgovPrice)}</b><span>now</span></div></div>
            </div>

            {showHow && (
              <div className="bwork">
                <button className="bwork-x" onClick={() => setShowHow(false)} aria-label="Dismiss">×</button>
                <div className="bwork-k">How HoodSave works</div>
                <div className="bwork-steps">
                  {[
                    ["Deposit USDG", "Your cash buys SGOV — short U.S. treasuries — held in the vault under your name."],
                    ["It earns by itself", "SGOV rises against USDG. No farming, no promises: the yield is the treasury bill."],
                    ["Withdraw any time", "Sell back and the USDG lands in your wallet. Only you can withdraw — never us."],
                  ].map(([t, d], i) => (
                    <div className="bwork-s" key={t}><span className="n">{i + 1}</span><div><b>{t}</b><p>{d}</p></div></div>
                  ))}
                </div>
              </div>
            )}

            <History acts={stats?.activity ?? []} address={wallet.address} />
          </>
        )}

        {tab === "save" && <SaveTab b={b} fmt={fmt} usdg={usdg} sgovPrice={sgovPrice} busy={busy} setBusy={setBusy} send={send} done={done} fail={fail} wallet={wallet} acts={stats?.activity ?? []} />}
        {tab === "pay" && <PayTab b={b} fmt={fmt} busy={busy} setBusy={setBusy} send={send} done={done} fail={fail} wallet={wallet} acts={stats?.activity ?? []} />}
        {tab === "borrow" && <BorrowTab b={b} fmt={fmt} usdg={usdg} busy={busy} setBusy={setBusy} send={send} done={done} fail={fail} wallet={wallet} acts={stats?.activity ?? []} />}
        {tab === "live" && <LiveTab fmt={fmt} s={stats} />}
      </main>
    </div>
  );
}

type Common = {
  b: Bank | null; fmt: (n: number) => string; busy: string | null; setBusy: (s: string | null) => void;
  send: (to: `0x${string}`, data: `0x${string}`) => Promise<`0x${string}`>; done: (t: string) => void; fail: (e: unknown) => void;
  wallet: ReturnType<typeof useWallet>;
  acts: StatAct[];
};

// ---------------------------------------------------------------- shared bits

const EXPLORER_URL = "https://robinhoodchain.blockscout.com";

/** Line-icon paths, keyed by meaning. Single path each so one draw loop fits all. */
const IC: Record<string, string> = {
  save: "M12 3v11M7.5 9.5l4.5 4.5 4.5-4.5M4 20h16",
  lock: "M7.5 10.5V8a4.5 4.5 0 019 0v2.5M5.5 10.5h13v9.5h-13z",
  send: "M4 12h13M11.5 5.5L19 12l-7.5 6.5",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18M12 7v5.2l3.4 2",
  lend: "M4 7h16v10H4zM4 11h16M7.5 14.5h3.5",
  borrow: "M3 9l9-5 9 5M5 9v10h14V9M9.5 19v-5h5v5",
  price: "M3 16.5l5-6 4 3 5-7 3.5 2.5",
  bank: "M12 3.5 3.5 8h17zM6 8v9M10 8v9M14 8v9M18 8v9M3 20.5h18",
  wallet: "M4 6.5h13a2 2 0 012 2v9a2 2 0 01-2 2H4zM4 6.5v-2h11M16.5 13h2",
  chart: "M3 12h4l2.5-6.5L13.5 18 16 12h5",
  list: "M4 7h16M4 12h16M4 17h10",
  coin: "M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17M12 7.5v9M9.6 10.2c0-1 1.1-1.7 2.4-1.7s2.4.7 2.4 1.7-1.1 1.5-2.4 1.9-2.4.9-2.4 1.9 1.1 1.7 2.4 1.7 2.4-.7 2.4-1.7",
  shield: "M12 3.5l7 3v5.5c0 4-3 6.8-7 9-4-2.2-7-5-7-9V6.5z",
  users: "M8.5 11a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4M2.5 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16.5 11.5a2.6 2.6 0 100-5.2M17 14.4c2.6.3 4.5 2.3 4.5 5.1",
  spark: "M12 3.5l2.2 5.1 5.3.6-4 3.7 1.1 5.3-4.6-2.7-4.6 2.7L8 12.9l-4-3.7 5.3-.6z",
};

/** A line icon that redraws itself forever. `i` staggers a grid so it ripples. */
function Ico({ k, i = 0 }: { k: string; i?: number }) {
  return (
    <svg className="bani" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      style={{ animationDelay: `${(i % 6) * 0.4}s` }} aria-hidden>
      <path d={IC[k] ?? IC.coin} pathLength={1} />
    </svg>
  );
}

// -------------------------------------------------- form widgets
// Nothing below is a native control: <select> and the number spinners are
// replaced so every menu behaves the same on every browser.

/** One row of a Pick: value, label, and optionally a mark and a second line. */
interface Opt { v: string; l: string; icon?: React.ReactNode; sub?: string }

/** A dropdown that isn't the browser's: popover list, optional filter for long
 *  lists, closes on outside click or Escape. */
function Pick({ value, onChange, options, disabled, search }: {
  value: string; onChange: (v: string) => void; options: Opt[]; disabled?: boolean; search?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  const sel = options.find((o) => o.v === value);
  const list = q ? options.filter((o) => `${o.v} ${o.l} ${o.sub ?? ""}`.toLowerCase().includes(q.toLowerCase())) : options;

  return (
    <div className={`bpick${open ? " open" : ""}`} ref={box}>
      <button type="button" className="bpick-b" disabled={disabled} onClick={() => { setOpen(!open); setQ(""); }}>
        {sel?.icon}
        <span>{sel?.l ?? value}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="bpick-m">
          {search && (
            <input className="bpick-q" autoFocus placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
          )}
          <div className="bpick-l">
            {list.length === 0 ? <div className="bpick-e">Nothing matches.</div> : list.map((o) => (
              <button type="button" key={o.v} className={o.v === value ? "on" : ""} onClick={() => { onChange(o.v); setOpen(false); }}>
                {o.icon}
                <span>{o.l}{o.sub && <i>{o.sub}</i>}</span>
                {o.v === value && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4.5 4.5L19 7" /></svg>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Segmented toggle whose indicator slides between the options. */
function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  const i = Math.max(0, options.findIndex(([v]) => v === value));
  return (
    <div className="bnk-seg" style={{ "--n": options.length, "--i": i } as React.CSSProperties}>
      <span className="bnk-seg-i" />
      {options.map(([v, l]) => (
        <button type="button" key={v} className={v === value ? "on" : ""} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

const PCT: [string, number][] = [["25%", 0.25], ["50%", 0.5], ["75%", 0.75], ["MAX", 1]];

/** Number field with the native spinners gone; when a ceiling is known it also
 *  offers the four fill shortcuts. */
function Amt({ value, onChange, unit, max, step = "any", placeholder = "0.00" }: {
  value: string; onChange: (v: string) => void; unit?: string; max?: number; step?: string; placeholder?: string;
}) {
  const cur = Number(value) || 0;
  return (
    <>
      <div className="bnk-inp">
        <input type="number" min="0" step={step} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
        {unit && <span className="unit">{unit}</span>}
      </div>
      {!!max && max > 0 && (
        <div className="bpct">
          {PCT.map(([l, f]) => {
            const v = Math.floor(max * f * 100) / 100;
            return <button type="button" key={l} className={cur > 0 && Math.abs(cur - v) < 0.005 ? "on" : ""} onClick={() => onChange(String(v))}>{l}</button>;
          })}
        </div>
      )}
    </>
  );
}

/** Whole-number field with its own −/+ instead of the browser's spinner. */
function Step({ value, onChange, min = 0, max = 9999, unit }: {
  value: string; onChange: (v: string) => void; min?: number; max?: number; unit?: string;
}) {
  const n = Number(value) || 0;
  const bump = (d: number) => onChange(String(Math.min(max, Math.max(min, n + d))));
  return (
    <div className="bnk-inp step">
      <button type="button" className="stepb" disabled={n <= min} onClick={() => bump(-1)} aria-label="Less">−</button>
      <input type="number" min={min} step="1" value={value} onChange={(e) => onChange(e.target.value)} />
      {unit && <span className="unit">{unit}</span>}
      <button type="button" className="stepb" disabled={n >= max} onClick={() => bump(1)} aria-label="More">+</button>
    </div>
  );
}

/** The divided stat rail every tab opens with. */
function Strip({ cells }: { cells: [string, string, string][] }) {
  return <div className="bstrip">{cells.map(([k, v, ic], i) => <div key={k}><span><Ico k={ic} i={i} />{k}</span><b>{v}</b></div>)}</div>;
}

/** Searchable activity table. `fixed` pins it to one part of the bank and
 *  hides the chips; without it the chips let the reader switch. */
function History({ acts, address, fixed, title = "History" }: { acts: StatAct[]; address?: string | null; fixed?: string; title?: string }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState("all");
  const g = fixed ?? f;
  const rows = acts
    .filter((a) => !address || a.user.toLowerCase() === address.toLowerCase())
    .filter((a) => (g === "all" || GRP[a.kind] === g) && (!q || a.detail.toLowerCase().includes(q.toLowerCase()) || a.kind.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <div className="bnum sub"><span className="no">//</span><h2>{title}</h2><span className="rule" /><span className="bnk-tag open">● live</span></div>
      <div className="bhist-wrap">
        <div className="bhist-tools">
          <label className="bsearch">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
            <input placeholder="Search activity…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {!fixed && (
            <div className="bchips">
              {["all", "Savings", "Payments", "Loan"].map((c) => (
                <button key={c} className={f === c ? "on" : ""} onClick={() => setF(c)}>{c === "all" ? "All" : c}</button>
              ))}
            </div>
          )}
        </div>
        <div className="bhist">
          <div className="bhist-r head"><span>Event</span><span>Group</span><span>Address</span><span>Block</span></div>
          {rows.length === 0 ? <div className="bnk-empty">{address ? "No activity for this wallet yet." : "Connect a wallet, or wait for the first on-chain move."}</div>
            : rows.slice(0, 12).map((a, i) => (
              <a className="bhist-r" key={a.tx + i} href={`${EXPLORER_URL}/tx/${a.tx}`} target="_blank" rel="noreferrer">
                <span className="ev"><i className={`d ${GRP[a.kind]?.toLowerCase() ?? ""}`} />{a.detail}</span>
                <span className="g">{GRP[a.kind] ?? a.kind}</span>
                <span className="ad">{a.user ? short(a.user) : "—"}</span>
                <span className="bl">#{a.block} ↗</span>
              </a>
            ))}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Live stats

/** Protocol-wide numbers; the page keeps them fresh every 15s. */
function LiveTab({ fmt, s }: { fmt: (n: number) => string; s: Stats | null }) {
  if (!s) return <div className="bnk-empty">Reading the chain…</div>;
  const anyLive = s.live.savings || s.live.payments || s.live.loan;
  const tvl = s.savingsTvl + s.lendingReserve;

  return (
    <>
      {!anyLive && <div className="bnk-msg err" style={{ marginBottom: 16, marginTop: 0 }}>Contracts aren&apos;t deployed yet — these figures go live the moment they are.</div>}

      {/* four oversized figures on bare paper — deliberately not cards */}
      <div className="bfig">
        <div><span>Total value locked</span><b>{fmt(tvl)}</b><i>savings + lending reserve</i></div>
        <div><span>Total borrowed</span><b>{fmt(s.totalBorrowed)}</b><i>against stock collateral</i></div>
        <div><span>Participants</span><b>{s.participants}</b><i>unique addresses on-chain</i></div>
        <div><span>SGOV price</span><b>{fmt(s.sgovPrice)}</b><i>USDG per share, from the pool</i></div>
      </div>

      <div className="bsplit">
        <div className="bpane">
          <h3><Ico k="bank" />Protocol</h3>
          <p className="sub">Read straight from the three bank contracts, refreshed every 15 seconds.</p>
          <div className="bnk-kv"><span>Savings TVL</span><b>{fmt(s.savingsTvl)}</b></div>
          <div className="bnk-kv"><span>Lending reserve</span><b>{fmt(s.lendingReserve)}</b></div>
          <div className="bnk-kv"><span>Borrowed</span><b>{fmt(s.totalBorrowed)}</b></div>
          <div className="bnk-kv"><span>Utilisation</span><b>{s.lendingReserve > 0 ? `${Math.round((s.totalBorrowed / s.lendingReserve) * 100)}%` : "—"}</b></div>
          <div className="bnk-kv"><span>Active standing orders</span><b>{s.activeOrders}</b></div>
          <div className="bnk-kv"><span>Escrowed for payments</span><b>{fmt(s.escrowed)}</b></div>
          <div className="bnk-kv"><span>Participants</span><b>{s.participants}</b></div>
          <div className="bnk-kv"><span>SGOV price</span><b>{fmt(s.sgovPrice)}</b></div>
        </div>

        <div className="bpane">
          <h3><Ico k="chart" />Live activity</h3>
          <p className="sub">Every deposit, payment, borrow and repayment across the bank.</p>
          {s.activity.length === 0 ? <div className="bnk-empty">No on-chain activity yet.</div>
            : s.activity.map((a, i) => (
              <a className="btx" key={a.tx + i} href={`${EXPLORER_URL}/tx/${a.tx}`} target="_blank" rel="noreferrer">
                <span className="ic"><svg className="bani" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 12h4l2.5-6 4 12 2.5-6h5" pathLength={1} /></svg></span>
                <div className="id"><b>{a.detail}</b><span>{a.user ? short(a.user) : "—"} · block {a.block}</span></div>
                <span className="amt">{a.kind}</span>
              </a>
            ))}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Save

function SaveTab({ b, fmt, usdg, sgovPrice, busy, setBusy, send, done, fail, wallet, acts }: Common & { usdg: number; sgovPrice: number }) {
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
    <>
    <Strip cells={[
      ["Free balance", fmt(free), "save"],
      ["Locked", fmt(locked), "lock"],
      ["Unlocks", locked > 0 && unlockAt > 0 ? new Date(unlockAt * 1000).toLocaleDateString() : "-", "clock"],
      ["SGOV price", fmt(sgovPrice), "price"],
    ]} />
    <div className="bsplit">
      <div className="bpane">
        <h3><Ico k="save" />Savings</h3>
        <p className="sub">Your USDG is held as SGOV — short U.S. treasuries — so the balance grows on its own. Withdraw the free part any time.</p>
        <div className="bnk-kv"><span>Free balance</span><b>{fmt(free)}</b></div>
        <div className="bnk-kv"><span>Locked balance</span><b>{fmt(locked)}{unlockAt > 0 && locked > 0 ? ` · until ${new Date(unlockAt * 1000).toLocaleDateString()}` : ""}</b></div>
        <div className="bnk-kv"><span>Yield source</span><b>SGOV t-bills</b></div>
        <div style={{ marginTop: 16 }}>
          <div className="bnk-fk"><span>Withdraw (USDG)</span>{free > 0 && <span className="cap">{fmt(free)} free</span>}</div>
          <Amt value={wamount} onChange={setWamount} unit="USDG" max={free} />
          <button className="bnk-btn ghost wide" style={{ marginTop: 10 }} disabled={!deployed || !wallet.address || !!busy || !(Number(wamount) > 0)} onClick={withdraw}>{busy ?? "Withdraw"}</button>
        </div>
      </div>

      <div className="bpane">
        <h3><Ico k="coin" />Deposit</h3>
        <p className="sub">{deployed ? "Add USDG to your savings." : "The savings vault isn't deployed yet — this opens once it is."}</p>
        <Seg value={mode} onChange={(v) => setMode(v as "open" | "locked")} options={[["open", "Flexible"], ["locked", "Locked"]]} />
        <div className="bnk-field">
          <div className="bnk-fk"><span>Amount</span>{usdg > 0 && <span className="cap">{fmt(usdg)} in wallet</span>}</div>
          <Amt value={amount} onChange={setAmount} unit="USDG" max={usdg} />
        </div>
        {mode === "locked" && (
          <div className="bnk-field">
            <div className="bnk-fk"><span>Lock term</span></div>
            <Pick value={String(term)} onChange={(v) => setTerm(Number(v))} options={TERMS.map(([l, s]) => ({ v: String(s), l }))} />
          </div>
        )}
        <button className="bnk-btn wide" disabled={!deployed || !wallet.address || !!busy || amt <= 0 || amt > usdg + 1e-9} onClick={deposit}>{busy ?? (!wallet.address ? "Connect wallet" : mode === "locked" ? "Lock & deposit" : "Deposit")}</button>
        <p className="bnk-note">{sgovPrice > 0 ? `1 SGOV ≈ ${fmt(sgovPrice)} · ` : ""}Yield is SGOV appreciating vs USDG — real, not promised. Non-custodial: only you can withdraw.</p>
      </div>
    </div>
    <History acts={acts} address={wallet.address} fixed="Savings" title="Savings history" />
    </>
  );
}

// ---------------------------------------------------------------- Pay

function PayTab({ b, fmt, busy, setBusy, send, done, fail, wallet, acts }: Common) {
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

  const open = orders.filter((o) => o.open);
  const nextDue = open.length ? Math.min(...open.map((o) => o.nextDue)) : 0;
  return (
    <>
    <Strip cells={[
      ["Active orders", String(open.length), "list"],
      ["Escrowed", fmt(open.reduce((s, o) => s + o.remaining, 0)), "shield"],
      ["Next payment", nextDue ? new Date(nextDue * 1000).toLocaleDateString() : "-", "clock"],
      ["Per cycle", fmt(open.reduce((s, o) => s + o.amount, 0)), "send"],
    ]} />
    <div className="bsplit">
      <div className="bpane">
        <h3><Ico k="clock" />New standing order</h3>
        <p className="sub">{deployed ? "Escrow USDG and it pays out on schedule — rent, salary, an allowance. Cancel any time, the rest comes back." : "Payments aren't deployed yet."}</p>
        <div className="bnk-field"><div className="bnk-fk"><span>Recipient address</span></div><div className="bnk-inp"><input placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} style={{ fontSize: 13 }} /></div></div>
        <div className="bnk-row2">
          <div className="bnk-field"><div className="bnk-fk"><span>Amount each</span></div><Amt value={amount} onChange={setAmount} unit="USDG" /></div>
          <div className="bnk-field"><div className="bnk-fk"><span>Payments</span></div><Step value={count} onChange={setCount} min={1} unit="×" /></div>
        </div>
        <div className="bnk-field"><div className="bnk-fk"><span>Every</span></div><Pick value={String(interval)} onChange={(v) => setInterval_(Number(v))} options={INTERVALS.map(([l, s]) => ({ v: String(s), l }))} /></div>
        <button className="bnk-btn wide" disabled={!deployed || !wallet.address || !!busy || !valid} onClick={create}>{busy ?? (!wallet.address ? "Connect wallet" : `Escrow ${fmt(amt * n)} & schedule`)}</button>
      </div>

      <div className="bpane">
        <h3><Ico k="list" />Your orders</h3>
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
    <History acts={acts} address={wallet.address} fixed="Payments" title="Payment history" />
    </>
  );
}

// ---------------------------------------------------------------- Borrow

function BorrowTab({ b, fmt, usdg, busy, setBusy, send, done, fail, wallet, acts }: Common & { usdg: number }) {
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
    <>
    <Strip cells={[
      ["Supplied", fmt(L?.supplied ?? 0), "lend"],
      ["Debt", fmt(debt), "borrow"],
      ["Collateral value", fmt(collVal), "shield"],
      ["LTV used", collVal > 0 ? `${((debt / collVal) * 100).toFixed(1)}%` : "-", "chart"],
    ]} />
    <div className="bsplit">
      <div className="bpane">
        <h3><Ico k="lend" />Earn - lend USDG</h3>
        <p className="sub">{deployed ? `Supply USDG for borrowers to draw against; you earn the ~${BORROW_APR}% borrow interest.` : "Lending isn't deployed yet."}</p>
        <div className="bnk-kv"><span>Your supplied</span><b>{fmt(L?.supplied ?? 0)}</b></div>
        <div className="bnk-field" style={{ marginTop: 12 }}><div className="bnk-fk"><span>Supply</span>{usdg > 0 && <span className="cap">{fmt(usdg)} in wallet</span>}</div><Amt value={sup} onChange={setSup} unit="USDG" max={usdg} /></div>
        <button className="bnk-btn wide" disabled={!deployed || !wallet.address || !!busy || !(Number(sup) > 0)} onClick={supply}>{busy ?? "Supply"}</button>
        {(L?.supplied ?? 0) > 0 && (
          <>
            <div className="bnk-field" style={{ marginTop: 12 }}><div className="bnk-fk"><span>Redeem</span><span className="cap">{fmt(L?.supplied ?? 0)} supplied</span></div><Amt value={red} onChange={setRed} unit="USDG" max={L?.supplied ?? 0} /></div>
            <button className="bnk-btn ghost wide" disabled={!!busy || !(Number(red) > 0)} onClick={redeem}>{busy ?? "Redeem"}</button>
          </>
        )}
      </div>

      <div className="bpane">
        <h3><Ico k="borrow" />Borrow against stocks</h3>
        <p className="sub">{deployed ? `Post a stock as collateral and borrow up to ${MAX_LTV_BPS / 100}% of its value — without selling.` : "Borrowing isn't deployed yet."}</p>
        {collVal > 0 && (
          <>
            <div className="bnk-kv"><span className="kvi">{coll && <StockLogo symbol={coll.symbol} address={coll.address} size={18} />}Collateral{L?.collateral ? ` · ${L.collateral} shares` : ""}</span><b>{fmt(collVal)}</b></div>
            <div className="bnk-kv"><span>Debt</span><b>{fmt(debt)}</b></div>
            <div className="bnk-kv"><span>Borrowable left</span><b>{fmt(Math.max(0, maxBorrow - debt))}</b></div>
            <div className="bnk-health"><span style={{ width: `${healthPct}%`, background: healthColor }} /></div>
            <p className="bnk-note" style={{ marginTop: 2 }}>Liquidated if debt passes {LIQ_THRESHOLD_BPS / 100}% of collateral. Keep this bar out of the red.</p>
          </>
        )}
        <div className="bnk-row2" style={{ marginTop: 12 }}>
          <div className="bnk-field"><div className="bnk-fk"><span>Collateral</span></div><Pick search value={collSym} onChange={setCollSym} disabled={!!L?.collateral && L.collToken.toLowerCase() !== (coll?.address.toLowerCase() ?? "")} options={COLLATERAL.map((s) => ({ v: s.symbol, l: s.symbol, sub: s.name, icon: <StockLogo symbol={s.symbol} address={s.address} size={22} /> }))} /></div>
          <div className="bnk-field"><div className="bnk-fk"><span>Shares</span></div><Amt value={collAmt} onChange={setCollAmt} placeholder="0.0" /></div>
        </div>
        <button className="bnk-btn ghost wide" disabled={!deployed || !wallet.address || !!busy || !(Number(collAmt) > 0)} onClick={addCollateral}>{busy ?? "Add collateral"}</button>
        <div className="bnk-row2" style={{ marginTop: 12 }}>
          <div className="bnk-field"><div className="bnk-fk"><span>Borrow</span></div><Amt value={borrowAmt} onChange={setBorrowAmt} unit="USDG" max={Math.max(0, maxBorrow - debt)} /><button className="bnk-btn wide" style={{ marginTop: 8 }} disabled={!deployed || !!busy || !(Number(borrowAmt) > 0)} onClick={borrow}>{busy ?? "Borrow"}</button></div>
          <div className="bnk-field"><div className="bnk-fk"><span>Repay</span>{debt > 0 && <span className="cap">{fmt(debt)} owed</span>}</div><Amt value={repayAmt} onChange={setRepayAmt} unit="USDG" max={debt} /><button className="bnk-btn ghost wide" style={{ marginTop: 8 }} disabled={!!busy || !(Number(repayAmt) > 0)} onClick={repay}>{busy ?? "Repay"}</button></div>
        </div>
      </div>
    </div>
    <History acts={acts} address={wallet.address} fixed="Loan" title="Lending history" />
    </>
  );
}
