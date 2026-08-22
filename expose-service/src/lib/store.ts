import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  DocumentAnalysisResult,
  DocumentRecord,
  DocumentStatus,
  DocumentType,
  Expose,
  StoredExposeContent,
  Property,
  PropertyImage,
  PropertyPayload,
  PropertyRoom,
} from './types.js';
import type { ExposeConfiguration } from './expose-configuration.js';
import type { DocumentUnderstandingResult } from './document-understanding/types.js';
import type { MarketingContentRecord } from './marketing-content/types.js';
import { emptyExposeData } from './expose-data.js';
import { addressFromLegacy, addressKey } from '../external-services/location.js';
import type { LocationIntelligence } from './expose-data.js';
import type { BorisEnrichment } from './expose-data.js';
import type { LocationResearch } from '../mastra/schemas/location-research.js';
import { getLogger } from './logger.js';

const dataPath = process.env.DATA_DIR
  ? path.join(path.resolve(process.env.DATA_DIR), 'properties.json')
  : path.join(process.cwd(), 'data', 'properties.json');
const uploadPath = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'public', 'uploads');
type DB = { properties: Property[]; documents: DocumentRecord[] };

function normalizeProperty(property: Property): Property {
  if (property.exposeData) return property;
  const data = emptyExposeData();
  data.basicInformation.address = {
    street: property.address ?? null,
    houseNumber: null,
    postalCode: property.zipCode ?? null,
    city: property.city ?? null,
    district: property.district ?? null,
    country: 'Deutschland',
  };
  data.basicInformation.propertyType = property.propertyType;
  data.pricing = {
    purchasePrice: property.transactionType === 'sale' ? property.askingPrice : null,
    rentPrice:
      property.transactionType === 'rent' ? (property.coldRent ?? property.askingPrice) : null,
    additionalCosts: property.additionalCosts,
    buyerCommission: property.commission,
    sellerCommission: null,
  };
  data.propertyDetails = {
    ...data.propertyDetails,
    livingArea: property.livingArea,
    plotArea: property.plotArea,
    rooms: property.rooms,
    bathrooms: property.bathrooms,
    yearBuilt: property.constructionYear,
    floor: property.floor,
    numberOfFloors: property.totalFloors,
  };
  data.location = {
    address: data.basicInformation.address,
    district: property.district,
    latitude: null,
    longitude: null,
    neighborhood: null,
    description: property.locationNote,
  };
  data.rooms = property.roomsData.map((room, order) => ({
    id: room.id,
    type: 'other',
    name: room.name,
    area: room.size,
    description: room.description,
    features: [],
    floor: room.floor,
    order,
  }));
  data.images = property.images.map((image, order) => ({
    ...image,
    id: image.id,
    assetId: image.id,
    category: image.category ?? 'document',
    subcategory: image.subcategory,
    caption: image.caption,
    description: image.description,
    order,
    isHeroCandidate: image.isHeroCandidate ?? image.isCover,
  }));
  return { ...property, exposeData: data };
}

function syncExposeImages(property: Property) {
  if (!property.exposeData) return;
  property.exposeData.images = property.images.map((item, order) => ({
    ...item,
    id: item.id,
    assetId: item.assetId ?? item.id,
    category: item.category ?? 'document',
    order,
    isHeroCandidate: item.isHeroCandidate ?? item.isCover,
  }));
}

async function readDB(): Promise<DB> {
  try {
    const db = JSON.parse(await fs.readFile(dataPath, 'utf8')) as DB;
    return { properties: db.properties.map(normalizeProperty), documents: db.documents ?? [] };
  } catch {
    return { properties: [], documents: [] };
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
    propertyType: 'apartment',
    transactionType: 'sale',
    selectedFeatures: [],
    surroundings: {},
    tone: 'professional',
    language: 'de',
    images: [],
    roomsData: [],
    exposeData: emptyExposeData(),
    expose: null,
    createdAt: now,
    updatedAt: now,
  };
  db.properties.unshift(property);
  await writeDB(db);
  getLogger().info({ propertyId: property.id }, 'Created property {propertyId}');
  return property;
}
export async function listProperties(): Promise<Property[]> {
  const properties = (await readDB()).properties;
  getLogger().info({ count: properties.length }, 'Listed {count} properties');
  return properties;
}
export async function getProperty(id: string): Promise<Property | null> {
  const property = (await readDB()).properties.find((item) => item.id === id) ?? null;
  getLogger().debug({ id, found: Boolean(property) }, 'getProperty {id}');
  return property;
}
export async function updateProperty(
  id: string,
  payload: PropertyPayload,
): Promise<Property | null> {
  const db = await readDB();
  const index = db.properties.findIndex((item) => item.id === id);
  if (index < 0) {
    getLogger().warn({ id }, 'updateProperty not found for {id}');
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

  const oldAddress =
    old.exposeData?.basicInformation.address ||
    addressFromLegacy(old.address, old.zipCode, old.city, old.district);
  const newAddress =
    payload.exposeData?.basicInformation.address ||
    addressFromLegacy(updated.address, updated.zipCode, updated.city, updated.district);
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
  getLogger().info(
    { id, roomCount: roomsData.length, updatedAt: updated.updatedAt },
    'Updated property {id}',
  );
  return updated;
}
export async function addImage(
  id: string,
  image: Omit<PropertyImage, 'id'>,
): Promise<PropertyImage | null> {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) {
    getLogger().warn({ id }, 'addImage property not found for {id}');
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
  await writeDB(db);
  getLogger().info(
    { id, imageId: record.id, fileName: record.fileName },
    'Added image {imageId} to property {id}',
  );
  return record;
}
export async function removeImage(id: string, imageId: string): Promise<PropertyImage | null> {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) {
    getLogger().warn({ id }, 'removeImage property not found for {id}');
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
            !property.images.some((candidate) => candidate.id !== imageId && candidate.isCover)
          : item.isCover,
    }));
  property.updatedAt = new Date().toISOString();
  syncExposeImages(property);
  await writeDB(db);
  getLogger().info(
    { id, imageId, fileName: image?.fileName ?? 'unknown' },
    'Removed image {imageId} from property {id}',
  );
  return image ?? null;
}
export async function reorderImages(id: string, imageIds: string[]): Promise<Property | null> {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) {
    getLogger().warn({ id }, 'reorderImages property not found for {id}');
    return null;
  }
  const byId = new Map(property.images.map((image) => [image.id, image]));
  property.images = imageIds
    .map((imageId, sequence) => {
      const image = byId.get(imageId);
      if (!image) return null;
      return { ...image, sequence, isCover: Boolean(image.isCover) };
    })
    .filter((image): image is PropertyImage => image !== null);
  property.updatedAt = new Date().toISOString();
  await writeDB(db);
  getLogger().info(
    { id, imageCount: property.images.length },
    'Reordered {imageCount} images for property {id}',
  );
  return property;
}
export async function setCover(id: string, imageId: string): Promise<Property | null> {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) {
    getLogger().warn({ id }, 'setCover property not found for {id}');
    return null;
  }
  property.images = property.images.map((image) => ({
    ...image,
    isCover: image.id === imageId,
  }));
  syncExposeImages(property);
  await writeDB(db);
  getLogger().info({ id, imageId }, 'Set cover image {imageId} for property {id}');
  return property;
}
export async function saveExpose(id: string, content: StoredExposeContent): Promise<Expose | null> {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) {
    getLogger().warn({ id }, 'saveExpose property not found for {id}');
    return null;
  }
  const expose: Expose = {
    id: property.expose?.id ?? randomUUID(),
    propertyId: id,
    template: 'modern',
    content,
    generatedAt: new Date().toISOString(),
  };
  property.expose = expose;
  property.updatedAt = new Date().toISOString();
  await writeDB(db);
  getLogger().info(
    { id, exposeId: expose.id, title: 'version' in content ? content.cover.title : content.title },
    'Saved expose content {exposeId} for property {id}',
  );
  return expose;
}

/**
 * Reads the persisted Expose configuration of a property, or null when the
 * property has no Expose record yet. The Builder falls back to defaults.
 */
export async function getExposeConfiguration(id: string): Promise<ExposeConfiguration | null> {
  const property = await getProperty(id);
  return property?.expose?.configuration ?? null;
}

/**
 * Persists the Expose configuration on the property's Expose record. Creates
 * the Expose record when the user reaches the Builder without having saved AI
 * content. Only the presentation configuration is stored — never Property or
 * MarketingContent copies.
 */
export async function saveExposeConfiguration(
  id: string,
  configuration: ExposeConfiguration,
): Promise<ExposeConfiguration | null> {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) {
    getLogger().warn({ id }, 'saveExposeConfiguration property not found for {id}');
    return null;
  }
  if (!property.expose) {
    property.expose = {
      id: randomUUID(),
      propertyId: id,
      template: 'modern',
      content: null,
      configuration,
      generatedAt: new Date().toISOString(),
    };
  } else {
    property.expose.configuration = configuration;
  }
  property.updatedAt = new Date().toISOString();
  await writeDB(db);
  getLogger().info(
    { id, sectionCount: configuration.sections.length },
    'Saved expose configuration for property {id}',
  );
  return configuration;
}

/**
 * Persists generated marketing content on the property record. The factual
 * Property data is never touched by marketing generation; this only stores the
 * separate MarketingContent layer.
 */
export async function saveMarketingContent(
  id: string,
  content: MarketingContentRecord,
): Promise<Property | null> {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) {
    getLogger().warn({ id }, 'saveMarketingContent property not found for {id}');
    return null;
  }
  property.marketingContent = content;
  property.updatedAt = new Date().toISOString();
  await writeDB(db);
  getLogger().info(
    { id, title: content.title.value, sources: contentSourcesOf(content) },
    'Saved marketing content for property {id}',
  );
  return property;
}

function contentSourcesOf(content: MarketingContentRecord): Record<string, string> {
  return {
    title: content.title.source,
    subtitle: content.subtitle.source,
    highlights: content.highlights.source,
    propertyDescription: content.propertyDescription.source,
    equipmentDescription: content.equipmentDescription.source,
    locationDescription: content.locationDescription?.source ?? 'none',
  };
}

export async function saveLocationIntelligence(
  id: string,
  intelligence: LocationIntelligence | null,
): Promise<Property | null> {
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

export async function saveLocationResearch(
  id: string,
  research: LocationResearch | null,
): Promise<Property | null> {
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

export async function saveBorisEnrichment(
  id: string,
  enrichment: BorisEnrichment | null,
): Promise<Property | null> {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) return null;
  const exposeData = property.exposeData || emptyExposeData();
  exposeData.location = { ...exposeData.location, boris: enrichment || undefined };
  property.exposeData = exposeData;
  property.updatedAt = new Date().toISOString();
  await writeDB(db);
  return property;
}
export async function listDocuments(propertyId: string): Promise<DocumentRecord[]> {
  const db = await readDB();
  return db.documents.filter((document) => document.propertyId === propertyId);
}

export async function getDocument(documentId: string): Promise<DocumentRecord | null> {
  const db = await readDB();
  return db.documents.find((document) => document.id === documentId) ?? null;
}

export async function createDocument(
  propertyId: string,
  input: {
    filename: string;
    mimeType: string;
    size: number;
    url: string;
  },
): Promise<DocumentRecord> {
  const db = await readDB();
  const now = new Date().toISOString();
  const record: DocumentRecord = {
    id: randomUUID(),
    propertyId,
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.size,
    url: input.url,
    status: 'pending',
    documentType: null,
    error: null,
    analysisResult: null,
    tags: [],
    understandingResult: null,
    understandingError: null,
    createdAt: now,
    updatedAt: now,
  };
  db.documents.push(record);
  await writeDB(db);
  getLogger().info(
    { documentId: record.id, propertyId, fileName: record.filename },
    'Created document {documentId} for property {propertyId}',
  );
  return record;
}

export async function updateDocument(
  documentId: string,
  patch: {
    status?: DocumentStatus;
    documentType?: DocumentType | null;
    error?: string | null;
    analysisResult?: DocumentAnalysisResult | null;
    tags?: string[];
    understandingResult?: DocumentUnderstandingResult | null;
    understandingError?: string | null;
  },
): Promise<DocumentRecord | null> {
  const db = await readDB();
  const record = db.documents.find((document) => document.id === documentId);
  if (!record) {
    getLogger().warn({ documentId }, 'updateDocument not found for {documentId}');
    return null;
  }
  Object.assign(record, patch, { updatedAt: new Date().toISOString() });
  await writeDB(db);
  getLogger().info(
    { documentId, status: record.status, documentType: record.documentType ?? 'unknown' },
    'Updated document {documentId}',
  );
  return record;
}

export async function removeDocument(documentId: string): Promise<DocumentRecord | null> {
  const db = await readDB();
  const index = db.documents.findIndex((document) => document.id === documentId);
  if (index < 0) {
    getLogger().warn({ documentId }, 'removeDocument not found for {documentId}');
    return null;
  }
  const [removed] = db.documents.splice(index, 1);
  await writeDB(db);
  getLogger().info({ documentId, fileName: removed.filename }, 'Removed document {documentId}');
  return removed;
}

export { uploadPath };
