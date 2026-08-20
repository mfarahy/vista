import { chromium } from "playwright";
import { exposeHTML } from "./src/lib/expose-template";
import type { Property, StructuredExposeContent } from "./src/lib/types";

const property: Property = {
  id: "conditions",
  propertyType: "house",
  transactionType: "sale",
  selectedFeatures: [],
  surroundings: {},
  tone: "professional",
  language: "de",
  images: ["one", "two", "three"].map((id, index) => ({ id, assetId: id, url: "/demo/room-1.svg", fileName: `${id}.svg`, mimeType: "image/svg+xml", size: 1, sequence: index, isCover: index === 0, category: "interior" })),
  roomsData: [],
};
const base: StructuredExposeContent = {
  version: 2,
  cover: { title: "Test", purchasePrice: "499.000 €", livingArea: "ca. 130 m²", rooms: "3" },
  overview: { facts: [{ label: "Wohnfläche", value: "ca. 130 m²" }] },
  imageSections: [{ category: "interior", label: "Objektbilder", images: property.images.map((item) => ({ assetId: item.id, caption: "Innenansicht" })) }],
  vistaSection: { heading: "5 Schritte zur Wunschimmobilie", subtitle: "Vista", description: "Begleitung.", steps: ["1", "2", "3", "4", "5"] },
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenario of [
      { name: "all-conditional", content: { ...base, overview: { ...base.overview, energy: { facts: [{ label: "Energieausweis", value: "bedarfsorientiert" }] } }, planSections: [{ title: "Grundrisse", images: [{ assetId: "one", caption: "Grundriss" }] }], mapSections: [{ title: "Lageplan", images: [{ assetId: "one", caption: "Lageplan" }] }] } },
      { name: "no-energy", content: base },
      { name: "no-plans", content: { ...base, overview: { ...base.overview, energy: { facts: [{ label: "Energieausweis", value: "bedarfsorientiert" }] } } } },
      { name: "three-images", content: base },
    ]) {
      const page = await browser.newPage();
      await page.setContent(await exposeHTML(property, scenario.content), { waitUntil: "networkidle" });
      const text = await page.locator("body").innerText();
      const pages = await page.locator(".page").count();
      if (scenario.name === "no-energy" && text.includes("Energieangaben")) throw new Error("Energy section did not disappear");
      if (scenario.name === "no-plans" && text.includes("Grundrisse")) throw new Error("Floor-plan section did not disappear");
      if (scenario.name === "three-images" && pages !== 5) throw new Error(`Three-image scenario created ${pages} pages`);
      console.log(`${scenario.name}: ${pages} pages`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main();
