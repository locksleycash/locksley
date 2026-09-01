"use client";

import { useEffect, useRef, useState } from "react";
import type { Point } from "./api/chart/route.ts";
import { Pixels } from "./pixels.tsx";

/**
 * A small live price trace for a card, drawn as lit pixels: the last week of
 * fills, green when the window closed higher, rose when lower.
 *
 * Fetches only once the card is on screen. A board of fifty cards firing
 * fifty explorer reads on mount is what made the Market tab stall; with the
 * observer, only the visible dozen load, and the rest as they scroll in.
 * Results are cached per symbol for the session.
 */
const cache = new Map<string, Point[]>();
const inflight = new Map<string, Promise<Point[] | null>>();

/** Shared across Spark, the ticker strip and the change badges, so a symbol's
 *  history is fetched once no matter how many widgets show it. */
export function loadPoints(symbol: string): Promise<Point[] | null> {
  return load(symbol);
}
export function peekPoints(symbol: string): Point[] | null {
  return cache.get(symbol) ?? null;
}

function load(symbol: string): Promise<Point[] | null> {
  if (cache.has(symbol)) return Promise.resolve(cache.get(symbol)!);
  if (inflight.has(symbol)) return inflight.get(symbol)!;
  const p = fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=7D`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { points?: Point[] } | null) => {
      const pts = j?.points ?? null;
      if (pts) cache.set(symbol, pts);
      return pts;
    })
    .catch(() => null)
    .finally(() => inflight.delete(symbol));
  inflight.set(symbol, p);
  return p;
}

export function Spark({ symbol, width = 96, height = 30 }: { symbol: string; width?: number; height?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pts, setPts] = useState<Point[] | null>(cache.get(symbol) ?? null);

  useEffect(() => {
    if (cache.has(symbol)) { setPts(cache.get(symbol)!); return; }
    const el = ref.current;
    if (!el) return;
    let live = true;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      void load(symbol).then((p) => live && p && setPts(p));
    }, { rootMargin: "120px" });
    io.observe(el);
    return () => { live = false; io.disconnect(); };
  }, [symbol]);

  if (!pts || pts.length < 2) return <span ref={ref} className="spark empty" style={{ width, height }} />;

  const ps = pts.map((p) => p.price);
  const up = ps[ps.length - 1] >= ps[0];

  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <Pixels values={ps} width={width} height={height} cell={3} gap={1} padY={2} cols={32} glowFx={false}
        color={up ? "#2a9c63" : "#b84a40"} glow={up ? "#5fe89b" : "#ff8b7d"} />
    </svg>
  );
}
