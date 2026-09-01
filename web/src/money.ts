/** Display currencies. USD is the base; everything else is a live ECB rate. */
export interface Currency {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  /** Currencies with no minor unit in practice read badly with cents. */
  dp: number;
}

export const CURRENCIES: Currency[] = [
  { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸", dp: 2 },
  { code: "IDR", name: "Rupiah", symbol: "Rp", flag: "🇮🇩", dp: 0 },
  { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺", dp: 2 },
  { code: "GBP", name: "Pound", symbol: "£", flag: "🇬🇧", dp: 2 },
  { code: "JPY", name: "Yen", symbol: "¥", flag: "🇯🇵", dp: 0 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", flag: "🇸🇬", dp: 2 },
];

export const byCode = new Map(CURRENCIES.map((c) => [c.code, c]));

/**
 * Formats a USD figure in the chosen currency.
 *
 * Falls back to USD when no rate has arrived. That is deliberate: showing an
 * unconverted number under a rupiah sign would misstate someone's balance by a
 * factor of sixteen thousand.
 */
export function makeFormat(code: string, rate: number | null) {
  const cur = byCode.get(code) ?? CURRENCIES[0];
  const usable = code === "USD" ? 1 : rate;
  const active = usable === null ? CURRENCIES[0] : cur;
  const mult = usable ?? 1;

  return (usd: number) =>
    `${active.symbol}${(usd * mult).toLocaleString("en-US", {
      minimumFractionDigits: active.dp,
      maximumFractionDigits: active.dp,
    })}`;
}
