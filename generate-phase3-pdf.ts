import fs from "node:fs/promises";
import { chromium } from "playwright";
import { exposeHTML } from "./lib/expose-template";
import type { Property, StructuredExposeContent } from "./lib/types";
import { emptyExposeData } from "./lib/expose-data";

const image = (id: string, url: string, category: "exterior" | "interior" | "floor_plan" | "document", caption: string, isCover = false) => ({
  id,
  assetId: id,
  url,
  fileName: `${id}.svg`,
  mimeType: "image/svg+xml",
  size: 1,
  sequence: Number(id.replace(/\D/g, "")) || 0,
  isCover,
  category,
  caption,
  isHeroCandidate: isCover,
});

const images = [
  image("hero-1", "/demo/room-1.svg", "exterior", "Hausansicht mit Garten", true),
  image("photo-2", "/demo/room-2.svg", "interior", "Wohnbereich"),
  image("photo-3", "/demo/room-3.svg", "interior", "Terrasse und Garten"),
  image("photo-4", "/demo/room-4.svg", "interior", "Küche"),
  image("photo-5", "/demo/room-5.svg", "interior", "Schlafzimmer"),
  image("photo-6", "/demo/room-6.svg", "exterior", "Umgebung"),
  image("plan-1", "/demo/room-4.svg", "floor_plan", "Grundriss Erdgeschoss"),
  image("map-1", "/demo/room-6.svg", "document", "Lageplan"),
];

const data = emptyExposeData();
data.basicInformation = {
  propertyType: "house",
  propertySubtype: "Einfamilienhaus",
  title: "Einfamilienhaus mit Garten",
  address: { street: "Furkastrasse", houseNumber: "88a", postalCode: "12107", city: "Berlin", district: "Marienfelde", country: "Deutschland" },
};
data.pricing = { purchasePrice: 499000, rentPrice: null, additionalCosts: null, buyerCommission: "3,57 % inkl. ges. MwSt.", sellerCommission: null };
data.propertyDetails = { ...data.propertyDetails, livingArea: 130, plotArea: 784, rooms: 3, bathrooms: 1, yearBuilt: 1969, garageCount: 1, parkingSpaceCount: 1 };
data.energy = { certificateType: "needs_based", yearOfConstruction: 1969, primaryEnergySource: "oil", finalEnergyDemand: 250.2, finalEnergyConsumption: null, efficiencyClass: "H" };
data.location = { address: data.basicInformation.address, district: "Marienfelde", neighborhood: "Wohnsiedlung am Park", latitude: null, longitude: null, description: "Ruhige Wohnlage im Süden Berlins mit gewachsener Nachbarschaft. Die Adresse verbindet ein privates Wohnumfeld mit einer guten Erreichbarkeit der täglichen Ziele." };
data.rooms = [
  { id: "living", type: "living_room", name: "Wohnzimmer", area: 31, description: "Großzügiger Wohnbereich mit Zugang zum Garten.", features: [], floor: "Erdgeschoss" },
  { id: "kitchen", type: "kitchen", name: "Küche", area: 11, description: "Funktional geschnittene Küche.", features: ["Einbauküche"], floor: "Erdgeschoss" },
  { id: "bedroom", type: "bedroom", name: "Schlafzimmer", area: 16, description: "Ruhiger Rückzugsort.", features: [], floor: "Erdgeschoss" },
];
data.equipment = [{ id: "garage", category: "parking", name: "Garage", description: "Eine Garage und ein Stellplatz stehen zur Verfügung." }, { id: "garden", category: "outdoor", name: "Garten", description: "Privater Garten am Haus." }];
data.floorPlans = [images[6]];
data.maps = [images[7]];
data.images = images.slice(0, 6);
data.agent = { name: "Anna Beispiel", company: "Vista Immobilien", address: data.basicInformation.address, phone: "+49 30 1234567", email: "hallo@vista.example", website: "https://vista.example" };
data.systemBranding = { companyName: "Vista", logo: null, website: "https://vista.example", email: "hallo@vista.example", phone: "+49 30 1234567", description: "Vista begleitet Sie persönlich und strukturiert auf dem Weg zu Ihrer Wunschimmobilie.", processSteps: ["Exposé prüfen", "Interesse bekunden", "Finanzierung klären", "Besichtigung erleben", "Kaufabschluss begleiten"] };

const property: Property = {
  id: "test-phase3",
  propertyType: "house",
  transactionType: "sale",
  selectedFeatures: [],
  surroundings: {},
  tone: "professional",
  language: "de",
  images: images as Property["images"],
  roomsData: [],
  exposeData: data,
  address: "Furkastrasse 88a",
  zipCode: "12107",
  city: "Berlin",
  district: "Marienfelde",
  askingPrice: 499000,
  livingArea: 130,
  rooms: 3,
  bathrooms: 1,
};

const content: StructuredExposeContent = {
  version: 2,
  cover: { title: "Einfamilienhaus mit Garten", location: "12107 Berlin · Marienfelde", purchasePrice: "499.000 €", livingArea: "ca. 130 m²", rooms: "3", heroImage: { assetId: "hero-1", caption: "Hausansicht mit Garten" } },
  overview: { facts: [
    ["Objektart", "Ein-/Zweifamilienhaus"], ["Objekttyp", "Einfamilienhaus"], ["Grundstücksfläche", "784 m²"], ["Zimmer", "3"], ["Badezimmer", "1"], ["Wohnfläche", "ca. 130 m²"], ["Anzahl Garagen", "1"], ["Anzahl Stellplätze", "1"], ["Baujahr/Fertigstellung", "ca. 1969"], ["Hauptenergieträger", "Öl"], ["Kaufpreis", "499.000 €"], ["Käuferprovision", "3,57 % inkl. ges. MwSt."],
  ].map(([label, value]) => ({ label, value })), energy: { facts: [["Energieausweis", "bedarfsorientiert"], ["Bj. lt. Energieausweis", "1969"], ["Endenergiebedarf", "250,20 kWh/(m²·a)"], ["Energieeffizienzklasse", "H"]].map(([label, value]) => ({ label, value })) } },
  objectInformation: { address: data.basicInformation.address },
  propertyDescription: { paragraphs: [
    { heading: "Einleitung", text: "Das Einfamilienhaus befindet sich in Berlin-Marienfelde. Die Immobilie verfügt über ca. 130 m² Wohnfläche und drei Zimmer auf einem 784 m² großen Grundstück. Die ruhige Wohnlage und der private Garten schaffen einen angenehmen Rahmen für das tägliche Leben." },
    { heading: "Architektur und Aufteilung", text: "Die Räume sind klar gegliedert und bieten eine nachvollziehbare Aufteilung. Großzügige Fenster bringen Tageslicht in die Wohnbereiche und verbinden das Haus mit dem Garten." },
    { heading: "Wohnbereiche", text: "Das Wohnzimmer bildet den Mittelpunkt des Hauses und bietet direkten Zugang zum Garten. Die Flächen lassen sich flexibel möblieren und eignen sich für gemeinsames Wohnen ebenso wie für ruhige Rückzugsmomente." },
    { heading: "Baujahr und Energie", text: "Das Baujahr ist 1969. Als Hauptenergieträger ist Öl angegeben; der Energieausweis ist bedarfsorientiert und weist einen Endenergiebedarf von 250,20 kWh/(m²·a) aus." },
  ] },
  roomProgram: data.rooms.map((room) => ({ roomId: room.id, name: room.name, area: `ca. ${room.area} m²`, description: room.description || "Flexibel nutzbarer Raum." })),
  equipment: { facts: [{ label: "Garage", value: "1" }, { label: "Stellplatz", value: "1" }, { label: "Garten", value: "Privater Garten am Haus" }], description: "Die Ausstattung verbindet praktische Nebenflächen mit einem privaten Außenbereich. Garage und Stellplatz ergänzen das Angebot." },
  location: { district: "Marienfelde", neighborhood: "Wohnsiedlung am Park", description: data.location.description || "" },
  imageSections: [{ category: "exterior", label: "Objektbilder", images: images.slice(0, 6).map((item) => ({ assetId: item.id, caption: item.caption || "Objektansicht" })) }],
  planSections: [{ title: "Grundrisse / Pläne", images: [{ assetId: "plan-1", caption: "Grundriss Erdgeschoss" }] }],
  mapSections: [{ title: "Lageplan / Makrolage", images: [{ assetId: "map-1", caption: "Lageplan" }] }],
  agentSection: data.agent,
  vistaSection: { heading: "5 Schritte zur Wunschimmobilie", subtitle: "Vista Immobilien", description: data.systemBranding.description || "", steps: data.systemBranding.processSteps, website: data.systemBranding.website || undefined, email: data.systemBranding.email || undefined, phone: data.systemBranding.phone || undefined },
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
    await page.setContent(await exposeHTML(property, content), { waitUntil: "networkidle" });
    await page.pdf({ path: "test-expose-phase3.pdf", format: "A4", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    await fs.writeFile("test-expose-phase3.html", await page.content());
    console.log("Generated test-expose-phase3.pdf");
  } finally {
    await browser.close();
  }
}

main();
