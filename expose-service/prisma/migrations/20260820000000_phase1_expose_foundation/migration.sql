ALTER TABLE "Property"
ADD COLUMN "exposeData" JSONB;

ALTER TABLE "PropertyImage"
ADD COLUMN "assetId" TEXT,
ADD COLUMN "subcategory" TEXT,
ADD COLUMN "caption" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "isHeroCandidate" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE
    "PropertyEnergy" (
        "id" TEXT NOT NULL,
        "propertyId" TEXT NOT NULL,
        "certificateType" TEXT,
        "yearOfConstruction" INTEGER,
        "primaryEnergySource" TEXT,
        "finalEnergyDemand" DOUBLE PRECISION,
        "finalEnergyConsumption" DOUBLE PRECISION,
        "efficiencyClass" TEXT,
        CONSTRAINT "PropertyEnergy_pkey" PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX "PropertyEnergy_propertyId_key" ON "PropertyEnergy" ("propertyId");

ALTER TABLE "PropertyEnergy" ADD CONSTRAINT "PropertyEnergy_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE
    "PropertyAgent" (
        "id" TEXT NOT NULL,
        "propertyId" TEXT NOT NULL,
        "name" TEXT,
        "company" TEXT,
        "address" JSONB,
        "phone" TEXT,
        "email" TEXT,
        "website" TEXT,
        "photo" TEXT,
        "logo" TEXT,
        CONSTRAINT "PropertyAgent_pkey" PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX "PropertyAgent_propertyId_key" ON "PropertyAgent" ("propertyId");

ALTER TABLE "PropertyAgent" ADD CONSTRAINT "PropertyAgent_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE;