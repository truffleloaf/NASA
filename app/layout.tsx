import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
const inter = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  display: "swap",
});
const space = localFont({
  src: "../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2",
  variable: "--font-space",
  display: "swap",
});
const jetbrains = localFont({
  src: "../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains",
  display: "swap",
});
export const metadata: Metadata = {
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
    <html lang="en" className={`${inter.variable} ${space.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
