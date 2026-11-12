import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
// Absolute URLs in `metadata` (the Open Graph image below) need a base. Hosts
// disagree on which variable carries the public origin, so try the explicit
// override first, then the platform conventions, then local development.
// A value without a scheme (VERCEL_URL is a bare host) is assumed to be https.
const SITE_BASE_VARIABLES = [
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
  "URL",
  "DEPLOY_PRIME_URL",
  "CF_PAGES_URL",
] as const;
function siteBase(): URL {
  for (const name of SITE_BASE_VARIABLES) {
    const raw = process.env[name]?.trim();
    if (!raw) continue;
    try {
      return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      throw new Error(`${name} is not a usable absolute URL: "${raw}"`);
    }
  }
  return new URL("http://localhost:3000");
}
export const metadata: Metadata = {
  metadataBase: siteBase(),
  title: "Lunar — Mission Navigator",
  description:
    "Find estimated lunar south-pole operating windows using bundled JPL ephemerides and LOLA terrain. Explore, compare and trace every result to its source.",
  openGraph: {
    title: "Lunar Mission Navigator",
    description: "Find the hours when the Moon lets you work.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Lunar Mission Navigator — sunlight, Earth visibility, operating windows",
      },
    ],
  },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
