import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.property.findFirst({ where: { specialNotes: { contains: "DEMO" } } });
  if (existing) return;
  await prisma.property.create({ data: {
    propertyType: "apartment", transactionType: "sale", constructionYear: 2018,
    address: "Weserstraße 42", zipCode: "12045", city: "Berlin", district: "Neukölln",
    livingArea: 92, rooms: 3, bedrooms: 2, bathrooms: 1, floor: "2. OG", totalFloors: 5, condition: "new",
    askingPrice: 449000, hausgeld: 390, commission: "3,57 % inkl. MwSt.", selectedFeatures: ["balcony", "elevator", "fitted-kitchen", "underfloor-heating", "cellar", "energy-efficient"],
    additionalFeatures: "Südwest-Balkon mit Weitblick", locationNote: "Lebendiges Umfeld mit Cafés, kleinen Läden und kurzen Wegen zu den täglichen Zielen.",
    surroundings: { transport: "U7 und mehrere Buslinien in der Umgebung", shopping: "Vielfältige Geschäfte und Wochenmarkt", restaurants: "Cafés und Restaurants fußläufig erreichbar", parks: "Volkspark Hasenheide für Freizeit und Erholung" },
    sellerDescription: "Eine helle Wohnung mit offenem Grundriss und sorgfältig ausgewählten Materialien.", specialNotes: "DEMO / TESTDATEN - nicht für die Veröffentlichung", tone: "modern", language: "de",
    roomsData: { create: [
      { name: "Wohnbereich", type: "Wohnen", size: 32, floor: "2. OG", description: "Große Fenster und direkter Zugang zum Südwest-Balkon.", sequence: 0 },
      { name: "Schlafzimmer", type: "Schlafen", size: 15, floor: "2. OG", description: "Ruhiger Rückzugsort mit Platz für ein Doppelbett.", sequence: 1 },
      { name: "Arbeitszimmer", type: "Arbeiten", size: 11, floor: "2. OG", description: "Flexibel nutzbarer Raum für Homeoffice oder Gäste.", sequence: 2 },
      { name: "Küche", type: "Kochen", size: 9, floor: "2. OG", description: "Moderne Einbauküche mit klarer Linienführung.", sequence: 3 },
    ] },
  } });
}

main().finally(() => prisma.$disconnect());