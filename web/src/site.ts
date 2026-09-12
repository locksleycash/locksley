export const EXPLORER = "https://robinhoodchain.blockscout.com" as const;

/** Where this deployment lives. Overridden per environment; the fallback is
 *  only used before the domain is wired up. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://locksley.cash";

/** The LSBK token on RH Chain - 18 decimals, 1,000,000,000 supply. */
export const TOKEN = "0xF50ceF741082045DC8d15F82E8104F85744B24ea" as const;

export const LINKS = {
  x: "https://x.com/locksleybank",
  github: "https://github.com/locksleycash/locksley",
} as const;
