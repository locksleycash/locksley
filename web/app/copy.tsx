"use client";

import { useState } from "react";

/** A contract address with a copy affordance. Falls back to select-all where
 *  the clipboard API is unavailable (plain http, old Safari). */
export function CopyAddress({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1600); }
    catch { window.getSelection()?.selectAllChildren(document.getElementById(`ca-${value}`) as Node); }
  };
  return (
    <span className="hal-ca">
      <code id={`ca-${value}`}>{value}</code>
      <button type="button" onClick={copy} aria-label="Copy address">{ok ? "Copied" : "Copy"}</button>
    </span>
  );
}
