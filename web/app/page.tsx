import type { Metadata } from "next";
import { STOCKS } from "../src/stocks.ts";
import { poolFor } from "../src/pools.ts";
import { StockLogo } from "./logo.tsx";
import "./home.css";

export const metadata: Metadata = {
  title: "Locksley - non-custodial banking on RH Chain",
  description: "Savings held as short U.S. treasuries, payments that run on schedule, and loans against the stocks you already own. No admin key, no fees.",
};

const Arrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h13M12 5l7 7-7 7" />
  </svg>
);

/** The padlock-and-bow mark, same as the app's nav. */
// eslint-disable-next-line @next/next/no-img-element -- a 256px static mark; next/image buys nothing here.
const Mark = () => <img className="hal-mark" src="/logo.png" alt="" width={28} height={28} />;

/** Tickers accepted as collateral. Real symbols off the catalogue, so the rail
 *  states a fact rather than borrowing someone else's logo. */
const TICKERS = STOCKS.filter((s) => poolFor.has(s.symbol)).slice(0, 12);

/** What the bank is actually built on. Each of these is a dependency we call,
 *  never a backer or a partner - saying otherwise would be a lie. */
const BUILT: [string, React.CSSProperties][] = [
  ["RH Chain", { fontFamily: "Georgia, serif", fontWeight: 600, letterSpacing: "-0.02em", fontSize: 17 }],
  ["UNISWAP V3", { fontFamily: "Arial Black, Arial, sans-serif", fontWeight: 900, letterSpacing: "0.08em", fontSize: 15 }],
  ["USDG", { fontFamily: "Impact, Arial Narrow, sans-serif", fontWeight: 700, letterSpacing: "0.05em", fontSize: 18 }],
  ["SGOV", { fontFamily: "'Courier New', monospace", fontWeight: 700, letterSpacing: "0.18em", fontSize: 14 }],
  ["Blockscout", { fontFamily: "Verdana, sans-serif", fontWeight: 700, letterSpacing: "-0.01em", fontSize: 14 }],
  ["Foundry", { fontFamily: "Palatino, 'Book Antiqua', serif", fontWeight: 500, letterSpacing: "0.03em", fontSize: 16 }],
  ["ERC-20", { fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, letterSpacing: "0.06em", fontSize: 15 }],
  ["EVM 4663", { fontFamily: "'Times New Roman', serif", fontWeight: 400, letterSpacing: "0.02em", fontSize: 15 }],
];

/** The three contracts, as deployed. Every address links to its verified source. */
const CONTRACTS: [string, string][] = [
  ["Savings", "0xF28571Da91c7A8d3511A57f81b57098f9d1970b8"],
  ["StandingOrders", "0x9188572646DCa8460360267CCE10cB88a764743E"],
  ["CollateralLoan", "0x4b5181c539954b28cF69a05b9eC45161c6eC587A"],
];

/** The three jobs one deposit can do. */
const MODES: [string, string, string][] = [
  ["01", "Save", "USDG becomes SGOV. Withdraw the free part any second; lock a term if you want to."],
  ["02", "Pay", "Escrow once, it pays out on schedule. Cancel and the rest comes back."],
  ["03", "Borrow", "Post a stock, draw up to half its value in USDG, never sell."],
];

const CARDS: [string, string, string][] = [
  ["Savings that earn the bill", "Your USDG buys SGOV - short U.S. treasuries - held in the vault under your name. The yield is the treasury bill's, not a rate we invented.", "art"],
  ["Withdraw whenever", "Nothing is locked unless you choose a term yourself. The free balance leaves the moment you ask for it.", "dark"],
  ["Nobody holds it but you", "No admin key, no pause switch, no fee. The contracts answer to your wallet and to nothing else.", "dark"],
];

export default function Home() {
  return (
    <div className="hal">
      {/* ---- nav + hero share one viewport ---- */}
      <div className="hal-first">
        <nav className="hal-top">
          <div className="hal-in hal-top-in">
            <span className="hal-brand"><Mark />Locksley</span>
            <div className="hal-nav">
              <a href="#save">Save</a>
              <a href="#pay">Pay</a>
              <a href="#borrow">Borrow</a>
              <a href="#built">Built on</a>
              <a href="/app">Live stats</a>
            </div>
            <a className="hal-cta" href="/app">Open the app</a>
          </div>
        </nav>

        <header className="hal-hero">
          <div className="hal-card">
            <video className="hal-vid" src="/media/hero.mp4" autoPlay muted loop playsInline preload="metadata" aria-hidden />
            <div className="hal-hero-in">
              <h1 className="hal-h1">Your cash<br />keeps working</h1>
              <p className="hal-sub">
                A non-custodial bank on RH Chain. Savings held as short U.S. treasuries,
                payments that run on schedule, and loans against the stocks you already own.
              </p>
              <a className="hal-pill" href="/app">Open the app<i><Arrow /></i></a>

              <div className="hal-marq hero" aria-hidden>
                <div className="hal-marq-track">
                  {[...TICKERS, ...TICKERS].map((s, i) => (
                    <span key={`${s.symbol}${i}`}>
                      <StockLogo symbol={s.symbol} address={s.address} size={22} eager={i < 8} />
                      {s.symbol}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </header>
      </div>

      {/* ---- 3. what it is ---- */}
      <section className="hal-sec" id="save">
        <div className="hal-in">
          <div className="hal-row2">
            <div>
              <h2 className="hal-h2">Meet Locksley.</h2>
              <a className="hal-pill" href="/app">Open the app<i><Arrow /></i></a>
            </div>
            <p className="hal-lede">
              A savings and loan, rebuilt as three contracts you can read: deposit and
              earn what treasuries earn, schedule payments that run without you, and
              borrow against your stocks without selling them.
            </p>
          </div>

          <div className="hal-cards">
            {CARDS.map(([h, p, kind], i) => (
              <div className={`hal-c ${kind}${i === 0 ? " wide" : ""}`} key={h}>
                <h3>{h}</h3>
                {kind === "dark" && (
                  <span className="hal-c-ico" aria-hidden>
                    <svg className={i === 1 ? "hal-ani open" : "hal-ani hold"} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      {i === 1
                        ? <><path className="shackle" d="M20 28V20a12 12 0 0124 0v3" /><rect x="14" y="28" width="36" height="26" rx="5" /><path className="out" d="M32 47V36M26 41l6-6 6 6" /></>
                        : <><rect x="12" y="26" width="40" height="28" rx="5" pathLength={1} /><path d="M20 26v-6a12 12 0 0124 0v6" pathLength={1} /><circle className="key" cx="32" cy="40" r="4" pathLength={1} /><path className="key" d="M32 44v5" pathLength={1} /></>}
                    </svg>
                  </span>
                )}
                <p>{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- 4. built on ---- */}
      <section className="hal-built" id="built">
        <div className="hal-in hal-built-in">
          <p>Built on public infrastructure,<br />every piece verifiable on-chain.</p>
          <div className="hal-marq backers" aria-hidden>
            <div className="hal-marq-track">
              {[...BUILT, ...BUILT].map(([n, st], i) => (
                <span key={`${n}${i}`} style={st}>{n}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---- 5. in practice ---- */}
      <section className="hal-sec" id="pay">
        <div className="hal-in hal-uses">
          <div className="hal-uses-l">
            <div className="hal-eyebrow">Locksley in practice</div>
            <h2 className="hal-h2 big">Use modes</h2>
            <p>
              One deposit, three jobs. Treasuries hold the balance, standing orders move
              it on time, and a loan draws against the stocks without touching either.
            </p>
            <div className="hal-modes">
              {MODES.map(([n, t, d]) => (
                <a className="hal-mode" href="/app" key={n}>
                  <span className="hal-mode-n">{n}</span>
                  <span className="hal-mode-t"><b>{t}</b><small>{d}</small></span>
                  <i><Arrow /></i>
                </a>
              ))}
            </div>
          </div>

          <div className="hal-panel" id="borrow">
            <video className="hal-vid" src="/media/uses.mp4" autoPlay muted loop playsInline preload="metadata" aria-hidden />
            <div className="hal-panel-in">
              <h3>Standing orders</h3>
              <p>
                Escrow USDG once and it pays out on schedule - rent, a salary, an
                allowance. Anyone can push a due payment, so it never waits on us being
                online, and cancelling returns whatever has not gone out yet.
              </p>
              <a className="hal-more" href="/app"><i><Arrow /></i>Know more</a>
            </div>
          </div>
        </div>
      </section>

      <footer className="hal-foot">
        <div className="hal-in hal-foot-grid">
          <div className="hal-foot-brand">
            <span className="hal-brand" style={{ fontSize: 20 }}><Mark />Locksley</span>
            <p>A savings and loan rebuilt as three contracts you can read. Only your key moves your money.</p>
            <span className="hal-foot-live">● Live on RH Chain · 4663</span>
          </div>

          <div>
            <h4>Product</h4>
            <a href="/app">Savings</a>
            <a href="/app">Payments</a>
            <a href="/app">Borrow &amp; Earn</a>
            <a href="/app">Live Stats</a>
          </div>

          <div>
            <h4>Contracts</h4>
            {CONTRACTS.map(([name, addr]) => (
              <a key={addr} href={`https://robinhoodchain.blockscout.com/address/${addr}`} target="_blank" rel="noreferrer">
                {name} <span className="hal-foot-addr">{addr.slice(0, 6)}…{addr.slice(-4)}</span>
              </a>
            ))}
          </div>

          <div>
            <h4>Network</h4>
            <a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noreferrer">Explorer</a>
            <a href="https://robinhoodchain.blockscout.com/token/0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" target="_blank" rel="noreferrer">USDG</a>
            <a href="https://robinhoodchain.blockscout.com/token/0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5" target="_blank" rel="noreferrer">SGOV</a>
            <a href="#built">Built on</a>
          </div>
        </div>

        <div className="hal-in hal-foot-in">
          <span>© {new Date().getFullYear()} Locksley</span>
          <span className="sp" />
          <span>Non-custodial. No admin key, no pause switch, no fee. Not a bank; not FDIC insured.</span>
        </div>
      </footer>
    </div>
  );
}
