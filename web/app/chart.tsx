"use client";

import { useEffect, useState } from "react";
import type { Point } from "./api/chart/route.ts";
import { Pixels } from "./pixels.tsx";

/**
 * A line chart drawn as plain SVG.
 *
 * No charting library: this needs one series, no interaction beyond a hover
 * readout, and the data is a few dozen points. A dependency would be more code
 * shipped than the whole component.
 */
const RANGES = ["1D", "7D", "30D"] as const;
type RangeKey = (typeof RANGES)[number];
const SPOKEN: Record<RangeKey, string> = { "1D": "day", "7D": "week", "30D": "30 days" };

export function PriceChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<RangeKey>("7D");
  const [points, setPoints] = useState<Point[] | null>(null);
  const [trades, setTrades] = useState(0);
  const [windowed, setWindowed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setPoints(null);
    setError(null);
    void (async () => {
      try {
        const r = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`);
        const j = await r.json();
        if (!live) return;
        // A failure and a quiet market are different answers; only one of them
        // is the market's fault.
        if (!r.ok) setError(j.error ?? "Couldn't read the trade history");
        else {
          setPoints(j.points as Point[]);
          setTrades(j.trades ?? 0);
          setWindowed(j.windowed !== false);
        }
      } catch {
        if (live) setError("Couldn't reach the history service");
      }
    })();
    return () => {
      live = false;
    };
  }, [symbol, range]);

  const picker = (
    <div className="ranges">
      {RANGES.map((r) => (
        <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>
          {r}
        </button>
      ))}
      {!windowed && <span className="dim" style={{ fontSize: 11, alignSelf: "center" }}>latest trades</span>}
    </div>
  );

  if (error) {
    return (
      <div className="chart">
        {picker}
        <div className="chart empty err">{error}</div>
      </div>
    );
  }
  if (!points) return <div className="chart">{picker}<div className="chart empty">Reading past trades…</div></div>;
  if (points.length < 2) {
    return (
      <div className="chart">
        {picker}
        <div className="chart empty">
          This market has not traded in the last {SPOKEN[range]} — try a longer range.
        </div>
      </div>
    );
  }

  const W = 560;
  const H = 160;
  const PAD = 6;

  const prices = points.map((p) => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  // A perfectly flat series would divide by zero; give it a hair of range so
  // the line lands mid-box instead of vanishing.
  const span = hi - lo || hi * 0.001 || 1;

  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (p: number) => PAD + (1 - (p - lo) / span) * (H - PAD * 2);

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;

  const first = points[0].price;
  const last = points[points.length - 1].price;
  const change = ((last - first) / first) * 100;
  const up = last >= first;
  const shown = hover === null ? last : points[hover].price;

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* Sidebar-and-plot, not HoodStock's stacked head/graph/foot: the numbers
     live in a rail on the left and the chart gets the full remaining width. */
  return (
    <div className="chart duo">
      <aside className="ch-side">
        <div className="ch-k">
          {hover !== null ? new Date(points[hover].t).toLocaleString() : "Last trade"}
        </div>
        <div className="ch-price">${fmt(shown)}</div>
        <span className={`ch-chg ${up ? "up" : "down"}`}>
          {up ? "▲" : "▼"} {Math.abs(change).toFixed(2)}% over the {SPOKEN[range]}
        </span>

        {picker}

        <dl className="ch-stats">
          <div>
            <dt>High</dt>
            <dd>${fmt(hi)}</dd>
          </div>
          <div>
            <dt>Low</dt>
            <dd>${fmt(lo)}</dd>
          </div>
          <div>
            <dt>Trades</dt>
            <dd>{trades.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt>Since</dt>
            <dd>{new Date(points[0].t).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</dd>
          </div>
        </dl>
      </aside>

      <div className="ch-plot">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${symbol} price over the last ${points.length} trades`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - box.left) / box.width;
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
        }}
      >
        <defs>
          <linearGradient id="fillgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? "#3ad07f" : "#ff5f4a"} stopOpacity="0.2" />
            <stop offset="100%" stopColor={up ? "#3ad07f" : "#ff5f4a"} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Baseline at the opening price: the dashes are what the eye measures
            the move against, which a bare line never gives it. */}
        <line x1={PAD} y1={y(first)} x2={W - PAD} y2={y(first)}
              stroke="#7a8277" strokeOpacity="0.45" strokeWidth="1"
              strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        {/* Faint rails at the window's high and low. */}
        <line x1={PAD} y1={y(hi)} x2={W - PAD} y2={y(hi)}
              stroke="#7a8277" strokeOpacity="0.14" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1={PAD} y1={y(lo)} x2={W - PAD} y2={y(lo)}
              stroke="#7a8277" strokeOpacity="0.14" strokeWidth="1" vectorEffect="non-scaling-stroke" />

        <Pixels values={prices} width={W} height={H} cols={72} cell={5} gap={2} padX={PAD} padY={PAD}
          color={up ? "#2a9c63" : "#b84a40"} glow={up ? "#5fe89b" : "#ff8b7d"} />
        {hover !== null && (
          <>
            <line x1={x(hover)} y1={0} x2={x(hover)} y2={H} stroke="#eceef2" strokeOpacity="0.3"
                  strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <rect x={x(hover) - 4} y={y(points[hover].price) - 4} width="8" height="8" rx="2"
                  fill={up ? "#5fe89b" : "#ff8b7d"} stroke="#0a0b0d" strokeWidth="1.5" />
          </>
        )}
      </svg>
      </div>
    </div>
  );
}
