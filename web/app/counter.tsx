"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts to its new value instead of jumping.
 *
 * Animates from whatever was on screen, so a refresh that nudges a balance
 * moves only the last digits rather than replaying from zero. Reduced-motion
 * users get the figure immediately — a count-up is decoration, and decoration
 * is the first thing that setting asks you to drop.
 */
export function Count({
  value,
  format,
  ms = 1600,
}: {
  value: number;
  format: (n: number) => string;
  ms?: number;
}) {
  // Starts at zero so arriving on the page counts up rather than showing a
  // figure that was already there. Remount it — a changing `key` — to replay
  // the count on refresh even when the number lands on the same value.
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    const target = Number.isFinite(value) ? value : 0;
    const start = from.current;
    const delta = target - start;

    // Nothing to count to. Land on it now rather than run an animation whose
    // every frame renders the same figure — that is the "counting from blank"
    // an empty balance showed.
    if (delta === 0) {
      from.current = target;
      setShown(target);
      return;
    }

    const reduce =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      from.current = target;
      setShown(target);
      return;
    }

    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      // Ease out cubic: fast off the mark, settles gently on the figure.
      const eased = 1 - Math.pow(1 - p, 3);
      // The final frame is the exact target, not an eased approximation of it:
      // a balance must end on its real value, not near it.
      setShown(p < 1 ? start + delta * eased : target);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf.current = requestAnimationFrame(tick);

    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      // Land on the target even if unmounted mid-flight, so the next mount
      // animates from the truth rather than from a half-finished number.
      from.current = target;
    };
  }, [value, ms]);

  return <>{format(shown)}</>;
}
