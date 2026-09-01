export const EXPLORER = "https://robinhoodchain.blockscout.com" as const;
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://stockspilot.org";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.stockspilot.org";
const parse = (raw: string | undefined, fb: string[]) => { const l = (raw ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean); return l.length ? l : fb; };
/** Hosts that get the landing page instead of the app. */
export const APEX_HOSTS = parse(process.env.NEXT_PUBLIC_APEX_HOSTS, ["stockspilot.org", "www.stockspilot.org"]);

/** The StocksPilot token (PILOTS), verified on RH Chain. */
export const TOKEN = "0x9206686f8c51084f6f0db5b8dfdf7d0a00945c3c" as const;

export const LINKS = { x: "https://x.com/stockspilotX", github: "https://github.com/stockspilot-code" } as const;
