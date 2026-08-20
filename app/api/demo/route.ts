import { NextResponse } from "next/server";
import { addImage, createProperty, updateProperty } from "@/lib/store";
import type { PropertyPayload } from "@/lib/types";

export async function POST() {
  console.info("[api:demo] creating demo property");
  const property = await createProperty();
  const payload: PropertyPayload = {
    propertyType: "apartment",
    transactionType: "sale",
    constructionYear: 2018,
    address: "Weserstraße 42",
    zipCode: "12045",
    city: "Berlin",
    district: "Neukölln",
    livingArea: 92,
    plotArea: null,
    rooms: 3,
    bedrooms: 2,
    bathrooms: 1,
    floor: "2. OG",
    totalFloors: 5,
    availableFrom: "sofort",
    condition: "new",
    askingPrice: 449000,
    additionalCosts: null,
    commission: "3,57 % inkl. MwSt.",
    hausgeld: 390,
    coldRent: null,
    deposit: null,
    selectedFeatures: [
      "balcony",
      "elevator",
      "fitted-kitchen",
      "underfloor-heating",
      "basement",
      "energy-efficient",
    ],
    additionalFeatures: "Südwest-Balkon mit Weitblick",
    surroundings: {
      transport: "U7 und mehrere Buslinien in der Umgebung",
      shopping: "Vielfältige Geschäfte und Wochenmarkt",
      restaurants: "Cafés und Restaurants fußläufig erreichbar",
      parks: "Volkspark Hasenheide für Freizeit und Erholung",
    },
    locationNote:
      "Lebendiges Umfeld mit Cafés, kleinen Läden und kurzen Wegen zu den täglichen Zielen.",
    sellerDescription:
      "Eine helle Wohnung mit offenem Grundriss und sorgfältig ausgewählten Materialien.",
    specialNotes: "DEMO / TESTDATEN",
    targetAudience: "Paare und anspruchsvolle Eigennutzer",
    tone: "modern",
    language: "de",
    roomsData: [
      {
        name: "Wohnbereich",
        type: "Wohnen",
        size: 32,
        floor: "2. OG",
        description: "Große Fenster und direkter Zugang zum Südwest-Balkon.",
        sequence: 0,
      },
      {
        name: "Schlafzimmer",
        type: "Schlafen",
        size: 15,
        floor: "2. OG",
        description: "Ruhiger Rückzugsort mit Platz für ein Doppelbett.",
        sequence: 1,
      },
      {
        name: "Arbeitszimmer",
        type: "Arbeiten",
        size: 11,
        floor: "2. OG",
        description: "Flexibel nutzbarer Raum für Homeoffice oder Gäste.",
        sequence: 2,
      },
      {
        name: "Küche",
        type: "Kochen",
        size: 9,
        floor: "2. OG",
        description: "Moderne Einbauküche mit klarer Linienführung.",
        sequence: 3,
      },
    ],
  };
  await updateProperty(property.id, payload);
  console.info("[api:demo] demo data saved", { propertyId: property.id });
  for (let index = 1; index <= 6; index += 1)
    await addImage(property.id, {
      url: `/demo/room-${index}.svg`,
      fileName: `demo-room-${index}.svg`,
      mimeType: "image/svg+xml",
      size: 0,
      sequence: index - 1,
      isCover: index === 1,
    });
  console.info("[api:demo] demo images added", { propertyId: property.id, count: 6 });
  return NextResponse.json({ id: property.id });
}
