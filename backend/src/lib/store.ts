import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Expose, ExposeContent, Property, PropertyImage, PropertyPayload, PropertyRoom } from "./types.js";
import { emptyExposeData } from "./expose-data.js";
import { addressFromLegacy, addressKey } from "./location.js";
import type { LocationIntelligence } from "./expose-data.js";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "public", "uploads");
const dataFile = path.join(dataDir, "properties.json");

type DB = { properties: Property[] };

function normalizeProperty(property: Property): Property {
  if (property.exposeData) return property;
  const exposeData = emptyExposeData();
  exposeData.basicInformation = {
    propertyType: property.propertyType,
    propertySubtype: null,
    title: null,
    address: {
      street: property.address ?? null,
      houseNumber: null,
      postalCode: property.zipCode ?? null,
      city: property.city ?? null,
      district: property.district ?? null,
      country: "Deutschland",
    },
  };
  exposeData.pricing = {
    purchasePrice: property.transactionType === "sale" ? property.askingPrice : null,
    rentPrice: property.transactionType === "rent" ? property.coldRent ?? property.askingPrice : null,
    additionalCosts: property.additionalCosts,
    buyerCommission: property.commission,
    sellerCommission: null,
  };
  exposeData.propertyDetails = {
    ...exposeData.propertyDetails,
    livingArea: property.livingArea,
    plotArea: property.plotArea,
    rooms: property.rooms,
    bathrooms: property.bathrooms,
    yearBuilt: property.constructionYear,
    floor: property.floor,
    numberOfFloors: property.totalFloors,
  };
  exposeData.location = { address: exposeData.basicInformation.address, district: property.district, latitude: null, longitude: null, neighborhood: null, description: property.locationNote };
  exposeData.rooms = property.roomsData.map((room, order) => ({ id: room.id, type: "other", name: room.name, area: room.size, description: room.description, features: [], floor: room.floor, order }));
  exposeData.images = property.images.map((image, order) => ({ ...image, id: image.id, assetId: image.id, category: image.category ?? "document", subcategory: image.subcategory, caption: image.caption, description: image.description, order, isHeroCandidate: image.isHeroCandidate ?? image.isCover }));
  return { ...property, exposeData };
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

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadDir, { recursive: true });
}

async function readDB(): Promise<DB> {
  try {
    const db = JSON.parse(await fs.readFile(dataFile, "utf8")) as DB;
    return { properties: db.properties.map(normalizeProperty) };
  } catch {
    return { properties: [] };
  }
}

async function writeDB(db: DB) {
  await ensureDataDir();
  await fs.writeFile(dataFile, JSON.stringify(db, null, 2));
}

export async function createProperty(): Promise<Property> {
  await ensureDataDir();
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
  return property;
}

export async function listProperties() {
  const properties = (await readDB()).properties;
  return properties;
}

export async function getProperty(id: string) {
  const property = (await readDB()).properties.find((item) => item.id === id) ?? null;
  return property;
}

export async function updateProperty(id: string, payload: PropertyPayload): Promise<Property | null> {
  const db = await readDB();
  const index = db.properties.findIndex((item) => item.id === id);
  if (index < 0) return null;
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
  return updated;
}

export async function addImage(id: string, image: Omit<PropertyImage, "id">) {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) return null;

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
  return record;
}

export async function removeImage(id: string, imageId: string) {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) return null;

  const image = property.images.find((item) => item.id === imageId);
  property.images = property.images
    .filter((item) => item.id !== imageId)
    .map((item, sequence) => ({
      ...item,
      sequence,
      isCover:
        sequence === 0
          ? item.isCover || !property.images.some((candidate) => candidate.id !== imageId && candidate.isCover)
          : item.isCover,
    }));
  property.updatedAt = new Date().toISOString();
  syncExposeImages(property);
  await writeDB(db);
  return image ?? null;
}

export async function reorderImages(id: string, imageIds: string[]) {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) return null;

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
  return property;
}

export async function setCover(id: string, imageId: string) {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) return null;

  property.images = property.images.map((image) => ({
    ...image,
    isCover: image.id === imageId,
  }));
  syncExposeImages(property);
  await writeDB(db);
  return property;
}

export async function saveExpose(id: string, content: ExposeContent) {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) return null;

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
  return expose;
}

export async function saveLocationIntelligence(id: string, intelligence: LocationIntelligence | null) {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) return null;
  const exposeData = property.exposeData || emptyExposeData();
  exposeData.location = { ...exposeData.location, address: intelligence?.address || exposeData.location.address, latitude: intelligence?.coordinates.latitude ?? null, longitude: intelligence?.coordinates.longitude ?? null, district: intelligence?.address.district ?? exposeData.location.district ?? null, intelligence: intelligence || undefined };
  property.exposeData = exposeData;
  property.updatedAt = new Date().toISOString();
  await writeDB(db);
  return property;
}

export { uploadDir }; 
