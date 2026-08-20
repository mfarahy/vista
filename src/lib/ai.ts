import { exposeContentSchema } from "./validation";
import type { ExposeContent, Property } from "./types";

export interface AIInput {
  propertyType: string; transactionType: string; location: { city?: string | null; district?: string | null };
  metrics: Record<string, string | number | null | undefined>; features: string[];
  rooms: { id: string; name: string; type: string; size?: number | null; floor?: string | null; description?: string | null }[];
  locationInformation: Record<string, string>; locationNote?: string | null; additionalInformation?: string | null;
  tone: string; language: string;
}

export function buildAIInput(property: Property): AIInput {
  return {
    propertyType: property.propertyType,
    transactionType: property.transactionType,
    location: { city: property.city, district: property.district },
    metrics: { livingArea: property.livingArea, plotArea: property.plotArea, rooms: property.rooms, bedrooms: property.bedrooms, bathrooms: property.bathrooms, floor: property.floor, constructionYear: property.constructionYear, condition: property.condition, askingPrice: property.askingPrice },
    features: [...property.selectedFeatures, ...(property.additionalFeatures ? [property.additionalFeatures] : [])],
    rooms: property.roomsData.map(({ id, name, type, size, floor, description }) => ({ id, name, type, size, floor, description })),
    locationInformation: Object.fromEntries(Object.entries(property.surroundings ?? {}).filter(([, value]) => value)),
    locationNote: property.locationNote,
    additionalInformation: [property.sellerDescription, property.specialNotes].filter(Boolean).join("\n"),
    tone: property.tone,
    language: property.language,
  };
}

function label(value: string | undefined | null) { return value?.replaceAll("-", " ").replace(/\b\w/g, (char) => char.toUpperCase()) ?? "Immobilie"; }
function euro(value?: number | null) { return value ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value) : ""; }

function demoContent(property: Property): ExposeContent {
  const city = property.city || "Ihrer Stadt";
  const district = property.district ? ` im Stadtteil ${property.district}` : "";
  const type = label(property.propertyType);
  const facts = [property.livingArea && `${property.livingArea} m² Wohnfläche`, property.rooms && `${property.rooms} Zimmer`, property.bedrooms && `${property.bedrooms} Schlafzimmer`, property.bathrooms && `${property.bathrooms} Badezimmer`, property.constructionYear && `Baujahr ${property.constructionYear}`].filter(Boolean) as string[];
  const features = property.selectedFeatures.slice(0, 6).map(label);
  const title = `${type}${property.rooms ? ` mit ${property.rooms}-Zimmern` : ""}${features[0] ? ` und ${features[0]}` : ""}${district ? ` in ${city}` : ` in ${city}`}`;
  const roomDescriptions = property.roomsData.map((room) => ({ roomId: room.id, name: room.name, description: room.description || `${room.name}${room.size ? ` mit ca. ${room.size} m²` : ""} bietet eine vielseitig nutzbare Fläche und fügt sich harmonisch in das Raumkonzept ein.` }));
  const locationDescription = property.locationNote || Object.entries(property.surroundings ?? {}).filter(([, value]) => value).map(([key, value]) => `${label(key)}: ${value}`).join("\n") || `Die Lage in ${city}${property.district ? `, ${property.district}` : ""} verbindet Alltagstauglichkeit mit einer angenehmen Wohnatmosphäre. Die Angaben basieren auf den bereitgestellten Informationen.`;
  return {
    title, portalTitle: `${type} in ${city}${property.livingArea ? ` | ${property.livingArea} m²` : ""}`,
    shortDescription: `${type} in ${city}${property.livingArea ? ` mit ca. ${property.livingArea} m² Wohnfläche` : ""}. Ein Zuhause mit klaren Qualitäten und Raum für Ihre persönliche Handschrift.`,
    mainDescription: `${type} in ${city}${district} präsentiert sich als vielseitige Immobilie für Menschen, die Wert auf eine gute Balance aus Alltag und Zuhause legen. ${property.sellerDescription || "Die Räume bieten eine angenehme Grundlage für individuelle Wohnideen und lassen sich flexibel auf unterschiedliche Lebenssituationen ausrichten."}\n\nBesonders hervorzuheben sind ${features.length ? features.join(", ") : "die klar geschnittenen Räume und die vielseitigen Nutzungsmöglichkeiten"}. Alle Aussagen in diesem Text beruhen auf den vom Anbieter bereitgestellten Informationen.`,
    highlights: (features.length ? features : ["Klar geschnittene Räume", "Vielseitige Nutzungsmöglichkeiten", "Individuelle Gestaltungsspielräume", "Attraktiver Wohnstandort"]).slice(0, 8),
    roomDescriptions, locationDescription, targetAudience: property.targetAudience || `Paare, Familien und anspruchsvolle Eigennutzer, die ein gut strukturiertes Zuhause in ${city} suchen.`, factualSnapshot: facts,
  };
}

export async function generateExposeContent(property: Property, instruction = "") {
  const input = buildAIInput(property);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return demoContent(property);
  const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const prompt = `Du bist ein sorgfältiger deutscher Immobilien-Texter. Erzeuge ausschließlich gültiges JSON im vorgegebenen Schema. Nutze nur Fakten aus den Eingabedaten. Erfinde keine Entfernungen, Ausstattungsdetails, Energie-, Bau- oder Lageangaben. Formuliere werblich, aber transparent. Standortinformationen dürfen nur sprachlich verbessert werden, nicht erweitert werden. ${instruction}\nEingabe: ${JSON.stringify(input)}`;
  const response = await fetch(`${base}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", temperature: 0.5, response_format: { type: "json_object" }, messages: [{ role: "system", content: "Antworte auf Deutsch. Das JSON muss title, portalTitle, shortDescription, mainDescription, highlights, roomDescriptions, locationDescription, targetAudience und factualSnapshot enthalten." }, { role: "user", content: prompt }] }) });
  if (!response.ok) throw new Error("AI provider returned an error");
  const result = await response.json() as { choices?: { message?: { content?: string } }[] };
  return exposeContentSchema.parse(JSON.parse(result.choices?.[0]?.message?.content || "{}"));
}
