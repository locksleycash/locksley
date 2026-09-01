"use client";

import { useState } from "react";

/**
 * A stock's mark: letter tile first, real logo on top once it arrives.
 *
 * The order matters. Rendering the image alone and swapping to a fallback
 * onError leaves a blank square for as long as the request takes to fail —
 * and on a network that blocks Robinhood's CDN that is ten seconds, which is
 * what "the logos are blank" actually was. Painting the tile first means the
 * grid is complete on the first frame and the logo is an upgrade, never a wait.
 */
export function StockLogo({
  symbol,
  address,
  size = 34,
  eager = false,
}: {
  symbol: string;
  address: string;
  size?: number;
  /** Above-the-fold marks load eagerly; a lazy hero logo shows its tile first. */
  eager?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Deterministic hue per symbol: the same stock is the same colour everywhere.
  const hue = [...symbol].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

  return (
    <span className="logo" style={{ width: size, height: size }}>
      <span
        className="logo-tile"
        style={{
          background: `hsl(${hue} 62% 94%)`,
          color: `hsl(${hue} 52% 34%)`,
          fontSize: size * 0.34,
          opacity: loaded ? 0 : 1,
        }}
        aria-hidden
      >
        {symbol.slice(0, 2)}
      </span>

      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element -- a proxied remote
        // logo that must degrade to the tile; next/image cannot express that.
        <img
          className="logo-img"
          src={`/api/logo?symbol=${encodeURIComponent(symbol)}&address=${address}`}
          alt=""
          width={size}
          height={size}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{ opacity: loaded ? 1 : 0 }}
        />
      )}
    </span>
  );
}
