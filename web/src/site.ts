export const EXPLORER = "https://robinhoodchain.blockscout.com" as const;

/** Where this deployment lives. Overridden per environment; the fallback is
 *  only used before the domain is wired up. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://locksley.cash";

export const LINKS = {
  x: "https://x.com/locksleybank",
  github: "https://github.com/locksleycash/locksley",
} as const;
