/**
 * Inline SVG icons.
 *
 * Inline rather than an icon package: this is a dozen glyphs, and a dependency
 * would ship more bytes than the whole set. They inherit currentColor and take
 * their size from the CSS, so a single rule restyles all of them.
 *
 * Motion lives in globals.css keyed off `data-act`, matching HoodBank: the
 * icon reacts on press, not on hover, so a pointer crossing the screen does not
 * set the whole page twitching.
 */

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const ic = {
  wallet: (
    <svg {...base}>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H18a2 2 0 0 1 2 2v1" />
      <path d="M3 8.5V17a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-3" />
      <path d="M20 10.5h-3.5a1.75 1.75 0 0 0 0 3.5H20z" />
    </svg>
  ),
  deposit: (
    <svg {...base}>
      <path d="M12 3v12" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 19h16" />
    </svg>
  ),
  receive: (
    <svg {...base}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1" />
    </svg>
  ),
  swap: (
    <svg {...base}>
      <path d="M4 8h13l-3.5-3.5" />
      <path d="M20 16H7l3.5 3.5" />
    </svg>
  ),
  chart: (
    <svg {...base}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="m7.5 14.5 3.5-4 3 2.5 4.5-6" />
    </svg>
  ),
  clock: (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  copy: (
    <svg {...base}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15h-.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </svg>
  ),
  check: (
    <svg {...base} strokeWidth={2.1}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  ),
  key: (
    <svg {...base}>
      <circle cx="8" cy="8" r="4" />
      <path d="m11 11 8 8" />
      <path d="m16 16 2-2M19 19l2-2" />
    </svg>
  ),
  out: (
    <svg {...base}>
      <path d="M14 5h5v5" />
      <path d="M19 5 10 14" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </svg>
  ),
  up: (
    <svg {...base}>
      <path d="M12 19V6" />
      <path d="m6.5 11.5 5.5-5.5 5.5 5.5" />
    </svg>
  ),
  down: (
    <svg {...base}>
      <path d="M12 5v13" />
      <path d="m6.5 12.5 5.5 5.5 5.5-5.5" />
    </svg>
  ),
  search: (
    <svg {...base}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  ),
  chevron: (
    <svg {...base}>
      <path d="m6 9.5 6 6 6-6" />
    </svg>
  ),
  refresh: (
    <svg {...base}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.5h-4.5" />
    </svg>
  ),
};
