import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Raumwerk | Exposés, die Räume wirken lassen", description: "AI-powered real estate exposé generator" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="de"><body>{children}</body></html>; }
