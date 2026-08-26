-- Baseline schema as it existed before the phase1 migration. Reconstructed so
-- that `prisma migrate deploy` can bootstrap a fresh database (these objects
-- were originally created via `prisma db push` and never captured as a
-- migration).

CREATE TYPE "JobStatus" AS ENUM ('queued', 'processing', 'completed', 'failed');

CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "constructionYear" INTEGER,
    "address" TEXT,
    "zipCode" TEXT,
    "city" TEXT,
    "district" TEXT,
    "neighborhood" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "formattedAddress" TEXT,
    "geocodingProvider" TEXT,
    "geocodedAt" TIMESTAMP(3),
    "geocodingConfidence" DOUBLE PRECISION,
    "geocodingMatchType" TEXT,
    "locationSource" TEXT,
    "livingArea" DOUBLE PRECISION,
    "plotArea" DOUBLE PRECISION,
    "rooms" DOUBLE PRECISION,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "floor" TEXT,
    "totalFloors" INTEGER,
    "availableFrom" TEXT,
    "condition" TEXT,
    "askingPrice" DOUBLE PRECISION,
    "additionalCosts" DOUBLE PRECISION,
    "commission" TEXT,
    "hausgeld" DOUBLE PRECISION,
    "coldRent" DOUBLE PRECISION,
    "deposit" DOUBLE PRECISION,
    "selectedFeatures" TEXT[],
    "additionalFeatures" TEXT,
    "surroundings" JSONB,
    "locationNote" TEXT,
    "sellerDescription" TEXT,
    "specialNotes" TEXT,
    "targetAudience" TEXT,
    "tone" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PropertyImage" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "room" TEXT,
    "category" TEXT,
    "confidence" DOUBLE PRECISION,
    "aiDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertyImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PropertyRoom" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "size" DOUBLE PRECISION,
    "floor" TEXT,
    "description" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PropertyRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LocationCache" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "searchRadius" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LocationCache_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Expose" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "template" TEXT NOT NULL DEFAULT 'modern',
    "pdfUrl" TEXT,
    "pdfFileName" TEXT,
    "generatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Expose_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExposeContent" (
    "id" TEXT NOT NULL,
    "exposeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "portalTitle" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "mainDescription" TEXT NOT NULL,
    "highlights" JSONB NOT NULL,
    "roomDescriptions" JSONB NOT NULL,
    "locationDescription" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL,
    "factualSnapshot" JSONB NOT NULL,
    CONSTRAINT "ExposeContent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT,
    "message" TEXT,
    "error" TEXT,
    "payload" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Expose_propertyId_key" ON "Expose"("propertyId");
CREATE UNIQUE INDEX "ExposeContent_exposeId_key" ON "ExposeContent"("exposeId");
CREATE INDEX "LocationCache_propertyId_searchRadius_idx" ON "LocationCache"("propertyId", "searchRadius");
CREATE INDEX "Job_status_idx" ON "Job"("status");
CREATE INDEX "Job_type_idx" ON "Job"("type");

ALTER TABLE "PropertyImage" ADD CONSTRAINT "PropertyImage_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyRoom" ADD CONSTRAINT "PropertyRoom_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LocationCache" ADD CONSTRAINT "LocationCache_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expose" ADD CONSTRAINT "Expose_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExposeContent" ADD CONSTRAINT "ExposeContent_exposeId_fkey" FOREIGN KEY ("exposeId") REFERENCES "Expose"("id") ON DELETE CASCADE ON UPDATE CASCADE;
