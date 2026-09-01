/**
 * Pixel-glow series: a chart drawn as lit squares instead of a line.
 *
 * The series is resampled onto a fixed column grid; each column stacks
 * squares from the baseline up to its value, the top one brightest and
 * glowing, the ones beneath fading — a bar of LEDs. Columns light up left
 * to right on mount (the `--i` delay), so the chart reads as switching on
 * rather than appearing.
 *
 * Pure SVG; pass viewBox-space width/height and the series, get a group.
 */
export function Pixels({
  values,
  width,
  height,
  cols = 48,
  cell = 5,
  gap = 1.5,
  color = "#47b02b",
  glow = "#7fdb5a",
  padX = 0,
  padY = 4,
  /** The blur filter is expensive at scale; a board of sparklines turns it off. */
  glowFx = true,
}: {
  values: number[];
  width: number;
  height: number;
  cols?: number;
  cell?: number;
  gap?: number;
  color?: string;
  glow?: string;
  padX?: number;
  padY?: number;
  glowFx?: boolean;
}) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || hi * 0.05 || 1;

  // Resample to `cols` columns by nearest index.
  const n = Math.min(cols, Math.max(2, Math.floor((width - padX * 2) / (cell + gap))));
  const colW = (width - padX * 2) / n;
  const rows = Math.max(2, Math.floor((height - padY * 2) / (cell + gap)));
  const rowH = (height - padY * 2) / rows;

  const cellsOut: { x: number; y: number; a: number; top: boolean; i: number }[] = [];
  for (let c = 0; c < n; c++) {
    const src = Math.round((c / (n - 1)) * (values.length - 1));
    const v = values[src];
    const lit = Math.max(1, Math.round(((v - lo) / span) * (rows - 1)) + 1);
    for (let r = 0; r < lit; r++) {
      const top = r === lit - 1;
      // Fade below the top cell so the shape reads as a line with a tail.
      const a = top ? 1 : Math.max(0.08, 0.42 - (lit - 1 - r) * 0.09);
      cellsOut.push({
        x: padX + c * colW + (colW - cell) / 2,
        y: height - padY - (r + 1) * rowH + (rowH - cell) / 2,
        a,
        top,
        i: c,
      });
    }
  }

  return (
    <g className={glowFx ? "px" : "px lite"}>
      <defs>
        <filter id="pxglow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.8" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {cellsOut.map((p, k) => (
        <rect
          key={k}
          x={p.x.toFixed(2)}
          y={p.y.toFixed(2)}
          width={cell}
          height={cell}
          rx={1}
          fill={p.top ? glow : color}
          opacity={p.a}
          filter={p.top && glowFx ? "url(#pxglow)" : undefined}
          className={p.top ? "px-top" : "px-cell"}
          style={{ ["--i" as string]: p.i }}
        />
      ))}
    </g>
  );
}
