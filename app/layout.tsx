import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
// Absolute URLs in `metadata` (the Open Graph image below) need a base. Set
// NEXT_PUBLIC_SITE_URL to the deployed origin at build time; the localhost
// fallback keeps `npm run build` warning-free in development, but a production
// build that leaves it unset will publish localhost share-card URLs.
function siteBase(value: string | undefined): URL {
  const raw = value?.trim() || "http://localhost:3000";
  try {
    return new URL(raw);
  } catch {
    throw new Error(`NEXT_PUBLIC_SITE_URL must be an absolute URL, got "${raw}"`);
  }
}
export const metadata: Metadata = {
  metadataBase: siteBase(process.env.NEXT_PUBLIC_SITE_URL),
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
