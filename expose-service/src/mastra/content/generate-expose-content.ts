import type { ExposeImage, PropertyExposeData } from "../../lib/expose-data.js";
import { generateSectionText } from "../../external-services/ai-section.js";
import { validateExposeContent, type ExposeContent } from "../schemas/expose-content.js";

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const propertyTypeLabels: Record<string, string> = {
  apartment: "Wohnung",
  house: "Haus",
  villa: "Villa",
  penthouse: "Penthouse",
  "semi-detached": "Doppelhaushälfte",
  terraced: "Reihenhaus",
};
const roomTypeLabels: Record<string, string> = {
  living_room: "Wohnzimmer", bedroom: "Schlafzimmer", child_room: "Kinderzimmer", office: "Arbeitszimmer",
  kitchen: "Küche", dining_room: "Esszimmer", bathroom: "Badezimmer", guest_wc: "Gäste-WC", hallway: "Diele",
  utility_room: "Hauswirtschaftsraum", hobby_room: "Hobbyraum", basement: "Keller", attic: "Dachboden", garage: "Garage",
};
const energyLabels: Record<string, string> = {
  needs_based: "bedarfsorientiert", consumption_based: "verbrauchsorientiert", not_available: "nicht vorhanden", unknown: "unbekannt",
  gas: "Gas", oil: "Öl", district_heating: "Fernwärme", heat_pump: "Wärmepumpe", electricity: "Strom", wood: "Holz", pellets: "Pellets", other: "Sonstige",
};
const outdoorLabels: Record<string, string> = { garden: "Garten", terrace: "Terrasse", balcony: "Balkon", courtyard: "Innenhof", roof_terrace: "Dachterrasse" };
const imageCategoryLabels: Record<string, string> = { exterior: "Außenansichten", interior: "Innenansichten", floor_plan: "Grundrisse / Pläne", document: "Weitere Unterlagen" };

function clean(value: string | null | undefined) {
  return value?.trim() || "";
}
function has(value: unknown): value is string | number {
  return value !== null && value !== undefined && value !== "";
}
function area(value: number | null | undefined) { return has(value) ? `${decimal.format(value)} m²` : ""; }
function addressText(address: PropertyExposeData["basicInformation"]["address"]) {
  const street = [clean(address.street), clean(address.houseNumber)].filter(Boolean).join(" ");
  const locality = [clean(address.postalCode), clean(address.city)].filter(Boolean).join(" ");
  return [street, locality].filter(Boolean).join(", ");
}
function label(value: string) { return propertyTypeLabels[value] || value.replaceAll("_", " "); }
function roomLabel(room: PropertyExposeData["rooms"][number]) { return clean(room.name) || roomTypeLabels[room.type] || "Raum"; }
function imageCaption(image: ExposeImage) {
  if (clean(image.caption)) return clean(image.caption);
  if (clean(image.subcategory)) return clean(image.subcategory);
  if (image.category === "floor_plan") return "Grundriss";
  if (image.category === "exterior") return "Hausansicht";
  if (image.category === "interior") return "Innenansicht";
  return "Weitere Unterlage";
}

function meaningfulAddress(address: PropertyExposeData["basicInformation"]["address"]) {
  return [address.street, address.houseNumber, address.postalCode, address.city, address.district].some(clean);
}
function meaningfulLocation(data: PropertyExposeData) {
  return meaningfulAddress(data.location.address) || Boolean(clean(data.location.district) || clean(data.location.neighborhood) || clean(data.location.description));
}
function fact(labelName: string, value: string | number | null | undefined) {
  return has(value) ? { label: labelName, value: String(value) } : null;
}

function facts(data: PropertyExposeData) {
  const details = data.propertyDetails;
  return [
    fact("Objektart", data.basicInformation.propertyType && label(data.basicInformation.propertyType)),
    fact("Objekttyp", data.basicInformation.propertySubtype),
    fact("Grundstücksfläche", area(details.plotArea)),
    fact("Zimmer", details.rooms),
    fact("Badezimmer", details.bathrooms),
    fact("Wohnfläche", has(details.livingArea) ? `ca. ${area(details.livingArea)}` : null),
    fact("Anzahl Garagen", details.garageCount),
    fact("Anzahl Stellplätze", details.parkingSpaceCount),
    fact("Baujahr/Fertigstellung", details.yearBuilt || details.completionYear ? `ca. ${details.yearBuilt || details.completionYear}` : null),
    fact("Hauptenergieträger", data.energy?.primaryEnergySource ? energyLabels[data.energy.primaryEnergySource] : null),
    fact("Kaufpreis", data.pricing.purchasePrice != null ? euro.format(data.pricing.purchasePrice) : null),
    fact("Käuferprovision", data.pricing.buyerCommission),
  ].filter((item): item is { label: string; value: string } => item !== null);
}

function energyFacts(data: PropertyExposeData) {
  const energy = data.energy;
  if (!energy) return undefined;
  const value = [
    fact("Energieausweis", energy.certificateType ? energyLabels[energy.certificateType] : null),
    fact("Bj. lt. Energieausweis", energy.yearOfConstruction),
    fact("Endenergiebedarf", energy.finalEnergyDemand != null ? `${decimal.format(energy.finalEnergyDemand)} kWh/(m²·a)` : null),
    fact("Endenergieverbrauch", energy.finalEnergyConsumption != null ? `${decimal.format(energy.finalEnergyConsumption)} kWh/(m²·a)` : null),
    fact("Energieeffizienzklasse", energy.efficiencyClass),
  ].filter((item): item is { label: string; value: string } => item !== null);
  return value.length ? { facts: value } : undefined;
}

function sourceSentences(data: PropertyExposeData) {
  const details = data.propertyDetails;
  const type = label(data.basicInformation.propertySubtype || data.basicInformation.propertyType);
  const location = [clean(data.location.address.city), clean(data.location.district || data.location.neighborhood)].filter(Boolean).join(", ");
  const sentences = [`Das ${type} befindet sich${location ? ` in ${location}` : ""}.`];
  if (details.livingArea != null || details.rooms != null) sentences.push(`Die Immobilie verfügt${details.livingArea != null ? ` über ca. ${area(details.livingArea)} Wohnfläche` : ""}${details.livingArea != null && details.rooms != null ? " und" : ""}${details.rooms != null ? ` ${details.rooms} Zimmer` : ""}.`);
  if (clean(data.description?.long)) sentences.push(clean(data.description?.long));
  if (clean(data.description?.short)) sentences.push(clean(data.description?.short));
  return sentences;
}

export async function generateCoverTitle(data: PropertyExposeData) {
  return clean(data.basicInformation.title) || `${label(data.basicInformation.propertySubtype || data.basicInformation.propertyType)}${data.location.address.city ? ` in ${data.location.address.city}` : ""}`;
}

export async function generatePropertySummary(data: PropertyExposeData) {
  const fallback = sourceSentences(data).slice(0, 2).join(" ");
  return generateSectionText("Einleitung", { type: data.basicInformation.propertyType, subtype: data.basicInformation.propertySubtype, address: data.location.address, facts: facts(data), source: data.description }, fallback, 2500);
}

export async function generatePropertyDescription(data: PropertyExposeData) {
  const paragraphs: Array<{ heading: string; text: string }> = [{ heading: "Einleitung", text: await generatePropertySummary(data) }];
  const layout = data.rooms.length ? `Das Raumprogramm umfasst ${data.rooms.map(roomLabel).join(", ")}.` : "";
  if (layout) paragraphs.push({ heading: "Architektur und Aufteilung", text: layout });
  const living = data.rooms.filter((room) => ["living_room", "dining_room"].includes(room.type));
  if (living.length) {
    const fallback = living.map((room) => `${roomLabel(room)}${room.area != null ? ` mit ca. ${area(room.area)}` : ""}${clean(room.description) ? `: ${clean(room.description)}` : "."}`).join(" ");
    paragraphs.push({ heading: "Wohnbereiche", text: await generateSectionText("Wohnbereiche", living, fallback, 3000) });
  }
  const privateRooms = data.rooms.filter((room) => ["bedroom", "child_room", "office"].includes(room.type));
  if (privateRooms.length) {
    const fallback = privateRooms.map((room) => `${roomLabel(room)}${room.area != null ? ` mit ca. ${area(room.area)}` : ""}${clean(room.description) ? `: ${clean(room.description)}` : "."}`).join(" ");
    paragraphs.push({ heading: "Private Räume", text: await generateSectionText("Private Räume", privateRooms, fallback, 3000) });
  }
  const wetRooms = data.rooms.filter((room) => ["kitchen", "bathroom", "guest_wc"].includes(room.type));
  if (wetRooms.length) {
    const fallback = wetRooms.map((room) => `${roomLabel(room)}${room.area != null ? ` mit ca. ${area(room.area)}` : ""}${room.features.length ? `, ausgestattet mit ${room.features.join(", ")}` : ""}${clean(room.description) ? `: ${clean(room.description)}` : "."}`).join(" ");
    paragraphs.push({ heading: "Küche und Bäder", text: await generateSectionText("Küche und Bäder", wetRooms, fallback, 3000) });
  }
  if (data.outdoorAreas.length) {
    const fallback = data.outdoorAreas.map((item) => `${outdoorLabels[item.type]}${item.area != null ? ` mit ca. ${area(item.area)}` : ""}${clean(item.description) ? `: ${clean(item.description)}` : "."}`).join(" ");
    paragraphs.push({ heading: "Außenbereiche", text: await generateSectionText("Außenbereiche", data.outdoorAreas, fallback, 2500) });
  }
  const additional = data.rooms.filter((room) => ["basement", "attic", "garage", "hobby_room", "utility_room"].includes(room.type));
  const additionalTexts = [
    ...additional.map((room) => `${roomLabel(room)}${room.area != null ? ` mit ca. ${area(room.area)}` : ""}${clean(room.description) ? `: ${clean(room.description)}` : "."}`),
    ...data.equipment.filter((item) => ["storage", "parking"].includes(item.category)).map((item) => `${item.name}${clean(item.description) ? `: ${clean(item.description)}` : "."}`),
  ];
  if (additionalTexts.length) paragraphs.push({ heading: "Zusätzliche Bereiche", text: additionalTexts.join(" ") });
  const constructionText = data.propertyDetails.yearBuilt || data.propertyDetails.completionYear ? `Das Baujahr bzw. Fertigstellungsjahr ist ${data.propertyDetails.yearBuilt || data.propertyDetails.completionYear}.` : "";
  const energyText = data.energy?.primaryEnergySource ? `Als Hauptenergieträger ist ${energyLabels[data.energy.primaryEnergySource]} angegeben.` : "";
  if (constructionText || energyText) paragraphs.push({ heading: "Baujahr und Energie", text: [constructionText, energyText].filter(Boolean).join(" ") });
  paragraphs.push({ heading: "Zusammenfassung", text: sourceSentences(data).filter((sentence, index, all) => all.indexOf(sentence) === index).join(" ") });
  return paragraphs.filter((paragraph) => clean(paragraph.text));
}

export async function generateRoomDescriptions(data: PropertyExposeData) {
  return Promise.all(data.rooms.map(async (room, index) => ({ roomId: room.id || `room-${index + 1}`, name: roomLabel(room), ...(room.area != null ? { area: area(room.area) } : {}), description: await generateSectionText("Raumprogramm", room, clean(room.description) || `${roomLabel(room)} ist als Teil des angegebenen Raumprogramms vorhanden${room.floor ? ` und liegt auf ${room.floor}` : ""}.`, 2000) })));
}

export async function generateEquipmentDescription(data: PropertyExposeData) {
  const facts = [...data.equipment.map((item) => ({ label: item.name, value: clean(item.description) || "vorhanden" })), ...data.outdoorAreas.map((item) => ({ label: outdoorLabels[item.type], value: item.area != null ? area(item.area) : "vorhanden" })), ...([data.propertyDetails.garageCount != null ? { label: "Garage", value: String(data.propertyDetails.garageCount) } : null, data.propertyDetails.parkingSpaceCount != null ? { label: "Stellplätze", value: String(data.propertyDetails.parkingSpaceCount) } : null]).filter((item): item is { label: string; value: string } => item !== null)];
  if (!facts.length) return undefined;
  const fallback = `Die Ausstattung umfasst ${facts.map((item) => item.label).join(", ")}.`;
  return { facts, description: await generateSectionText("Ausstattung im Überblick", facts, fallback, 4000) };
}

export async function generateLocationDescription(data: PropertyExposeData) {
  const location = data.location;
  const name = [clean(location.address.city), clean(location.district || location.neighborhood)].filter(Boolean).join(", ");
  const fallback = clean(location.description) || (name ? `Die Immobilie liegt in ${name}.` : "Zur Lage liegen derzeit nur die angegebenen Adressdaten vor.");
  const description = await generateSectionText("Lage", { address: location.address, district: location.district, neighborhood: location.neighborhood, description: location.description }, fallback, 2500);
  return { description, ...(clean(location.district) ? { district: clean(location.district) } : {}), ...(clean(location.neighborhood) ? { neighborhood: clean(location.neighborhood) } : {}), ...(location.intelligence ? { intelligence: location.intelligence } : {}) };
}

export async function generateOtherInformation(data: PropertyExposeData) {
  const info = data.additionalInformation;
  const items = [
    fact("Rechtliche Hinweise", info.legalNotes), fact("Hinweise des Verkäufers", info.sellerNotes), fact("Provisionshinweise", info.commissionNotes), fact("Verfügbarkeit", info.availability),
  ].filter((item): item is { label: string; value: string } => item !== null);
  return items.length ? { items } : undefined;
}

export async function generateAdditionalInformation(data: PropertyExposeData) {
  const items = [fact("Zusätzliche Angaben", data.additionalInformation.additionalInformation), fact("Parken", data.parking?.description)].filter((item): item is { label: string; value: string } => item !== null);
  return items.length ? { items } : undefined;
}

export async function generateImageCaptions(images: ExposeImage[]) {
  return Promise.all(images.map(async (image) => ({ assetId: image.assetId, caption: await generateSectionText("Bildunterschrift", { category: image.category, subcategory: image.subcategory, description: image.description }, imageCaption(image), 180) })));
}

function imageSections(data: PropertyExposeData) {
  const images = data.images.filter((image) => image.category !== "floor_plan");
  const grouped = new Map<string, ExposeImage[]>();
  for (const image of images) {
    const key = image.subcategory?.trim() || image.category;
    grouped.set(key, [...(grouped.get(key) || []), image]);
  }
  return [...grouped.entries()].map(([key, sectionImages]) => ({ category: sectionImages[0].category, label: key === sectionImages[0].category ? imageCategoryLabels[sectionImages[0].category] : key.replaceAll("_", " "), images: sectionImages.map((image) => ({ assetId: image.assetId, caption: imageCaption(image) })) }));
}
function planSections(data: PropertyExposeData) {
  return data.floorPlans.length ? [{ title: "Grundrisse / Pläne", images: data.floorPlans.map((image) => ({ assetId: image.assetId, caption: imageCaption(image) })) }] : undefined;
}
function mapSections(data: PropertyExposeData) {
  return data.maps.length ? [{ title: "Lageplan / Makrolage", images: data.maps.map((image) => ({ assetId: image.assetId, caption: imageCaption(image) })) }] : undefined;
}

function vistaSection(data: PropertyExposeData) {
  const branding = data.systemBranding;
  return {
    heading: "5 Schritte zur Wunschimmobilie",
    subtitle: "Standardisiert und individuell.",
    description: clean(branding.description) || `${branding.companyName} begleitet den Weg von den ersten Informationen bis zum Kaufabschluss.`,
    steps: branding.processSteps.length ? branding.processSteps : ["Das Exposé", "Interesse und Vorstellung als neues Zuhause", "Finanzierung", "Besichtigung und Entscheidung", "Notar und Kaufabschluss"],
    ...(clean(branding.logo) ? { logo: clean(branding.logo) } : {}),
    ...(branding.website ? { website: branding.website } : {}),
    ...(branding.email ? { email: branding.email } : {}),
    ...(clean(branding.phone) ? { phone: clean(branding.phone) } : {}),
  };
}

export async function generateVistaClosingContent(data: PropertyExposeData) { return vistaSection(data); }

export async function generateExposeContent(data: PropertyExposeData): Promise<ExposeContent> {
  const title = await generateCoverTitle(data);
  const cover: ExposeContent["cover"] = {
    title,
    ...(addressText(data.location.address) || clean(data.location.address.city) || clean(data.basicInformation.address.city) ? { location: addressText(data.location.address) || clean(data.location.address.city) || clean(data.basicInformation.address.city) } : {}),
  };
  const hero = data.images.filter((image) => image.category !== "floor_plan").find((image) => image.isHeroCandidate) || data.images.find((image) => image.category === "exterior");
  if (hero) cover.heroImage = { assetId: hero.assetId, caption: imageCaption(hero) };
  if (data.pricing.purchasePrice != null) cover.purchasePrice = euro.format(data.pricing.purchasePrice);
  if (data.propertyDetails.livingArea != null) cover.livingArea = `ca. ${area(data.propertyDetails.livingArea)}`;
  if (data.propertyDetails.rooms != null) cover.rooms = String(data.propertyDetails.rooms);

  const overview = energyFacts(data);
  const content: ExposeContent = {
    version: 2,
    cover,
    overview: { facts: facts(data), ...(overview ? { energy: overview } : {}) },
    propertyDescription: { paragraphs: await generatePropertyDescription(data) },
    ...(data.rooms.length ? { roomProgram: await generateRoomDescriptions(data) } : {}),
    ...(meaningfulLocation(data) ? { location: await generateLocationDescription(data) } : {}),
    ...(data.images.length ? { imageSections: imageSections(data) } : {}),
    ...(data.floorPlans.length ? { planSections: planSections(data) } : {}),
    ...(data.maps.length ? { mapSections: mapSections(data) } : {}),
    ...(data.agent ? { agentSection: data.agent } : {}),
    vistaSection: await generateVistaClosingContent(data),
  };
  if (meaningfulAddress(data.basicInformation.address)) content.objectInformation = { address: data.basicInformation.address };
  const equipment = await generateEquipmentDescription(data);
  const otherInformation = await generateOtherInformation(data);
  const additionalInformation = await generateAdditionalInformation(data);
  if (equipment) content.equipment = equipment;
  if (otherInformation) content.otherInformation = otherInformation;
  if (additionalInformation) content.additionalInformation = additionalInformation;
  return validateExposeContent(content);
}
