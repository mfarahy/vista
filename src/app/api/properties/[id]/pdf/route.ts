import { NextResponse } from "next/server";
import { getProperty } from "@/lib/store";
import { exposeHTML } from "@/lib/expose-template";
import { chromium } from "playwright";
export const maxDuration = 60;
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) { const property = await getProperty((await params).id); if (!property?.expose?.content) return NextResponse.json({ error: "Bitte zuerst Inhalte generieren" }, { status: 400 }); const browser = await chromium.launch({ headless: true }); try { const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 }); await page.setContent(exposeHTML(property, property.expose.content), { waitUntil: "networkidle" }); const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } }); return new NextResponse(pdf as unknown as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="raumwerk-expose-${property.id}.pdf"` } }); } finally { await browser.close(); } }
