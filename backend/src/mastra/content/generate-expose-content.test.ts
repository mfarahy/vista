import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyExposeData, propertyExposeDataSchema } from "../../lib/expose-data.js";
import { generateExposeContent } from "./generate-expose-content.js";
import { validateExposeContentReferences } from "../schemas/expose-content.js";

function referenceProperty() {
  const data = emptyExposeData();
  data.basicInformation = {
    propertyType: "house",
    propertySubtype: "Einfamilienhaus",
    title: "Einfamilienhaus mit Garten",
    address: { street: "Furkastrasse", houseNumber: "88a", postalCode: "12107", city: "Berlin", country: "Deutschland" },
  };
  data.location = { address: data.basicInformation.address, district: "Marienfelde", neighborhood: null, description: "Ruhige Wohnlage im Süden Berlins." };
  data.pricing = { purchasePrice: 499000, rentPrice: null, additionalCosts: null, buyerCommission: "3,57 % inkl. ges. MwSt.", sellerCommission: null };
  data.propertyDetails = { ...data.propertyDetails, livingArea: 130, plotArea: 784, rooms: 3, bathrooms: 1, yearBuilt: 1969, garageCount: 1, parkingSpaceCount: 1 };
  data.energy = { certificateType: "needs_based", yearOfConstruction: 1969, primaryEnergySource: "oil", finalEnergyDemand: 250.2, finalEnergyConsumption: null, efficiencyClass: "H" };
  data.rooms = [
    { id: "living", type: "living_room", name: "Wohnzimmer", area: 31, description: "Wohnbereich mit Zugang zum Garten.", features: [], floor: "Erdgeschoss" },
    { id: "kitchen", type: "kitchen", name: "Küche", area: 11, description: null, features: ["Einbauküche"], floor: "Erdgeschoss" },
  ];
  data.equipment = [{ id: "garage", category: "parking", name: "Garage", description: null }];
  data.outdoorAreas = [{ type: "garden", area: null, orientation: null, description: "Garten am Haus." }];
  data.images = [{ assetId: "hero-1", category: "exterior", caption: null, subcategory: null, description: null, isHeroCandidate: true, fileName: "Screenshot_1.png" }];
  data.floorPlans = [{ assetId: "plan-1", category: "floor_plan", caption: "Grundriss Erdgeschoss", subcategory: null, description: null, isHeroCandidate: false, fileName: "plan.png" }];
  return propertyExposeDataSchema.parse(data);
}

describe("generateExposeContent", () => {
  it("creates a complete factual German content structure from canonical data", async () => {
    const property = referenceProperty();
    const content = await generateExposeContent(property);

    assert.equal(content.cover.purchasePrice, "499.000 €");
    assert.equal(content.cover.livingArea, "ca. 130,00 m²");
    assert.equal(content.cover.rooms, "3");
    assert.deepEqual(content.overview.energy?.facts.map((item) => item.label), ["Energieausweis", "Bj. lt. Energieausweis", "Endenergiebedarf", "Energieeffizienzklasse"]);
    assert.equal(content.overview.facts.find((item) => item.label === "Hauptenergieträger")?.value, "Öl");
    assert.equal(content.objectInformation?.address.street, "Furkastrasse");
    assert.equal(content.roomProgram?.length, 2);
    assert.equal(content.imageSections?.[0].images[0].assetId, "hero-1");
    assert.equal(content.planSections?.[0].images[0].assetId, "plan-1");
    assert.ok(content.propertyDescription?.paragraphs.length && content.propertyDescription.paragraphs.length >= 4);
    assert.ok(!JSON.stringify(content).includes("Screenshot_1.png"));
    assert.ok(JSON.stringify(content).includes("Wohnfläche"));
  });

  it("omits sections without meaningful source data", async () => {
    const property = referenceProperty();
    property.rooms = [];
    property.propertyDetails = { ...property.propertyDetails, garageCount: null, parkingSpaceCount: null };
    property.equipment = [];
    property.outdoorAreas = [];
    property.images = [];
    property.floorPlans = [];
    property.maps = [];
    property.energy = null;
    property.location = { address: { country: "Deutschland" }, latitude: null, longitude: null, district: null, neighborhood: null, description: null };
    const content = await generateExposeContent(property);

    assert.equal(content.overview.energy, undefined);
    assert.equal(content.roomProgram, undefined);
    assert.equal(content.equipment, undefined);
    assert.equal(content.location, undefined);
    assert.equal(content.imageSections, undefined);
    assert.equal(content.planSections, undefined);
  });

  it("rejects references to unknown assets", async () => {
    const property = referenceProperty();
    const content = await generateExposeContent(property);
    assert.throws(() => validateExposeContentReferences(property, { ...content, cover: { ...content.cover, heroImage: { assetId: "missing", caption: "Hausansicht" } } }));
  });
});
