-- Shared property-document records. expose-service creates records on upload
-- and serves file bytes; job-processor reads records + downloads the file from
-- object storage (R2), runs OCR + understanding and writes results back.
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "documentType" TEXT,
    "error" TEXT,
    "analysisResult" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "understandingResult" JSONB,
    "understandingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Document_propertyId_idx" ON "Document" ("propertyId");

CREATE INDEX "Document_status_idx" ON "Document" ("status");