import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Expose, ExposeContent, Property, PropertyImage, PropertyPayload, PropertyRoom } from "./types.js";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "public", "uploads");
const dataFile = path.join(dataDir, "properties.json");

type DB = { properties: Property[] };

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadDir, { recursive: true });
}

async function readDB(): Promise<DB> {
  try {
    return JSON.parse(await fs.readFile(dataFile, "utf8")) as DB;
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
    language: "en",
    images: [],
    roomsData: [],
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
    roomsData,
    updatedAt: new Date().toISOString(),
  };

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
  };
  property.images.push(record);
  property.updatedAt = new Date().toISOString();
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

export { uploadDir }; 
