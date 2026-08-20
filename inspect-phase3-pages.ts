import fs from "node:fs/promises";
import { chromium } from "playwright";

async function main() {
  const html = await fs.readFile("test-expose-phase3.html", "utf8");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle" });
    const sections = page.locator(".page");
    await fs.mkdir("phase3-pages", { recursive: true });
    for (let index = 0; index < await sections.count(); index += 1) {
      await sections.nth(index).screenshot({ path: `phase3-pages/page-${String(index + 1).padStart(2, "0")}.png` });
    }
    console.log(`Rendered ${await sections.count()} pages to phase3-pages/`);
  } finally {
    await browser.close();
  }
}

main();
