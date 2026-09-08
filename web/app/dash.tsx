"use client";

import { useEffect, useState } from "react";
import type { Point } from "./api/chart/route.ts";

const UP = "#10a35c", DOWN = "#d4384a", GREY = "#8b8b93";

/** A mini line sparkline for the highlighted tiles. */
export function Spark({ points, w = 120, h = 30 }: { points: Point[] | null; w?: number; h?: number }) {
  if (!points || points.length < 2) return <svg width={w} height={h} aria-hidden />;
  const ps = points.map((p) => p.price), lo = Math.min(...ps), hi = Math.max(...ps), span = hi - lo || 1;
  const up = ps[ps.length - 1] >= ps[0];
  const d = ps.map((v, i) => `${i ? "L" : "M"}${(i / (ps.length - 1) * w).toFixed(1)},${(h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden style={{ width: "100%", height: h }}>
      <path d={d} fill="none" stroke={up ? UP : GREY} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
      <circle cx={w} cy={h - 2 - ((ps[ps.length - 1] - lo) / span) * (h - 4)} r="2.4" fill={up ? UP : GREY} />
    </svg>
  );
}

/** Where the money sits, as a ring. */
export function Donut({ parts, size = 148 }: { parts: { label: string; value: number; color: string }[]; size?: number }) {
  const live = parts.filter((p) => p.value > 0);
  const total = live.reduce((s, p) => s + p.value, 0);
  const r = size / 2 - 13, C = 2 * Math.PI * r, cx = size / 2;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ flex: "none" }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e8e8ec" strokeWidth={15} />
      {total > 0 && live.map((p) => {
        const frac = p.value / total, dash = frac * C;
        const el = <circle key={p.label} cx={cx} cy={cx} r={r} fill="none" stroke={p.color} strokeWidth={15}
          strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc * C} transform={`rotate(-90 ${cx} ${cx})`} />;
        acc += frac; return el;
      })}
      <text x={cx} y={cx - 1} textAnchor="middle" fontSize="21" fontWeight="700" fill="#000000">{live.length}</text>
      <text x={cx} y={cx + 15} textAnchor="middle" fontSize="9.5" fill="#8b8b93">buckets</text>
    </svg>
  );
}

interface Candle { o: number; h: number; l: number; c: number }
function toCandles(points: Point[], target = 30): Candle[] {
  if (points.length < 2) return [];
  const t0 = points[0].t, t1 = points[points.length - 1].t, w = Math.max(1, t1 - t0) / target;
  const out: Candle[] = []; let prev: number | null = null;
  for (let i = 0; i < target; i++) {
    const inB = points.filter((p) => (p.t >= t0 + i * w && p.t < t0 + (i + 1) * w) || (i === target - 1 && p.t === t1));
    if (!inB.length) continue;
    const ps = inB.map((p) => p.price), o = prev ?? ps[0], c = ps[ps.length - 1];
    out.push({ o, h: Math.max(...ps, o), l: Math.min(...ps, o), c }); prev = c;
  }
  return out;
}

const RANGES: [string, string][] = [["1W", "7D"], ["1M", "30D"], ["6M", "30D"], ["1Y", "30D"]];

/** Candle chart of the SGOV price — the savings backing. */
export function CandleChart({ symbol = "SGOV" }: { symbol?: string }) {
  const [range, setRange] = useState("1W");
  const [pts, setPts] = useState<Point[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true; setPts(null); setErr(false);
    const api = RANGES.find(([l]) => l === range)?.[1] ?? "7D";
    fetch(`/api/chart?symbol=${symbol}&range=${api}`).then((r) => r.json()).then((j) => { if (!live) return; if (Array.isArray(j.points) && j.points.length >= 2) setPts(j.points); else setErr(true); }).catch(() => live && setErr(true));
    return () => { live = false; };
  }, [symbol, range]);

  const candles = pts ? toCandles(pts) : [];
  const W = 720, H = 240, PAD = 8, AX = 52, plotW = W - PAD - AX;
  const ps = pts?.map((p) => p.price) ?? [];
  const lo = ps.length ? Math.min(...ps) : 0, hi = ps.length ? Math.max(...ps) : 1, span = hi - lo || hi * 0.002 || 1;
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - PAD * 2);
  const slot = candles.length ? plotW / candles.length : 0;
  const last = ps[ps.length - 1] ?? 0;
  const ticks = [0, 1, 2, 3, 4].map((i) => lo + (span * i) / 4);

  return (
    <div className="bchart">
      <div className="bchart-h">
        <h3>Savings backing · {symbol}</h3><span className="sp" />
        <div className="bseg">{RANGES.map(([l]) => <button key={l} className={range === l ? "on" : ""} onClick={() => setRange(l)}>{l}</button>)}</div>
      </div>
      {err ? <div className="bchart-empty">Couldn&apos;t read the price right now.</div>
        : !pts ? <div className="bchart-empty">Reading the pool…</div>
        : candles.length < 2 ? <div className="bchart-empty">Not enough trades in this window.</div>
        : (
          <svg className="bchart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            {ticks.map((t) => (
              <g key={t}><line x1={PAD} y1={y(t)} x2={W - AX + 4} y2={y(t)} stroke="#e8e8ec" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <text x={W - AX + 8} y={y(t) + 3} fontSize="10" fill="#8b8b93">${t.toFixed(t >= 100 ? 0 : 2)}</text></g>
            ))}
            <line x1={PAD} y1={y(last)} x2={W - AX + 4} y2={y(last)} stroke="#10a35c" strokeOpacity=".45" strokeDasharray="3 5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            {candles.map((c, i) => {
              const rising = c.c >= c.o, col = rising ? UP : DOWN, cx = PAD + i * slot + slot / 2, bw = Math.max(3, slot * 0.6);
              return <g key={i}><line x1={cx} y1={y(c.h)} x2={cx} y2={y(c.l)} stroke={col} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                <rect x={cx - bw / 2} y={Math.min(y(c.o), y(c.c))} width={bw} height={Math.max(1.5, Math.abs(y(c.o) - y(c.c)))} rx="1" fill={col} /></g>;
            })}
          </svg>
        )}
    </div>
  );
}

/** SGOV price series for the highlighted-tile sparkline. */
export function useSgovSeries(): Point[] | null {
  const [pts, setPts] = useState<Point[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/chart?symbol=SGOV&range=30D").then((r) => r.json()).then((j) => live && Array.isArray(j.points) && setPts(j.points)).catch(() => {});
    return () => { live = false; };
  }, []);
  return pts;
}
