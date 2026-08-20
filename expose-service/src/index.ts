import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

import { createProperty, listProperties, getProperty, updateProperty, addImage, removeImage, reorderImages, setCover, saveExpose, saveLocationIntelligence, uploadPath } from "./lib/store.js";
import { propertySchema, exposeContentSchema } from "./lib/validation.js";
import { generateExposeContent } from "./external-services/ai.js";
import { createManualLocation, resolveLocation } from "./lib/location-service.js";
import { exposeHTML } from "./lib/expose-template.js";
import type { PropertyPayload } from "./lib/types.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "0.0.0.0";
const upload = multer({ storage: multer.memoryStorage() });
const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
const getParamValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value ?? "";

app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: "20mb", type: ["application/json", "application/*+json"] }));
app.use("/uploads", express.static(uploadPath));
app.use("/demo", express.static(path.join(process.cwd(), "public", "demo")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "vista-expose-service" });
});

app.get("/api/properties/:id/location", async (req, res) => {
  const property = await getProperty(getParamValue(req.params.id));
  if (!property) return res.status(404).json({ error: "Not found" });
  res.json(property.exposeData?.location.intelligence || null);
});

app.post("/api/properties/:id/location", async (req, res) => {
  const propertyId = getParamValue(req.params.id);
  let property = await getProperty(propertyId);
  if (!property) return res.status(404).json({ error: "Not found" });
  const body = (req.body || {}) as { refresh?: boolean; latitude?: number; longitude?: number; radiusMeters?: number };
  try {
    if ((body.latitude !== undefined || body.longitude !== undefined) && (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude) || Number(body.latitude) < -90 || Number(body.latitude) > 90 || Number(body.longitude) < -180 || Number(body.longitude) > 180)) {
      return res.status(400).json({ error: "Coordinates are invalid." });
    }
    const intelligence = Number.isFinite(body.latitude) && Number.isFinite(body.longitude)
      ? await createManualLocation(property, { latitude: Number(body.latitude), longitude: Number(body.longitude) }, { radiusMeters: body.radiusMeters })
      : (await resolveLocation(property, { refresh: body.refresh, radiusMeters: body.radiusMeters })).intelligence;
    if (!intelligence) return res.status(422).json({ error: "Location could not be resolved." });
    const saved = await saveLocationIntelligence(propertyId, intelligence);
    res.json(saved?.exposeData?.location.intelligence || intelligence);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Location could not be resolved." });
  }
});

app.post("/api/properties/:id/location/refresh", async (req, res) => {
  const propertyId = getParamValue(req.params.id);
  const property = await getProperty(propertyId);
  if (!property) return res.status(404).json({ error: "Not found" });
  try {
    const result = await resolveLocation(property, { refresh: true });
    if (!result.intelligence) return res.status(422).json({ error: result.error || "Location could not be resolved." });
    const saved = await saveLocationIntelligence(propertyId, result.intelligence);
    res.json(saved?.exposeData?.location.intelligence || result.intelligence);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Location could not be resolved." });
  }
});
app.get("/ready", async (_req, res) => {
  try {
    await fs.access(uploadPath);
    res.json({ status: "ready", service: "vista-expose-service" });
  } catch {
    res.status(503).json({ status: "not-ready", service: "vista-expose-service" });
  }
});

app.get("/api/properties", async (_req, res) => {
  const properties = await listProperties();
  res.json(properties);
});

app.post("/api/properties", async (_req, res) => {
  const property = await createProperty();
  res.status(201).json(property);
});

app.get("/api/properties/:id", async (req, res) => {
  const propertyId = getParamValue(req.params.id);
  const property = await getProperty(propertyId);
  if (!property) return res.status(404).json({ error: "Not found" });
  res.json(property);
});

app.put("/api/properties/:id", async (req, res) => {
  try {
    const propertyId = getParamValue(req.params.id);
    const payload = propertySchema.parse(req.body);
    const property = await updateProperty(propertyId, payload as Parameters<typeof updateProperty>[1]);
    if (!property) return res.status(404).json({ error: "Not found" });
    res.json(property);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
  }
});

app.post("/api/properties/:id/ai/improve", async (req, res) => {
  const propertyId = getParamValue(req.params.id);
  let property = await getProperty(propertyId);
  if (!property) return res.status(404).json({ error: "Not found" });

  const action = typeof req.body?.action === "string" ? `Aktion: ${req.body.action}` : "";
  try {
    const location = await resolveLocation(property);
    if (location.intelligence) {
      await saveLocationIntelligence(property.id, location.intelligence);
      property = (await getProperty(property.id)) || property;
    }
    const content = await generateExposeContent(property, action);
    await saveExpose(property.id, content);
    res.json(content);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "AI could not respond" });
  }
});

app.get("/api/properties/:id/expose", async (req, res) => {
  const propertyId = getParamValue(req.params.id);
  const property = await getProperty(propertyId);
  if (!property) return res.status(404).json({ error: "Not found" });
  res.json(property.expose ?? null);
});

app.put("/api/properties/:id/expose", async (req, res) => {
  try {
    const propertyId = getParamValue(req.params.id);
    const content = exposeContentSchema.parse(req.body);
    const expose = await saveExpose(propertyId, content);
    if (!expose) return res.status(404).json({ error: "Not found" });
    res.json(expose);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid content" });
  }
});

app.post("/api/properties/:id/images", upload.array("files"), async (req, res) => {
  const propertyId = getParamValue(req.params.id);
  const property = await getProperty(propertyId);
  if (!property) return res.status(404).json({ error: "Not found" });

  const files = Array.isArray(req.files) ? req.files : [];
  const category = typeof req.body?.category === "string" ? req.body.category : "";
  const subcategory = typeof req.body?.subcategory === "string" ? req.body.subcategory : null;
  const caption = typeof req.body?.caption === "string" ? req.body.caption : null;
  if (!["exterior", "interior", "floor_plan", "document"].includes(category)) {
    return res.status(400).json({ error: "A semantic image category is required" });
  }
  if (!files.length) return res.status(400).json({ error: "No images found" });

  const images: Array<Record<string, unknown>> = [];
  await fs.mkdir(uploadPath, { recursive: true });

  for (const file of files) {
    if (!file || !allowed.has(file.mimetype)) {
      return res.status(400).json({ error: "Only JPG, PNG and WEBP are supported" });
    }
    if (file.size > 15 * 1024 * 1024) {
      return res.status(400).json({ error: "Images may be up to 15 MB" });
    }

    const name = `${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "")}`;
    const outputPath = path.join(uploadPath, name);
    await fs.writeFile(outputPath, file.buffer);

    const image = await addImage(property.id, {
      url: `/uploads/${name}`,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      sequence: 0,
      isCover: false,
      assetId: randomUUID(),
      category: category as "exterior" | "interior" | "floor_plan" | "document",
      subcategory,
      caption,
      description: null,
      isHeroCandidate: category === "exterior" && !property.images.some((image) => image.isCover),
    });
    if (image) images.push(image);
  }

  res.status(201).json(images);
});

app.delete("/api/properties/:id/images/:imageId", async (req, res) => {
  const propertyId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const imageId = Array.isArray(req.params.imageId) ? req.params.imageId[0] : req.params.imageId;

  const property = await getProperty(propertyId);
  const image = property?.images.find((item) => item.id === imageId);
  if (!image) return res.status(404).json({ error: "Not found" });

  await removeImage(propertyId, imageId);
  if (image.url.startsWith("/uploads/")) {
    await fs.rm(path.join(uploadPath, path.basename(image.url)), { force: true });
  }
  res.json({ ok: true });
});

app.put("/api/properties/:id/images/:imageId", async (req, res) => {
  if (!req.body?.cover) return res.status(400).json({ error: "Invalid action" });
  const propertyId = getParamValue(req.params.id);
  const imageId = getParamValue(req.params.imageId);
  const property = await setCover(propertyId, imageId);
  if (!property) return res.status(404).json({ error: "Not found" });
  res.json(property.images);
});

app.put("/api/properties/:id/images/reorder", async (req, res) => {
  const propertyId = getParamValue(req.params.id);
  const property = await reorderImages(propertyId, Array.isArray(req.body?.imageIds) ? req.body.imageIds : []);
  if (!property) return res.status(404).json({ error: "Not found" });
  res.json(property.images);
});

app.post("/api/properties/:id/pdf", async (req, res) => {
  const propertyId = getParamValue(req.params.id);
  const property = await getProperty(propertyId);
  if (!property?.expose?.content) return res.status(400).json({ error: "Please generate content first" });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
    await page.setContent(await exposeHTML(property, property.expose.content), { waitUntil: "networkidle" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="vista-expose-${property.id}.pdf"` }).send(pdf);
  } finally {
    await browser.close();
  }
});

app.post("/api/demo", async (_req, res) => {
  const property = await createProperty();
  const payload: PropertyPayload = {
    propertyType: "apartment", transactionType: "sale", constructionYear: 2018, address: "Weserstraße 42", zipCode: "12045", city: "Berlin", district: "Neukölln", livingArea: 92, plotArea: null, rooms: 3, bedrooms: 2, bathrooms: 1, floor: "2. OG", totalFloors: 5, availableFrom: "sofort", condition: "new", askingPrice: 449000, additionalCosts: null, commission: "3,57 % inkl. MwSt.", hausgeld: 390, coldRent: null, deposit: null, selectedFeatures: ["balcony", "elevator", "fitted-kitchen", "underfloor-heating", "basement", "energy-efficient"], additionalFeatures: "Südwest-Balkon mit Weitblick", surroundings: { transport: "U7 und mehrere Buslinien in der Umgebung", shopping: "Vielfältige Geschäfte und Wochenmarkt", restaurants: "Cafés und Restaurants fußläufig erreichbar", parks: "Volkspark Hasenheide für Freizeit und Erholung" }, locationNote: "Lebendiges Umfeld mit Cafés, kleinen Läden und kurzen Wegen zu den täglichen Zielen.", sellerDescription: "Eine helle Wohnung mit offenem Grundriss und sorgfältig ausgewählten Materialien.", specialNotes: "DEMO / TESTDATEN", targetAudience: "Paare und anspruchsvolle Eigennutzer", tone: "modern", language: "de", roomsData: [
      { name: "Wohnbereich", type: "Wohnen", size: 32, floor: "2. OG", description: "Große Fenster und direkter Zugang zum Südwest-Balkon.", sequence: 0 },
      { name: "Schlafzimmer", type: "Schlafen", size: 15, floor: "2. OG", description: "Ruhiger Rückzugsort mit Platz für ein Doppelbett.", sequence: 1 },
      { name: "Arbeitszimmer", type: "Arbeiten", size: 11, floor: "2. OG", description: "Flexibel nutzbarer Raum für Homeoffice oder Gäste.", sequence: 2 },
      { name: "Küche", type: "Kochen", size: 9, floor: "2. OG", description: "Moderne Einbauküche mit klarer Linienführung.", sequence: 3 },
    ],
  };
  await updateProperty(property.id, payload);
  for (let index = 1; index <= 6; index += 1) await addImage(property.id, { url: `/demo/room-${index}.svg`, fileName: `demo-room-${index}.svg`, mimeType: "image/svg+xml", size: 0, sequence: index - 1, isCover: index === 1 });
  res.status(201).json({ id: property.id });
});
app.listen(port, host, () => {
  console.log(`Vista expose service listening on http://${host}:${port}`);
});
