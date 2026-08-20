import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Expose,
  ExposeContent,
  StoredExposeContent,
  Property,
  PropertyImage,
  PropertyPayload,
  PropertyRoom,
} from "./types.js";
import { emptyExposeData } from "./expose-data.js";
import { addressFromLegacy, addressKey } from "../external-services/location.js";
import type { LocationIntelligence } from "./expose-data.js";
import type { LocationResearch } from "../mastra/schemas/location-research.js";

const dataPath = path.join(process.cwd(), "data", "properties.json");
const uploadPath = path.join(process.cwd(), "public", "uploads");
type DB = { properties: Property[] };

function normalizeProperty(property: Property): Property {
  if (property.exposeData) return property;
  const data = emptyExposeData();
  data.basicInformation.address = { street: property.address ?? null, houseNumber: null, postalCode: property.zipCode ?? null, city: property.city ?? null, district: property.district ?? null, country: "Deutschland" };
  data.basicInformation.propertyType = property.propertyType;
  data.pricing = { purchasePrice: property.transactionType === "sale" ? property.askingPrice : null, rentPrice: property.transactionType === "rent" ? property.coldRent ?? property.askingPrice : null, additionalCosts: property.additionalCosts, buyerCommission: property.commission, sellerCommission: null };
  data.propertyDetails = { ...data.propertyDetails, livingArea: property.livingArea, plotArea: property.plotArea, rooms: property.rooms, bathrooms: property.bathrooms, yearBuilt: property.constructionYear, floor: property.floor, numberOfFloors: property.totalFloors };
  data.location = { address: data.basicInformation.address, district: property.district, latitude: null, longitude: null, neighborhood: null, description: property.locationNote };
  data.rooms = property.roomsData.map((room, order) => ({ id: room.id, type: "other", name: room.name, area: room.size, description: room.description, features: [], floor: room.floor, order }));
  data.images = property.images.map((image, order) => ({ ...image, id: image.id, assetId: image.id, category: image.category ?? "document", subcategory: image.subcategory, caption: image.caption, description: image.description, order, isHeroCandidate: image.isHeroCandidate ?? image.isCover }));
  return { ...property, exposeData: data };
}

function syncExposeImages(property: Property) {
  if (!property.exposeData) return;
  property.exposeData.images = property.images.map((item, order) => ({
    ...item,
    id: item.id,
    assetId: item.assetId ?? item.id,
    category: item.category ?? "document",
    order,
    isHeroCandidate: item.isHeroCandidate ?? item.isCover,
  }));
}

async function readDB(): Promise<DB> {
  try {
    const db = JSON.parse(await fs.readFile(dataPath, "utf8")) as DB;
    return { properties: db.properties.map(normalizeProperty) };
  } catch {
    return { properties: [] };
  }
}
async function writeDB(db: DB) {
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify(db, null, 2));
}
export async function createProperty(): Promise<Property> {
  const db = await readDB();
  const now = new Date().toISOString();
  const property: Property = {
    id: randomUUID(),
    propertyType: "apartment",
    transactionType: "sale",
    selectedFeatures: [],
    surroundings: {},
    tone: "professional",
    language: "de",
    images: [],
    roomsData: [],
    exposeData: emptyExposeData(),
    expose: null,
    createdAt: now,
    updatedAt: now,
  };
  db.properties.unshift(property);
  await writeDB(db);
  console.info("[store] created property", { propertyId: property.id });
  return property;
}
export async function listProperties() {
  const properties = (await readDB()).properties;
  console.info("[store] listed properties", { count: properties.length });
  return properties;
}
export async function getProperty(id: string) {
  const property = (await readDB()).properties.find((item) => item.id === id) ?? null;
  console.info("[store] getProperty", { id, found: Boolean(property) });
  return property;
}
export async function updateProperty(
  id: string,
  payload: PropertyPayload,
): Promise<Property | null> {
  const db = await readDB();
  const index = db.properties.findIndex((item) => item.id === id);
  if (index < 0) {
    console.warn("[store] updateProperty not found", { id });
    return null;
  }
  const old = db.properties[index];
  const roomsData: PropertyRoom[] = payload.roomsData.map((room, sequence) => ({
    ...room,
    id: old.roomsData[sequence]?.id ?? randomUUID(),
    sequence,
  }));
  const updated = {
    ...old,
    ...payload,
    exposeData: payload.exposeData ?? old.exposeData,
    roomsData,
    updatedAt: new Date().toISOString(),
  };

  const oldAddress = old.exposeData?.basicInformation.address || addressFromLegacy(old.address, old.zipCode, old.city, old.district);
  const newAddress = payload.exposeData?.basicInformation.address || addressFromLegacy(updated.address, updated.zipCode, updated.city, updated.district);
  if (!updated.exposeData) updated.exposeData = emptyExposeData();
  updated.exposeData.basicInformation.address = newAddress;
  updated.exposeData.location.address = newAddress;
  if (addressKey(oldAddress) !== addressKey(newAddress)) {
    updated.exposeData.location.latitude = null;
    updated.exposeData.location.longitude = null;
    updated.exposeData.location.intelligence = undefined;
  }
  db.properties[index] = updated;
  await writeDB(db);
  console.info("[store] updated property", {
    id,
    roomCount: roomsData.length,
    updatedAt: updated.updatedAt,
  });
  return updated;
}
export async function addImage(id: string, image: Omit<PropertyImage, "id">) {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) {
    console.warn("[store] addImage property not found", { id });
    return null;
  }
  const record = {
    ...image,
    id: randomUUID(),
    sequence: property.images.length,
    isCover: property.images.length === 0,
    assetId: image.assetId ?? randomUUID(),
  };
  property.images.push(record);
  syncExposeImages(property);
  property.updatedAt = new Date().toISOString();
  syncExposeImages(property);
  await writeDB(db);
  console.info("[store] added image", { id, imageId: record.id, fileName: record.fileName });
  return record;
}
export async function removeImage(id: string, imageId: string) {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) {
    console.warn("[store] removeImage property not found", { id });
    return null;
  }
  const image = property.images.find((item) => item.id === imageId);
  property.images = property.images
    .filter((item) => item.id !== imageId)
    .map((item, sequence) => ({
      ...item,
      sequence,
      isCover:
        sequence === 0
          ? item.isCover ||
            !property.images.some(
              (candidate) => candidate.id !== imageId && candidate.isCover,
            )
          : item.isCover,
    }));
  property.updatedAt = new Date().toISOString();
  syncExposeImages(property);
  await writeDB(db);
  console.info("[store] removed image", { id, imageId, fileName: image?.fileName ?? "unknown" });
  return image ?? null;
}
export async function reorderImages(id: string, imageIds: string[]) {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) {
    console.warn("[store] reorderImages property not found", { id });
    return null;
  }
  const byId = new Map(property.images.map((image) => [image.id, image]));
  property.images = imageIds
    .map((imageId, sequence) => ({
      ...byId.get(imageId)!,
      sequence,
      isCover: Boolean(byId.get(imageId)?.isCover),
    }))
    .filter((image) => image.id);
  property.updatedAt = new Date().toISOString();
  await writeDB(db);
  console.info("[store] reordered images", { id, imageCount: property.images.length });
  return property;
}
export async function setCover(id: string, imageId: string) {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) {
    console.warn("[store] setCover property not found", { id });
    return null;
  }
  property.images = property.images.map((image) => ({
    ...image,
    isCover: image.id === imageId,
  }));
  syncExposeImages(property);
  await writeDB(db);
  console.info("[store] set cover image", { id, imageId });
  return property;
}
export async function saveExpose(id: string, content: StoredExposeContent) {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) {
    console.warn("[store] saveExpose property not found", { id });
    return null;
  }
  const expose: Expose = {
    id: property.expose?.id ?? randomUUID(),
    propertyId: id,
    template: "modern",
    content,
    generatedAt: new Date().toISOString(),
  };
  property.expose = expose;
  property.updatedAt = new Date().toISOString();
  await writeDB(db);
  console.info("[store] saved expose content", {
    id,
    exposeId: expose.id,
    title: "version" in content ? content.cover.title : content.title,
  });
  return expose;
}

export async function saveLocationIntelligence(id: string, intelligence: LocationIntelligence | null) {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) return null;
  const exposeData = property.exposeData || emptyExposeData();
  exposeData.location = {
    ...exposeData.location,
    address: intelligence?.address || exposeData.location.address,
    latitude: intelligence?.coordinates.latitude ?? null,
    longitude: intelligence?.coordinates.longitude ?? null,
    district: intelligence?.address.district ?? exposeData.location.district ?? null,
    intelligence: intelligence || undefined,
  };
  property.exposeData = exposeData;
  property.updatedAt = new Date().toISOString();
  await writeDB(db);
  return property;
}

export async function saveLocationResearch(id: string, research: LocationResearch | null) {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) return null;
  const exposeData = property.exposeData || emptyExposeData();
  exposeData.location = { ...exposeData.location, research: research || undefined };
  property.exposeData = exposeData;
  property.updatedAt = new Date().toISOString();
  await writeDB(db);
  return property;
}
export { uploadPath };
