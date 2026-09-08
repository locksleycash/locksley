import type { Metadata } from "next";
import { STOCKS } from "../../src/stocks.ts";
import { poolFor } from "../../src/pools.ts";
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
const Mark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 10.5V8a5 5 0 0110 0v2.5" /><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M12 14v3.5" />
  </svg>
);

/** Tickers accepted as collateral. Real symbols off the catalogue, so the rail
 *  states a fact rather than borrowing someone else's logo. */
const TICKERS = STOCKS.filter((s) => poolFor.has(s.symbol)).slice(0, 12).map((s) => s.symbol);

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
              <a href="/#save">Save</a>
              <a href="/#pay">Pay</a>
              <a href="/#borrow">Borrow</a>
              <a href="/#built">Built on</a>
              <a href="/">Live stats</a>
            </div>
            <a className="hal-cta" href="/">Open the app</a>
          </div>
        </nav>

        <header className="hal-hero">
          <div className="hal-card">
            <div className="hal-hero-in">
              <h1 className="hal-h1">Your cash<br />keeps working</h1>
              <p className="hal-sub">
                A non-custodial bank on RH Chain. Savings held as short U.S. treasuries,
                payments that run on schedule, and loans against the stocks you already own.
              </p>
              <a className="hal-pill" href="/">Open the app<i><Arrow /></i></a>

              <div className="hal-marq hero" aria-hidden>
                <div className="hal-marq-track">
                  {[...TICKERS, ...TICKERS].map((t, i) => (
                    <span key={`${t}${i}`} style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{t}</span>
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
              <a className="hal-pill" href="/">Open the app<i><Arrow /></i></a>
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
          </div>

          <div className="hal-panel" id="borrow">
            <div className="hal-panel-in">
              <h3>Standing orders</h3>
              <p>
                Escrow USDG once and it pays out on schedule - rent, a salary, an
                allowance. Anyone can push a due payment, so it never waits on us being
                online, and cancelling returns whatever has not gone out yet.
              </p>
              <a className="hal-more" href="/"><i><Arrow /></i>Know more</a>
            </div>
          </div>
        </div>
      </section>

      <footer className="hal-foot">
        <div className="hal-in hal-foot-in">
          <span className="hal-brand" style={{ fontSize: 18 }}><Mark />Locksley</span>
          <span className="sp" />
          <span>Non-custodial. No admin key, no pause switch, no fee.</span>
        </div>
      </footer>
    </div>
  );
}
