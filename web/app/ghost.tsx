/**
 * Ghost furniture for empty states.
 *
 * An empty card keeps the shape of what will eventually fill it — ghost rows
 * where a ledger will be, a ghost trace where a chart will be — breathing
 * slowly, so the emptiness reads as "not yet" instead of "broken". Decoration
 * only: every ghost is aria-hidden and the words beside it still carry the
 * meaning.
 */

/** Three ledger rows: dot, line, figure — the shape of a transfer list. */
export function GhostRows() {
  return (
    <div className="ghost" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div className="ghost-row" key={i} style={{ animationDelay: `${i * 260}ms` }}>
          <i className="ga" />
          <i className="gb" style={{ width: `${72 - i * 14}%` }} />
          <i className="gc" />
        </div>
      ))}
    </div>
  );
}

/** A wave of ghost pixels — the shape of a chart waiting for data, drawn in
 *  the same LED grammar the live charts use, breathing column by column. */
export function GhostChart() {
  const cols = 36, rows = 7, cell = 4, gap = 2;
  const w = cols * (cell + gap), h = rows * (cell + gap);
  const cells: { x: number; y: number; top: boolean; i: number }[] = [];
  for (let c = 0; c < cols; c++) {
    const v = Math.round(((Math.sin(c / 4.5) + 1) / 2) * (rows - 2)) + 1;
    for (let r = 0; r < v; r++) cells.push({ x: c * (cell + gap), y: h - (r + 1) * (cell + gap), top: r === v - 1, i: c });
  }
  return (
    <svg className="ghost-chart" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      {cells.map((p, k) => (
        <rect key={k} x={p.x} y={p.y} width={cell} height={cell} rx="1"
          className={p.top ? "gp-top" : "gp"} style={{ ["--i" as string]: p.i }} />
      ))}
    </svg>
  );
}
