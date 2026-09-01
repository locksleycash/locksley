/**
 * Company logos, by ticker.
 *
 * Not from Robinhood's CDN. Blockscout lists an `icon_url` there for every
 * token and it looks per-asset, but it is not: fetched for NVDA, AAPL, TSLA,
 * MSFT and GOOGL it returns the same 4,058 bytes every time — the Robinhood
 * Chain mark, not the company's. Verified by hashing the responses.
 *
 * These two do return distinct marks per symbol. Both are tried because a logo
 * is decoration: if neither answers, the UI falls back to a letter tile and
 * nothing is lost but polish.
 */
export const LOGO_SOURCES = [
  (symbol: string) => `https://assets.parqet.com/logos/symbol/${symbol}?format=png&size=96`,
  (symbol: string) => `https://financialmodelingprep.com/image-stock/${symbol}.png`,
];
