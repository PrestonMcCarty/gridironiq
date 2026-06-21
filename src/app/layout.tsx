import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "GridironIQ — Fantasy Football Intelligence",
  description: "AI-powered fantasy football assistant with live Sleeper + FantasyCalc data",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0A0E17" }}>{children}</body>
    </html>
  );
}
