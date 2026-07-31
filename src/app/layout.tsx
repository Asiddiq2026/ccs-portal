import type { Metadata } from "next";
import { Sora, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { principalLegalWithFrn } from "@/lib/principal";

const sora = Sora({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-sora" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "CCS AR Oversight Platform",
  description: `Comprehensive Compliance Solutions — AR oversight for ${principalLegalWithFrn()}.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${manrope.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
