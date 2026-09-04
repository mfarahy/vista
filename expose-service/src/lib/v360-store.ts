import { Prisma } from '@prisma/client';
import { getPrisma } from './jobs/store.js';
import { getLogger } from './logger.js';
import type { NormalizedPolygon } from './v360-geometry.js';

/**
 * Prisma-backed store for the Vista 360 floorplan/panorama records.
 * Mirrors the `document-record-store.ts` pattern: records hold metadata +
 * raw analysis only; the actual image bytes live in object storage (R2)
 * keyed by `originalKey`. Both the floor plan and its panoramas are served
 * through the API, so the store stays storage-agnostic.
 */

export type FloorplanStatus = 'pending' | 'analyzing' | 'analyzed' | 'failed';

export interface PanoramaRecord {
  id: string;
  floorplanId: string;
  originalKey: string;
  imageUrl: string;
  mimeType: string;
  size: number;
  cameraX: number | null;
  cameraY: number | null;
  cameraYaw: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface FloorplanRecord {
  id: string;
  propertyId: string | null;
  originalKey: string;
  imageUrl: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  status: FloorplanStatus;
  error: string | null;
  analysisResult: Prisma.JsonValue | null;
  floorBoundary: NormalizedPolygon | null;
  cameraX: number | null;
  cameraY: number | null;
  cameraYaw: number | null;
  panoramas: PanoramaRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateFloorplanInput {
  id: string;
  originalKey: string;
  imageUrl: string;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
}

export interface CreatePanoramaInput {
  id: string;
  floorplanId: string;
  originalKey: string;
  imageUrl: string;
  mimeType: string;
  size: number;
  cameraX?: number | null;
  cameraY?: number | null;
  cameraYaw?: number | null;
}

export interface FloorplanPatch {
  status?: FloorplanStatus;
  error?: string | null;
  analysisResult?: Prisma.JsonValue | null;
  floorBoundary?: NormalizedPolygon | null;
  cameraX?: number | null;
  cameraY?: number | null;
  cameraYaw?: number | null;
}

interface FloorplanRow {
  id: string;
  propertyId: string | null;
  originalKey: string;
  imageUrl: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  status: string;
  error: string | null;
  analysisResult: Prisma.JsonValue | null;
  floorBoundary: Prisma.JsonValue | null;
  cameraX: number | null;
  cameraY: number | null;
  cameraYaw: number | null;
  createdAt: Date;
  updatedAt: Date;
  panoramas: PanoramaRow[];
}

interface PanoramaRow {
  id: string;
  floorplanId: string;
  originalKey: string;
  imageUrl: string;
  mimeType: string;
  size: number;
  cameraX: number | null;
  cameraY: number | null;
  cameraYaw: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function panoramaToRecord(row: PanoramaRow): PanoramaRecord {
  return {
    id: row.id,
    floorplanId: row.floorplanId,
    originalKey: row.originalKey,
    imageUrl: row.imageUrl,
    mimeType: row.mimeType,
    size: row.size,
    cameraX: row.cameraX,
    cameraY: row.cameraY,
    cameraYaw: row.cameraYaw,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToRecord(row: FloorplanRow): FloorplanRecord {
  return {
    id: row.id,
    propertyId: row.propertyId,
    originalKey: row.originalKey,
    imageUrl: row.imageUrl,
    mimeType: row.mimeType,
    size: row.size,
    width: row.width,
    height: row.height,
    status: row.status as FloorplanStatus,
    error: row.error,
    analysisResult: row.analysisResult,
    floorBoundary: row.floorBoundary as NormalizedPolygon | null,
    cameraX: row.cameraX,
    cameraY: row.cameraY,
    cameraYaw: row.cameraYaw,
    panoramas: row.panoramas?.map(panoramaToRecord) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The floorplan/panorama record operations the API routes depend on (injectable). */
export interface V360Store {
  getFloorplan(id: string): Promise<FloorplanRecord | null>;
  createFloorplan(input: CreateFloorplanInput): Promise<FloorplanRecord>;
  updateFloorplan(id: string, patch: FloorplanPatch): Promise<FloorplanRecord | null>;
  getPanorama(id: string): Promise<PanoramaRecord | null>;
  createPanorama(input: CreatePanoramaInput): Promise<PanoramaRecord>;
}

export const v360Store: V360Store = {
  async getFloorplan(id: string): Promise<FloorplanRecord | null> {
    const row = await getPrisma().floorplan.findUnique({
      where: { id },
      include: { panoramas: { orderBy: { createdAt: 'asc' } } },
    });
    return row ? rowToRecord(row as unknown as FloorplanRow) : null;
  },

  async createFloorplan(input: CreateFloorplanInput): Promise<FloorplanRecord> {
    const row = await getPrisma().floorplan.create({
      data: {
        id: input.id,
        originalKey: input.originalKey,
        imageUrl: input.imageUrl,
        mimeType: input.mimeType,
        size: input.size,
        width: input.width ?? null,
        height: input.height ?? null,
        status: 'pending',
      },
      include: { panoramas: true },
    });
    getLogger().info(
      { floorplanId: input.id, mimeType: input.mimeType, size: input.size },
      'Created floorplan {floorplanId}',
    );
    return rowToRecord(row as unknown as FloorplanRow);
  },

  async updateFloorplan(id: string, patch: FloorplanPatch): Promise<FloorplanRecord | null> {
    const data: Prisma.FloorplanUpdateInput = {};
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.error !== undefined) data.error = patch.error;
    if (patch.analysisResult !== undefined)
      data.analysisResult = patch.analysisResult as unknown as Prisma.InputJsonValue;
    if (patch.floorBoundary !== undefined)
      data.floorBoundary = patch.floorBoundary as unknown as Prisma.InputJsonValue;
    if (patch.cameraX !== undefined) data.cameraX = patch.cameraX;
    if (patch.cameraY !== undefined) data.cameraY = patch.cameraY;
    if (patch.cameraYaw !== undefined) data.cameraYaw = patch.cameraYaw;
    try {
      const row = await getPrisma().floorplan.update({
        where: { id },
        data,
        include: { panoramas: { orderBy: { createdAt: 'asc' } } },
      });
      return rowToRecord(row as unknown as FloorplanRow);
    } catch {
      getLogger().warn({ floorplanId: id }, 'updateFloorplan not found for {floorplanId}');
      return null;
    }
  },

  async getPanorama(id: string): Promise<PanoramaRecord | null> {
    const row = await getPrisma().panorama.findUnique({ where: { id } });
    return row ? panoramaToRecord(row as unknown as PanoramaRow) : null;
  },

  async createPanorama(input: CreatePanoramaInput): Promise<PanoramaRecord> {
    const row = await getPrisma().panorama.create({
      data: {
        id: input.id,
        floorplanId: input.floorplanId,
        originalKey: input.originalKey,
        imageUrl: input.imageUrl,
        mimeType: input.mimeType,
        size: input.size,
        cameraX: input.cameraX ?? null,
        cameraY: input.cameraY ?? null,
        cameraYaw: input.cameraYaw ?? null,
      },
    });
    getLogger().info(
      {
        panoramaId: input.id,
        floorplanId: input.floorplanId,
        mimeType: input.mimeType,
        size: input.size,
      },
      'Created panorama {panoramaId} for floorplan {floorplanId}',
    );
    return panoramaToRecord(row as unknown as PanoramaRow);
  },
};
