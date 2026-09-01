"use client";

import { useEffect, useState } from "react";
import { GhostChart } from "./ghost.tsx";
import { ic } from "./icons.tsx";
import { Pixels } from "./pixels.tsx";
import type { PVPoint } from "./api/portfolio/route.ts";

const RANGES = ["1D", "1W", "1M"] as const;
type RangeKey = (typeof RANGES)[number];

/**
 * Portfolio value over the chosen window.
 *
 * Every point is the wallet's holdings at that moment priced at *today's*
 * rates — so the line shows the position being built, not the market moving.
 * That caveat is printed under the chart rather than left for someone to
 * discover when the shape disagrees with their broker.
 */
export function ValueChart({
  address,
  fmt,
  reloadKey,
  compact = false,
}: {
  address: string;
  fmt: (usd: number) => string;
  reloadKey: number;
  /** Narrow column beside the allocation ring, rather than full width. */
  compact?: boolean;
}) {
  const [range, setRange] = useState<RangeKey>("1W");
  const [points, setPoints] = useState<PVPoint[] | null>(null);
  const [full, setFull] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!address) {
      setPoints([]);
      return;
    }
    let live = true;
    setPoints(null);
    setError(null);
    void (async () => {
      try {
        const r = await fetch(`/api/portfolio?address=${address}&range=${range}`);
        const j = await r.json();
        if (!live) return;
        if (!r.ok) setError(j.error ?? "Couldn't rebuild the history");
        else {
          setPoints(j.points as PVPoint[]);
          setFull(j.full !== false);
        }
      } catch {
        if (live) setError("Couldn't reach the history service");
      }
    })();
    return () => {
      live = false;
    };
  }, [address, range, reloadKey]);

  const picker = (
    <div className="ranges">
      {RANGES.map((r) => (
        <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>
          {r}
        </button>
      ))}
    </div>
  );

  const frame = (inner: React.ReactNode) => (
    <section className={`panelbox${compact ? " compact" : ""}`}>
      <div className="secthead" style={{ marginBottom: 8 }}>
        <h3>{ic.chart} Total value <span className="muted" style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· equities + USDG</span></h3>
        {picker}
      </div>
      {inner}
    </section>
  );

  if (!address)
    return frame(
      <div className="chart empty">
        <div>
          <GhostChart />
          Connect a wallet to chart its value.
        </div>
      </div>,
    );
  if (error) return frame(<div className="chart empty err">{error}</div>);
  if (!points) return frame(<div className="chart empty">Rebuilding from the chain…</div>);
  if (points.length < 2 || points.every((p) => p.value === 0)) {
    return frame(
      <div className="chart empty">
        <div>
          <GhostChart />
          No assets held in this window.
        </div>
      </div>,
    );
  }

  const W = 620;
  const H = 170;
  const PAD = 8;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  // A flat line would divide by zero; give it range so it sits mid-box.
  const span = hi - lo || hi * 0.08 || 1;

  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - PAD * 2);

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;

  const first = points[0].value;
  const last = points[points.length - 1].value;
  const up = last >= first;
  const change = first > 0 ? ((last - first) / first) * 100 : last > 0 ? 100 : 0;
  const shown = hover === null ? last : points[hover].value;

  return frame(
    <div className="chart">
      <div className="chart-head">
        <div>
          <b>{fmt(shown)}</b>
          {hover !== null && (
            <span className="dim"> · {new Date(points[hover].t).toLocaleString()}</span>
          )}
        </div>
        <span className={up ? "up" : "down"}>
          {up ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% this {range === "1D" ? "day" : range === "1W" ? "week" : "month"}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Portfolio value over the last ${range}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - box.left) / box.width;
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
        }}
      >
        <defs>
          <linearGradient id="pvfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a8c800" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#a8c800" stopOpacity="0" />
          </linearGradient>
        </defs>
        <Pixels values={vals} width={W} height={H} cols={80} cell={5} gap={2} padX={PAD} padY={PAD}
          color={up ? "#2f8f47" : "#b8342e"} glow={up ? "#7fdb5a" : "#ff6b61"} />
        {hover !== null && (
          <>
            <line x1={x(hover)} y1={0} x2={x(hover)} y2={H} stroke="#141614" strokeOpacity="0.22"
                  strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <rect x={x(hover) - 4} y={y(points[hover].value) - 4} width="8" height="8" rx="2"
                  fill={up ? "#7fdb5a" : "#ff6b61"} stroke="#fff" strokeWidth="1.5" />
          </>
        )}
      </svg>

      <div className="chart-foot">
        <span>
          {new Date(points[0].t).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {!full && " · history starts here"}
        </span>
        <span>holdings at today&apos;s prices · not a performance curve</span>
      </div>
    </div>
  );
}
