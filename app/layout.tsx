import type { Metadata } from "next";
import "@fontsource-variable/geist";
import "@fontsource-variable/space-grotesk";
import "./globals.css";
export const metadata: Metadata = {
  title: "Lunar — Mission Navigator",
  description:
    "Explore the lunar south pole, compare candidate sites, and discover simulated mission windows. An independent NASA Space Apps concept.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
