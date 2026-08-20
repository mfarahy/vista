import { NextResponse } from "next/server";
import { getProperty } from "@/lib/store";
import { exposeHTML } from "@/lib/expose-template";
import { chromium } from "playwright";
export const maxDuration = 60;
export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  console.info("[api:pdf] POST request received", { id });
  const property = await getProperty(id);
  if (!property?.expose?.content) {
    console.warn("[api:pdf] expose content missing", { id });
    return NextResponse.json(
      { error: "Please generate content first" },
      { status: 400 },
    );
  }
  const browser = await chromium.launch({ headless: true });
  try {
    console.info("[api:pdf] generating PDF", { id, title: property.expose.content.title });
    const page = await browser.newPage({
      viewport: { width: 794, height: 1123 },
      deviceScaleFactor: 1,
    });
    const html = await exposeHTML(property, property.expose.content);
    await page.setContent(html, {
      waitUntil: "networkidle",
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    console.info("[api:pdf] PDF generated", { id, bytes: pdf.length });
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="raumwerk-expose-${property.id}.pdf"`,
      },
    });
  } finally {
    await browser.close();
    console.info("[api:pdf] browser closed", { id });
  }
}
