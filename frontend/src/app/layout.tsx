import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Raumwerk",
  description: "Real estate exposé editor",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
