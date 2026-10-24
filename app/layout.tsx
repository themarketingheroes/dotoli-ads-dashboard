import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Cormorant_Garamond, Noto_Sans } from "next/font/google";
import { theme } from "@/lib/config";
import "./globals.css";

// Brand fonts for the Togas theme (only applied when DASHBOARD_THEME=togas).
const serif = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-brand-serif", display: "swap" });
const brandSans = Noto_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-brand-sans", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: theme() === "togas" ? "Togas · Ads Performance" : "Ads Dashboard",
    description: "Meta and Google Ads performance by client",
    robots: { index: false, follow: false },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const t = theme();
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${serif.variable} ${brandSans.variable}${t === "togas" ? " theme-togas" : ""}`}>
      <body>{children}</body>
    </html>
  );
}
