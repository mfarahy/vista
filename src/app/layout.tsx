import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Raumwerk | Real estate stories with character",
  description: "AI-powered real estate exposé generator",
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
