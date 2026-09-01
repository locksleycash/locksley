import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { Providers } from "./providers.tsx";
import { SITE_URL } from "../src/site.ts";
import "./globals.css";
import "./bank.css";

/**
 * Poppins in three weights and no more.
 *
 * Light carries body copy, Regular the numbers, Medium every heading and
 * label Ã¢â‚¬â€ nothing reaches Bold. Poppins at 600+ is heavy enough to shout, and
 * the look here depends on it not shouting. Self-hosted by next/font, so no
 * request leaves for Google and no CSP entry is needed.
 */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-poppins",
  display: "swap",
});

// The brand of the underlying network is deliberately absent from the title,
// description and preview card. It is a real brokerage, and a day-old domain
// pairing its name with a wallet prompt is what a phishing classifier is built
// to catch Ã¢â‚¬â€ which is exactly what happened. The network is still named where
// it is technically necessary, such as switching a wallet to it.
const TITLE = "HoodSave - non-custodial banking on RH Chain";
const DESCRIPTION = "Savings backed by treasuries, scheduled payments, and borrow against your stocks - all on-chain, non-custodial, no fees.";

/**
 * Where this deployment actually lives.
 *
 * Without a base, Next emits relative OG urls and most scrapers drop them, so
 * the preview quietly degrades to a bare link. Hardcoding the apex is worse
 * still while its DNS is unset: every preview would point the scraper at a
 * domain that does not answer. Vercel hands us the real production host, so
 * use that and let SITE_URL be the fallback.
 */
const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : SITE_URL);

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "HoodSave",
  openGraph: {
    type: "website",
    siteName: "HoodSave",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#0f9d6b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}


