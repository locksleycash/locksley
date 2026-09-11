"use client";

// Locksley technical docs. Full-bleed, its own chrome, the landing's paper and
// lavender. Prose plus hand-drawn SVG diagrams of the three mechanisms and the
// custody model. Every figure here is a constant in the contracts, not copy.

import { useEffect, useState } from "react";
import { LINKS } from "../../src/site.ts";
import "./docs.css";

const APP = process.env.NEXT_PUBLIC_APP_URL ?? "/app";

const TOC: { group: string; items: { id: string; label: string }[] }[] = [
  { group: "Start", items: [
    { id: "overview", label: "Overview" },
    { id: "vision", label: "Vision & mission" },
    { id: "architecture", label: "Architecture" },
  ] },
  { group: "Mechanism", items: [
    { id: "savings", label: "Savings (SGOV)" },
    { id: "payments", label: "Standing orders" },
    { id: "borrow", label: "Collateral loans" },
    { id: "liquidation", label: "Liquidation" },
  ] },
  { group: "Trust", items: [
    { id: "custody", label: "Custody model" },
    { id: "cryptography", label: "Cryptography" },
    { id: "risks", label: "Risks & limits" },
  ] },
  { group: "Protocol", items: [
    { id: "reference", label: "Reference" },
  ] },
];

const CONTRACTS = [
  ["Savings", "USDG ⇄ SGOV vault, open + locked terms", "0xF28571Da91c7A8d3511A57f81b57098f9d1970b8"],
  ["StandingOrders", "Escrowed scheduled payments", "0x9188572646DCa8460360267CCE10cB88a764743E"],
  ["CollateralLoan", "Lender reserve + stock-backed borrowing", "0x4b5181c539954b28cF69a05b9eC45161c6eC587A"],
];

const CONSTANTS = [
  ["MAX_TERM", "730 days", "Longest lock a savings deposit can choose"],
  ["SGOV_FEE", "3000 (0.30%)", "Uniswap v3 pool tier the vault swaps through"],
  ["MAX_LTV_BPS", "5000 (50%)", "Most you can borrow against collateral value"],
  ["LIQ_THRESHOLD_BPS", "6000 (60%)", "Debt-to-collateral at which a position can be liquidated"],
  ["LIQ_BONUS_BPS", "800 (8%)", "Discount a liquidator receives on seized collateral"],
  ["CLOSE_FACTOR_BPS", "5000 (50%)", "Share of debt one liquidation may repay"],
  ["RATE_PER_SEC", "2,535,100,000 (1e18 scale)", "Borrow interest, ≈ 8% APR, accrued per second"],
];

/* ---------------- diagrams ---------------- */

function ArchDiagram() {
  return (
    <div className="diagram">
      <svg viewBox="0 0 720 340" role="img" aria-label="Contract architecture">
        <rect className="dg-box accent" x="290" y="14" width="140" height="42" rx="9" />
        <text className="dg-t" x="360" y="35" fontSize="13" textAnchor="middle">Your wallet</text>
        <text className="dg-t dim" x="360" y="49" fontSize="10.5" textAnchor="middle">the only key that moves funds</text>

        <rect className="dg-box" x="40" y="118" width="190" height="56" rx="9" />
        <text className="dg-t" x="135" y="141" fontSize="13" textAnchor="middle">Savings</text>
        <text className="dg-t dim" x="135" y="158" fontSize="10.5" textAnchor="middle">USDG → SGOV, per-user shares</text>

        <rect className="dg-box" x="265" y="118" width="190" height="56" rx="9" />
        <text className="dg-t" x="360" y="141" fontSize="13" textAnchor="middle">StandingOrders</text>
        <text className="dg-t dim" x="360" y="158" fontSize="10.5" textAnchor="middle">escrow, pays on schedule</text>

        <rect className="dg-box" x="490" y="118" width="190" height="56" rx="9" />
        <text className="dg-t" x="585" y="141" fontSize="13" textAnchor="middle">CollateralLoan</text>
        <text className="dg-t dim" x="585" y="158" fontSize="10.5" textAnchor="middle">reserve + stock-backed debt</text>

        <rect className="dg-box deep" x="40" y="250" width="190" height="50" rx="9" />
        <text className="dg-t on" x="135" y="271" fontSize="12.5" textAnchor="middle">USDG / SGOV pool</text>
        <text className="dg-t on" x="135" y="287" fontSize="10" textAnchor="middle" opacity=".7">Uniswap v3 · fee 0.30%</text>

        <rect className="dg-box deep" x="490" y="250" width="190" height="50" rx="9" />
        <text className="dg-t on" x="585" y="271" fontSize="12.5" textAnchor="middle">USDG / stock pools</text>
        <text className="dg-t on" x="585" y="287" fontSize="10" textAnchor="middle" opacity=".7">Uniswap v3 · spot price</text>

        <rect className="dg-box" x="265" y="250" width="190" height="50" rx="9" />
        <text className="dg-t" x="360" y="271" fontSize="12.5" textAnchor="middle">Anyone</text>
        <text className="dg-t dim" x="360" y="287" fontSize="10" textAnchor="middle">may call execute(id)</text>

        <g strokeWidth="1.4">
          <path className="dg-line lav" d="M320 56 L160 116" markerEnd="url(#al)" />
          <path className="dg-line lav" d="M360 56 L360 116" markerEnd="url(#al)" />
          <path className="dg-line lav" d="M400 56 L560 116" markerEnd="url(#al)" />
          <path className="dg-line dash" d="M135 174 L135 248" markerEnd="url(#ag)" />
          <path className="dg-line dash" d="M585 174 L585 248" markerEnd="url(#ag)" />
          <path className="dg-line dash" d="M360 248 L360 176" markerEnd="url(#ag)" />
        </g>
        <defs>
          <marker id="ag" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0L6 3.5L0 7z" fill="#b9b9c2" /></marker>
          <marker id="al" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0L6 3.5L0 7z" fill="#7568b4" /></marker>
        </defs>
      </svg>
      <p className="dg-cap">Three contracts, no shared vault, no owner. Each holds only what its own users put in.</p>
    </div>
  );
}

function SavingsDiagram() {
  return (
    <div className="diagram">
      <svg viewBox="0 0 720 210" role="img" aria-label="Savings flow">
        <rect className="dg-box accent" x="30" y="70" width="150" height="52" rx="9" />
        <text className="dg-t" x="105" y="92" fontSize="13" textAnchor="middle">1,000 USDG</text>
        <text className="dg-t dim" x="105" y="109" fontSize="10.5" textAnchor="middle">deposit(usdgIn, minSgovOut)</text>

        <rect className="dg-box deep" x="255" y="70" width="210" height="52" rx="9" />
        <text className="dg-t on" x="360" y="92" fontSize="13" textAnchor="middle">swap on Uniswap v3</text>
        <text className="dg-t on" x="360" y="109" fontSize="10.5" textAnchor="middle" opacity=".7">USDG → SGOV, slippage floor enforced</text>

        <rect className="dg-box accent" x="540" y="70" width="150" height="52" rx="9" />
        <text className="dg-t" x="615" y="92" fontSize="13" textAnchor="middle">9.91 SGOV</text>
        <text className="dg-t dim" x="615" y="109" fontSize="10.5" textAnchor="middle">shares[you] += 9.91</text>

        <text className="dg-t dim" x="360" y="40" fontSize="11" textAnchor="middle">SGOV ≈ $100.92 → the vault holds treasuries, your balance is a share count</text>
        <text className="dg-t lav" x="360" y="175" fontSize="11" textAnchor="middle">withdraw() reverses the swap · locked deposits add an unlockAt timestamp, nothing else</text>

        <g strokeWidth="1.4">
          <path className="dg-line lav" d="M180 96 L253 96" markerEnd="url(#al2)" />
          <path className="dg-line lav" d="M465 96 L538 96" markerEnd="url(#al2)" />
        </g>
        <defs><marker id="al2" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0L6 3.5L0 7z" fill="#7568b4" /></marker></defs>
      </svg>
      <p className="dg-cap">Yield is not paid by Locksley. SGOV appreciates against USDG as the bills it holds accrue; the vault just holds your share of it.</p>
    </div>
  );
}

function LoanDiagram() {
  return (
    <div className="diagram">
      <svg viewBox="0 0 720 250" role="img" aria-label="Loan health bands">
        <text className="dg-t dim" x="40" y="30" fontSize="11">DEBT AS A SHARE OF COLLATERAL VALUE</text>
        <rect className="dg-box" x="40" y="46" width="640" height="34" rx="7" />
        <rect x="41" y="47" width="319" height="32" rx="6" fill="#f1eefa" />
        <rect x="360" y="47" width="64" height="32" fill="#fdf3e0" />
        <rect x="424" y="47" width="255" height="32" rx="6" fill="#fdeef0" />
        <text className="dg-t lav" x="200" y="68" fontSize="12" textAnchor="middle">can borrow · up to 50%</text>
        <text className="dg-t warn" x="392" y="68" fontSize="11" textAnchor="middle">buffer</text>
        <text className="dg-t" x="551" y="68" fontSize="12" textAnchor="middle" fill="#9a2a38">liquidatable · above 60%</text>

        <line x1="360" y1="40" x2="360" y2="120" className="dg-line lav" strokeWidth="1.5" />
        <text className="dg-t mono" x="360" y="136" fontSize="11" textAnchor="middle">MAX_LTV 50%</text>
        <line x1="424" y1="40" x2="424" y2="160" className="dg-line" strokeWidth="1.5" strokeDasharray="4 4" />
        <text className="dg-t mono" x="424" y="176" fontSize="11" textAnchor="middle">LIQ_THRESHOLD 60%</text>

        <text className="dg-t dim" x="40" y="220" fontSize="11">Collateral is priced from the stock&apos;s own Uniswap v3 pool (sqrtPriceX96) at the moment of the call.</text>
        <text className="dg-t dim" x="40" y="238" fontSize="11">Interest accrues per second at RATE_PER_SEC and is owed to the lenders who supplied the reserve.</text>
      </svg>
      <p className="dg-cap">Borrowing stops at 50%. Between 50% and 60% you cannot borrow more but cannot be liquidated either. Past 60%, anyone may repay half your debt and take collateral at an 8% discount.</p>
    </div>
  );
}

function CustodyDiagram() {
  return (
    <div className="diagram">
      <svg viewBox="0 0 720 200" role="img" aria-label="Who can move what">
        <rect className="dg-box accent" x="30" y="30" width="200" height="140" rx="10" />
        <text className="dg-t" x="130" y="58" fontSize="13" textAnchor="middle">Your key can</text>
        <text className="dg-t dim" x="130" y="82" fontSize="11" textAnchor="middle">deposit · withdraw</text>
        <text className="dg-t dim" x="130" y="100" fontSize="11" textAnchor="middle">create · cancel orders</text>
        <text className="dg-t dim" x="130" y="118" fontSize="11" textAnchor="middle">supply · borrow · repay</text>
        <text className="dg-t dim" x="130" y="136" fontSize="11" textAnchor="middle">post · pull collateral</text>

        <rect className="dg-box" x="260" y="30" width="200" height="140" rx="10" />
        <text className="dg-t" x="360" y="58" fontSize="13" textAnchor="middle">Anyone can</text>
        <text className="dg-t dim" x="360" y="82" fontSize="11" textAnchor="middle">execute(id) a due payment</text>
        <text className="dg-t dim" x="360" y="100" fontSize="11" textAnchor="middle">liquidate() past 60%</text>
        <text className="dg-t dim" x="360" y="118" fontSize="11" textAnchor="middle">read every balance</text>
        <text className="dg-t dim" x="360" y="136" fontSize="11" textAnchor="middle">nothing that takes your funds</text>

        <rect className="dg-box warn" x="490" y="30" width="200" height="140" rx="10" />
        <text className="dg-t warn" x="590" y="58" fontSize="13" textAnchor="middle">Locksley can</text>
        <text className="dg-t dim" x="590" y="90" fontSize="11" textAnchor="middle">— nothing —</text>
        <text className="dg-t dim" x="590" y="112" fontSize="10.5" textAnchor="middle">no owner · no pause</text>
        <text className="dg-t dim" x="590" y="128" fontSize="10.5" textAnchor="middle">no fee switch · no upgrade</text>
        <text className="dg-t dim" x="590" y="144" fontSize="10.5" textAnchor="middle">no way to freeze or seize</text>
      </svg>
      <p className="dg-cap">The third column is the product. There is no address in any contract with more power than yours.</p>
    </div>
  );
}

/* ---------------- page ---------------- */

function useScrollSpy() {
  const [active, setActive] = useState("overview");
  useEffect(() => {
    const root = document.querySelector(".docs") as HTMLElement | null;
    const secs = Array.from(document.querySelectorAll<HTMLElement>(".docs-sec"));
    if (!secs.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { root, rootMargin: "-72px 0px -70% 0px", threshold: 0 },
    );
    secs.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);
  return active;
}

export default function Docs() {
  const active = useScrollSpy();
  return (
    <div className="docs">
      <nav className="docs-nav">
        <a href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={22} height={22} />
          LOCKSLEY <small>DOCS</small>
        </a>
        <span style={{ flex: 1 }} />
        <a href="/" className="dn-link">Home</a>
        <a href={LINKS.github} className="dn-link" target="_blank" rel="noreferrer">GitHub</a>
        <a href={LINKS.x} className="dn-link" target="_blank" rel="noreferrer">X</a>
        <a href={APP} className="dn-cta">Open the app ↗</a>
      </nav>

      <div className="docs-shell">
        <aside className="docs-side">
          <nav className="docs-toc">
            {TOC.map((g) => (
              <div key={g.group}>
                <div className="toc-group">{g.group}</div>
                {g.items.map((it) => (
                  <a key={it.id} href={`#${it.id}`} className={active === it.id ? "on" : ""}>{it.label}</a>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <main className="docs-main">
          <header className="docs-hero">
            <span className="eyebrow">Protocol documentation</span>
            <h1>How <b>Locksley</b> works</h1>
            <p className="lead">
              Locksley is a savings and loan rebuilt as three smart contracts on Robinhood Chain: a
              treasury-backed savings vault, escrowed standing orders, and stock-collateralised loans.
              No contract has an owner, a pause switch, a fee, or an upgrade path. This is the
              technical reference for what they do and, just as importantly, what they cannot.
            </p>
            <div className="docs-chips">
              <span className="docs-chip">Chain <b>Robinhood (EVM 4663)</b></span>
              <span className="docs-chip">Unit <b>USDG · 6 decimals</b></span>
              <span className="docs-chip">Backing <b>SGOV · short U.S. treasuries</b></span>
              <span className="docs-chip">Admin <b>none</b></span>
            </div>
          </header>

          <section id="overview" className="docs-sec">
            <span className="kicker">Overview</span>
            <h2>A bank with <b>no banker</b></h2>
            <p>
              A bank does three things with your money: holds it and pays you something for the
              privilege, moves it on your instruction, and lends against what you own. Locksley
              does the same three, but every one of them is a contract you can read, and the only
              key that moves your balance is yours. There is no institution in the middle - not
              even us.
            </p>
            <ul>
              <li><strong>Savings</strong> - your USDG buys <span className="mono">SGOV</span>, a token of short-dated U.S. treasury bills. It earns what the bills earn, in the vault, under your name.</li>
              <li><strong>Standing orders</strong> - escrow USDG once and it pays out on a schedule. Rent, a salary, an allowance. Cancel any time and the remainder comes back.</li>
              <li><strong>Collateral loans</strong> - post a tokenised stock, borrow USDG against up to half its value, never sell it. Lenders supply the reserve and earn the interest.</li>
            </ul>
            <div className="docs-note">
              <span className="n-ico">◆</span>
              <p>Everything on this page is enforced by the contracts, not the app. The interface is a window onto state anyone can read or write directly with a wallet.</p>
            </div>
          </section>

          <section id="vision" className="docs-sec">
            <span className="kicker">Vision &amp; mission</span>
            <h2>Banking that <b>cannot betray you</b></h2>
            <h3>Vision</h3>
            <p>
              Most financial failure is not fraud. It is an institution doing something it was
              allowed to do: freezing a withdrawal, changing a rate, raising a fee, halting a
              product, being bought and shut down. The remedy is not a better institution. It is
              removing the seat the institution sits in. Locksley&apos;s vision is ordinary banking
              - save, pay, borrow - where that seat is empty by construction.
            </p>
            <h3>Mission</h3>
            <ul>
              <li><strong>Non-custody as a hard property.</strong> No address in any Locksley contract can move a balance that is not its own. This is verified in the source, not promised in a policy.</li>
              <li><strong>Real yield only.</strong> The savings rate is whatever U.S. treasury bills pay. Locksley invents no rate, subsidises nothing, and prints nothing.</li>
              <li><strong>Honest limits.</strong> Where a mechanism has a weakness - spot pricing, a locked term, liquidation - it is documented here, not hidden behind marketing.</li>
              <li><strong>Immutable.</strong> What is deployed is final. A bug is permanent and so is every guarantee. We chose that trade deliberately.</li>
            </ul>
          </section>

          <section id="architecture" className="docs-sec">
            <span className="kicker">Architecture</span>
            <h2>Three contracts, <b>zero shared state</b></h2>
            <p>
              The contracts do not know about each other. Each holds only the funds its own users
              deposited, tracks them per address, and talks to exactly one external system - a
              Uniswap v3 pool - to price or swap. There is no router, no registry, no shared
              treasury, and no proxy in front of any of them. If one were to fail, the other two
              would not notice.
            </p>
            <ArchDiagram />
          </section>

          <section id="savings" className="docs-sec">
            <span className="kicker">Mechanism</span>
            <h2>Savings backed by <b>treasuries</b></h2>
            <p>
              <span className="mono">deposit(usdgIn, minSgovOut)</span> swaps your USDG for SGOV
              through the USDG/SGOV Uniswap v3 pool and credits <span className="mono">shares[you]</span>
              with the SGOV received. The vault is a share ledger; the SGOV itself sits in the
              contract. <span className="mono">withdraw(sgovShares, minUsdgOut)</span> reverses it.
              Both take a minimum-output floor you set, so a moved price reverts rather than fills
              badly.
            </p>
            <SavingsDiagram />
            <h3>Where the yield comes from</h3>
            <p>
              SGOV is a token of an ETF that holds 0-3 month U.S. treasury bills. As those bills
              accrue, SGOV&apos;s price against USDG rises. Your share count never changes; the
              USDG value of each share does. Locksley pays nothing, takes nothing, and cannot
              change the rate - the rate is the bill.
            </p>
            <h3>Locked deposits</h3>
            <p>
              <span className="mono">depositLocked(usdgIn, minSgovOut, term)</span> works
              identically but records <span className="mono">unlockAt = now + term</span> and
              keeps the shares in a separate <span className="mono">lockedShares</span> balance.
              <span className="mono">withdrawLocked</span> reverts until that timestamp. The term
              is capped at <span className="mono">MAX_TERM = 730 days</span>. A lock earns exactly
              what an open deposit earns - it is a commitment device, not a bonus.
            </p>
            <div className="docs-formula">
              <span className="cm"># value of your position, in USDG</span><br />
              value = (shares + lockedShares) × sgovPrice<br />
              <span className="cm"># sgovPrice read from pool sqrtPriceX96, 6-decimal USDG per 18-decimal SGOV</span>
            </div>
          </section>

          <section id="payments" className="docs-sec">
            <span className="kicker">Mechanism</span>
            <h2>Standing <b>orders</b></h2>
            <p>
              <span className="mono">create(token, recipient, amount, interval, payments, startDelay, expiry)</span>
              pulls <span className="mono">amount × payments</span> into escrow and records the schedule.
              From then on, <span className="mono">execute(id)</span> pays one instalment to the
              recipient if <span className="mono">nextDue</span> has passed - and <strong>anyone may
              call it</strong>. The recipient can, a bot can, you can. The order does not depend on
              Locksley being online, because Locksley has no server in the loop.
            </p>
            <ul>
              <li><strong>Cancel</strong> - only the owner. Every unpaid instalment returns immediately.</li>
              <li><strong>Expiry</strong> - optional. Past it, <span className="mono">execute</span> reverts and cancellation is the only exit.</li>
              <li><strong>Nothing is skipped</strong> - if nobody calls execute for two intervals, the next call pays one instalment and advances the clock by one interval. Missed periods queue; they do not vanish.</li>
            </ul>
            <div className="docs-note">
              <span className="n-ico">◆</span>
              <p>Because execution is permissionless, a recipient who wants their money on time has every incentive to trigger it themselves. The schedule is a right they hold, not a favour they wait for.</p>
            </div>
          </section>

          <section id="borrow" className="docs-sec">
            <span className="kicker">Mechanism</span>
            <h2>Loans against <b>stock</b></h2>
            <p>
              Two sides share one contract. <strong>Lenders</strong> call <span className="mono">supply(usdg)</span>
              and receive reserve shares; <span className="mono">redeem</span> returns their USDG
              plus their portion of accrued interest. <strong>Borrowers</strong> call
              <span className="mono"> depositCollateral(token, fee, amount)</span> with a tokenised
              stock that has a USDG pool, then <span className="mono">borrow(usdg)</span> up to
              <span className="mono"> MAX_LTV_BPS = 50%</span> of the collateral&apos;s value.
            </p>
            <h3>How collateral is priced</h3>
            <p>
              <span className="mono">_value()</span> reads <span className="mono">sqrtPriceX96</span>
              from the stock&apos;s own Uniswap v3 pool at call time and converts it to USDG per
              share. This is the spot price, not a time-weighted average. It is honest about what
              the market says right now and it is the mechanism&apos;s biggest weakness - see
              <a href="#risks" className="mono">Risks</a>.
            </p>
            <h3>Interest</h3>
            <p>
              Debt accrues per second at <span className="mono">RATE_PER_SEC</span>, about 8% a
              year, compounded through a global index so the contract never loops over borrowers.
              Everything a borrower pays in interest goes to the reserve, which is to say to the
              lenders. There is no spread and no treasury cut.
            </p>
            <LoanDiagram />
          </section>

          <section id="liquidation" className="docs-sec">
            <span className="kicker">Mechanism</span>
            <h2>Liquidation, <b>by anyone</b></h2>
            <p>
              A position is liquidatable once debt exceeds <span className="mono">LIQ_THRESHOLD_BPS = 60%</span>
              of collateral value. Anyone may then call <span className="mono">liquidate(user, repayAmount)</span>:
              they repay up to <span className="mono">CLOSE_FACTOR_BPS = 50%</span> of the debt in USDG
              and receive collateral worth that amount plus an <span className="mono">8%</span> bonus.
              The bonus is what makes it worth someone&apos;s gas to keep the reserve solvent; the
              close factor stops a single call from emptying a position that could have recovered.
            </p>
            <div className="docs-formula">
              <span className="cm"># collateral seized for a repayment r, at stock price p</span><br />
              seized = r × <span className="gr">(1 + 0.08)</span> / p<br />
              <span className="cm"># the borrower keeps everything else and still owes the rest</span>
            </div>
            <p>
              The 10-point gap between the borrow cap and the liquidation line is deliberate. A
              borrower at exactly 50% is not one bad tick from liquidation - the stock must fall
              roughly 17% first.
            </p>
          </section>

          <section id="custody" className="docs-sec">
            <span className="kicker">Trust</span>
            <h2>Who can <b>move what</b></h2>
            <p>
              The clearest way to state the custody model is as a permission table. Three actors
              exist: you, everyone else, and Locksley. The last column is empty on purpose.
            </p>
            <CustodyDiagram />
            <p>
              Concretely: no function in any of the three contracts is gated by an owner, admin,
              guardian or multisig role. There is no <span className="mono">Ownable</span>, no
              <span className="mono"> Pausable</span>, no upgradeable proxy, no fee recipient
              variable. The deployer&apos;s key was used once, to deploy, and has no standing
              afterwards. You can confirm this by reading the source on Blockscout - it is short.
            </p>
          </section>

          <section id="cryptography" className="docs-sec">
            <span className="kicker">Trust</span>
            <h2>What the <b>cryptography</b> actually guarantees</h2>
            <p>
              Locksley adds no cryptography of its own. It rests entirely on the primitives of the
              chain, and it is worth being precise about which ones do what.
            </p>
            <h3>Authorisation: ECDSA over secp256k1</h3>
            <p>
              Every state change is a transaction signed by an Ethereum account. The contract
              checks <span className="mono">msg.sender</span> - the address recovered from that
              signature - against the ledger it keeps. Only the address that deposited can
              withdraw; only the order&apos;s owner can cancel; only the borrower can pull their
              collateral. Nobody, including us, can forge a signature for your key.
            </p>
            <h3>Integrity: the chain&apos;s consensus</h3>
            <p>
              Balances are storage slots in a contract whose bytecode is fixed at deployment and
              hashed into every block that follows. Altering a balance would mean altering
              Robinhood Chain&apos;s history. This is the same guarantee that protects USDG itself.
            </p>
            <h3>Re-entrancy and token safety</h3>
            <p>
              All three contracts inherit OpenZeppelin&apos;s <span className="mono">ReentrancyGuard</span>
              and every external state-changing function is marked <span className="mono">nonReentrant</span>,
              so a malicious token or pool callback cannot re-enter mid-operation. Token transfers
              go through <span className="mono">SafeERC20</span>, which reverts on the non-standard
              tokens that return nothing instead of <span className="mono">true</span>.
            </p>
            <h3>Price arithmetic</h3>
            <p>
              Uniswap v3 encodes price as <span className="mono">sqrtPriceX96</span>, a Q64.96
              fixed-point square root. The contracts square it with
              <span className="mono"> Math.mulDiv</span> (full 512-bit intermediate, no overflow)
              and rescale between USDG&apos;s 6 decimals and the stock&apos;s 18. Mixing those
              decimals is the classic way a vault silently misprices by 10¹²; the tests pin
              the conversion.
            </p>
            <div className="docs-note">
              <span className="n-ico">◆</span>
              <p>There is no zero-knowledge, no encryption, no off-chain signing service. What you see on-chain is the whole system. Anything that sounds more clever than that would be a place to hide something.</p>
            </div>
          </section>

          <section id="risks" className="docs-sec">
            <span className="kicker">Trust</span>
            <h2>Risks and <b>limits</b></h2>
            <p>These are the things that can go wrong. They are real, and knowing them is the price of using a system nobody can pause.</p>
            <ul>
              <li><strong>Spot-price collateral.</strong> <span className="mono">CollateralLoan</span> prices collateral from the pool&apos;s current tick, not a TWAP. A large enough flash-loan swap can move that price within one block. The 50% cap, the 60% threshold and the 50% close factor limit the damage, but a manipulated liquidation is possible. Do not put your only copy of something in as collateral.</li>
              <li><strong>SGOV is an ETF token.</strong> It carries the issuer&apos;s risk and the peg of the wrapper that brought it on-chain. Locksley cannot see or fix either.</li>
              <li><strong>Pool liquidity.</strong> Deposits and withdrawals swap through Uniswap. Thin liquidity means slippage; your <span className="mono">minOut</span> floor is the only protection. Set it.</li>
              <li><strong>Immutability cuts both ways.</strong> A bug found after deployment stays. The tests are thorough - 22 passing, including boundary and liquidation cases - but tests prove what was imagined.</li>
              <li><strong>Not a bank.</strong> No deposit insurance, no regulator, no recourse. That is the design.</li>
            </ul>
            <div className="docs-note warn">
              <span className="n-ico">▲</span>
              <p>The loan contract is the highest-risk of the three by construction. Treat it as an experiment until it has been independently audited, and size positions accordingly.</p>
            </div>
          </section>

          <section id="reference" className="docs-sec">
            <span className="kicker">Protocol</span>
            <h2><b>Reference</b></h2>
            <h3>Deployed contracts - Robinhood Chain</h3>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead><tr><th>Contract</th><th>Role</th><th>Address</th></tr></thead>
                <tbody>
                  {CONTRACTS.map(([name, role, addr]) => (
                    <tr key={addr}>
                      <td className="name">{name}</td>
                      <td>{role}</td>
                      <td><a href={`https://robinhoodchain.blockscout.com/address/${addr}`} target="_blank" rel="noreferrer"><span className="mono">{addr}</span></a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Protocol constants</h3>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead><tr><th>Constant</th><th>Value</th><th>Meaning</th></tr></thead>
                <tbody>
                  {CONSTANTS.map(([name, val, note]) => (
                    <tr key={name}>
                      <td className="name"><span className="mono">{name}</span></td>
                      <td>{val}</td>
                      <td>{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Shared addresses</h3>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead><tr><th>Name</th><th>Role</th><th>Address</th></tr></thead>
                <tbody>
                  <tr><td className="name">USDG</td><td>Quote asset, 6 decimals</td><td><span className="mono">0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168</span></td></tr>
                  <tr><td className="name">SGOV</td><td>Savings backing, 18 decimals</td><td><span className="mono">0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5</span></td></tr>
                  <tr><td className="name">Uniswap v3 Factory</td><td>Pool lookup</td><td><span className="mono">0x1f7d7550B1b028f7571E69A784071F0205FD2EfA</span></td></tr>
                  <tr><td className="name">SwapRouter02</td><td>Savings swaps</td><td><span className="mono">0xCaf681a66D020601342297493863E78C959E5cb2</span></td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      <footer className="docs-foot">
        <span>© {new Date().getFullYear()} Locksley · non-custodial, no owner, no fee</span>
        <span style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <a href={LINKS.x} target="_blank" rel="noreferrer">@locksleybank</a>
          <a href={LINKS.github} target="_blank" rel="noreferrer">GitHub</a>
          <a href={APP} className="dn-cta">Open the app ↗</a>
        </span>
      </footer>
    </div>
  );
}
