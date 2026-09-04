-- Floorplan + Panorama records for the Vista 360 floorplan-to-panorama MVP.
-- The original image bytes live in object storage (R2) keyed by `originalKey`;
-- only metadata, the raw Raster2Seq analysis and the derived floor boundary
-- are stored here.

CREATE TABLE "Floorplan" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "originalKey" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "analysisResult" JSONB,
    "floorBoundary" JSONB,
    "cameraX" DOUBLE PRECISION,
    "cameraY" DOUBLE PRECISION,
    "cameraYaw" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Floorplan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Floorplan_propertyId_idx" ON "Floorplan" ("propertyId");

CREATE TABLE "Panorama" (
    "id" TEXT NOT NULL,
    "floorplanId" TEXT NOT NULL,
    "originalKey" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "cameraX" DOUBLE PRECISION,
    "cameraY" DOUBLE PRECISION,
    "cameraYaw" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Panorama_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Panorama_floorplanId_idx" ON "Panorama" ("floorplanId");

ALTER TABLE "Panorama" ADD CONSTRAINT "Panorama_floorplanId_fkey" FOREIGN KEY ("floorplanId") REFERENCES "Floorplan" ("id") ON DELETE CASCADE ON UPDATE CASCADE;