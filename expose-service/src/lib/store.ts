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
import type { FloorPlan3DRecord } from './floorplan-3d/types.js';
import { emptyExposeData } from './expose-data.js';
import { emptyBrokerProfile, type BrokerProfile } from './broker-profile.js';
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
type DB = { properties: Property[]; documents: DocumentRecord[]; brokerProfile?: BrokerProfile | null };

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
    return {
      properties: db.properties.map(normalizeProperty),
      documents: db.documents ?? [],
      brokerProfile: db.brokerProfile ?? null,
    };
  } catch {
    return { properties: [], documents: [], brokerProfile: null };
  }
}
async function writeDB(db: DB) {
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  // Atomic replace: a torn write must never leave a partially written JSON file
  // that the next write would overwrite with an empty database.
  const tempPath = `${dataPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(db, null, 2));
  await fs.rename(tempPath, dataPath);
}

/**
 * Serializes store writes that run concurrently (for example the per-document
 * status updates of a parallel upload batch). The JSON store is not safe for
 * concurrent read-modify-write cycles, so writes are chained while the
 * expensive OCR/AI work stays parallel.
 */
let writeChain: Promise<unknown> = Promise.resolve();
function serializedWrite<T>(write: () => Promise<T>): Promise<T> {
  const next = writeChain.then(write, write);
  writeChain = next.catch(() => undefined);
  return next;
}

export function createProperty(): Promise<Property> {
  return serializedWrite(() => createPropertyNow());
}
async function createPropertyNow(): Promise<Property> {
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
export function updateProperty(
  id: string,
  payload: PropertyPayload,
): Promise<Property | null> {
  return serializedWrite(() => updatePropertyNow(id, payload));
}
async function updatePropertyNow(
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
export function addImage(
  id: string,
  image: Omit<PropertyImage, 'id'>,
): Promise<PropertyImage | null> {
  return serializedWrite(() => addImageNow(id, image));
}
async function addImageNow(
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
export function removeImage(id: string, imageId: string): Promise<PropertyImage | null> {
  return serializedWrite(() => removeImageNow(id, imageId));
}
async function removeImageNow(id: string, imageId: string): Promise<PropertyImage | null> {
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
export function reorderImages(id: string, imageIds: string[]): Promise<Property | null> {
  return serializedWrite(() => reorderImagesNow(id, imageIds));
}
async function reorderImagesNow(id: string, imageIds: string[]): Promise<Property | null> {
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
export function setCover(id: string, imageId: string): Promise<Property | null> {
  return serializedWrite(() => setCoverNow(id, imageId));
}
async function setCoverNow(id: string, imageId: string): Promise<Property | null> {
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
export function saveExpose(id: string, content: StoredExposeContent): Promise<Expose | null> {
  return serializedWrite(() => saveExposeNow(id, content));
}
async function saveExposeNow(id: string, content: StoredExposeContent): Promise<Expose | null> {
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
export function saveExposeConfiguration(
  id: string,
  configuration: ExposeConfiguration,
): Promise<ExposeConfiguration | null> {
  return serializedWrite(() => saveExposeConfigurationNow(id, configuration));
}
async function saveExposeConfigurationNow(
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
export function saveMarketingContent(
  id: string,
  content: MarketingContentRecord,
): Promise<Property | null> {
  return serializedWrite(() => saveMarketingContentNow(id, content));
}
async function saveMarketingContentNow(
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

/**
 * Persists the floor plan 3D generation record on the property. The completed
 * model is stored so the Expose can reuse it without calling the provider
 * again; a failed generation keeps the 2D floor plan as the fallback.
 */
export function saveFloorPlan3D(
  id: string,
  record: FloorPlan3DRecord,
): Promise<Property | null> {
  return serializedWrite(() => saveFloorPlan3DNow(id, record));
}
async function saveFloorPlan3DNow(id: string, record: FloorPlan3DRecord): Promise<Property | null> {
  const db = await readDB();
  const property = db.properties.find((item) => item.id === id);
  if (!property) {
    getLogger().warn({ id }, 'saveFloorPlan3D property not found for {id}');
    return null;
  }
  property.floorPlan3D = record;
  property.updatedAt = new Date().toISOString();
  await writeDB(db);
  getLogger().info(
    {
      id,
      status: record.status,
      provider: record.provider,
      sourceImageId: record.sourceImageId,
    },
    'Saved floor plan 3D {status} record for property {id}',
  );
  return property;
}

/**
 * Reads the persisted floor plan 3D generation record of a property, or null
 * when generation was never started.
 */
export async function getFloorPlan3D(id: string): Promise<FloorPlan3DRecord | null> {
  const property = await getProperty(id);
  return property?.floorPlan3D ?? null;
}

export function saveLocationIntelligence(
  id: string,
  intelligence: LocationIntelligence | null,
): Promise<Property | null> {
  return serializedWrite(() => saveLocationIntelligenceNow(id, intelligence));
}
async function saveLocationIntelligenceNow(
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

export function saveLocationResearch(
  id: string,
  research: LocationResearch | null,
): Promise<Property | null> {
  return serializedWrite(() => saveLocationResearchNow(id, research));
}
async function saveLocationResearchNow(
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

export function saveBorisEnrichment(
  id: string,
  enrichment: BorisEnrichment | null,
): Promise<Property | null> {
  return serializedWrite(() => saveBorisEnrichmentNow(id, enrichment));
}
async function saveBorisEnrichmentNow(
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

export function createDocument(
  propertyId: string,
  input: {
    filename: string;
    mimeType: string;
    size: number;
    url: string;
  },
): Promise<DocumentRecord> {
  return serializedWrite(() => createDocumentNow(propertyId, input));
}
async function createDocumentNow(
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
    url?: string;
    status?: DocumentStatus;
    documentType?: DocumentType | null;
    error?: string | null;
    analysisResult?: DocumentAnalysisResult | null;
    tags?: string[];
    understandingResult?: DocumentUnderstandingResult | null;
    understandingError?: string | null;
  },
): Promise<DocumentRecord | null> {
  return serializedWrite(() => updateDocumentNow(documentId, patch));
}

async function updateDocumentNow(
  documentId: string,
  patch: Parameters<typeof updateDocument>[1],
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

export function removeDocument(documentId: string): Promise<DocumentRecord | null> {
  return serializedWrite(() => removeDocumentNow(documentId));
}
async function removeDocumentNow(documentId: string): Promise<DocumentRecord | null> {
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

/* ------------------------------------------------------------------ */
/* Broker profile                                                      */
/* ------------------------------------------------------------------ */

const nonEmpty = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/**
 * Maps the legacy per-property agent data (the wizard's old "Agent/Kontakt"
 * step) onto the Broker Profile shape. Used to seed the profile page when no
 * profile has been saved yet, so existing agent data is migrated instead of
 * lost. The result is only a suggestion: it is persisted when the user saves
 * the Broker Profile.
 */
export function legacyAgentToProfile(
  agent: NonNullable<Property['exposeData']>['agent'],
): BrokerProfile {
  const profile = emptyBrokerProfile();
  profile.name = nonEmpty(agent?.name) ?? '';
  profile.company = nonEmpty(agent?.company);
  profile.photo = nonEmpty(agent?.photo);
  profile.logo = nonEmpty(agent?.logo);
  profile.address = agent?.address;
  profile.website = nonEmpty(agent?.website);
  profile.phone = nonEmpty(agent?.phone);
  profile.email = nonEmpty(agent?.email);
  return profile;
}

/**
 * Reads the persisted broker profile. When none exists yet, returns a profile
 * seeded from the legacy agent data of the most recently updated property —
 * this migrates existing agent information into the Broker Profile without
 * touching the property records. Nothing is persisted by a read.
 */
export async function getBrokerProfile(): Promise<BrokerProfile> {
  const db = await readDB();
  if (db.brokerProfile) return db.brokerProfile;
  const latestWithAgent = [...db.properties]
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .find((property) => {
      const agent = property.exposeData?.agent;
      return agent != null && Object.values(agent).some((value) => value != null && value !== '');
    });
  return latestWithAgent ? legacyAgentToProfile(latestWithAgent.exposeData!.agent) : emptyBrokerProfile();
}

/** Persists the broker profile (upsert). */
export function saveBrokerProfile(profile: BrokerProfile): Promise<BrokerProfile> {
  return serializedWrite(() => saveBrokerProfileNow(profile));
}
async function saveBrokerProfileNow(profile: BrokerProfile): Promise<BrokerProfile> {
  const db = await readDB();
  db.brokerProfile = profile;
  await writeDB(db);
  getLogger().info({ name: profile.name }, 'Saved broker profile');
  return profile;
}
