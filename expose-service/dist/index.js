import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createProperty, listProperties, getProperty, updateProperty, addImage, removeImage, reorderImages, setCover, saveExpose, uploadDir } from "./lib/store.js";
import { propertySchema, exposeContentSchema } from "./lib/validation.js";
import { generateExposeContent } from "./external-services/ai.js";
dotenv.config();
const app = express();
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "0.0.0.0";
const upload = multer({ storage: multer.memoryStorage() });
const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
const getParamValue = (value) => Array.isArray(value) ? value[0] : value ?? "";
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: "20mb", type: ["application/json", "application/*+json"] }));
app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "vista-expose-service" });
});
app.get("/ready", async (_req, res) => {
    try {
        await fs.access(uploadDir);
        res.json({ status: "ready", service: "vista-expose-service" });
    }
    catch {
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
    if (!property)
        return res.status(404).json({ error: "Not found" });
    res.json(property);
});
app.put("/api/properties/:id", async (req, res) => {
    try {
        const propertyId = getParamValue(req.params.id);
        const payload = propertySchema.parse(req.body);
        const property = await updateProperty(propertyId, payload);
        if (!property)
            return res.status(404).json({ error: "Not found" });
        res.json(property);
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
});
app.post("/api/properties/:id/ai/improve", async (req, res) => {
    const propertyId = getParamValue(req.params.id);
    const property = await getProperty(propertyId);
    if (!property)
        return res.status(404).json({ error: "Not found" });
    const action = typeof req.body?.action === "string" ? `Aktion: ${req.body.action}` : "";
    try {
        const content = await generateExposeContent(property, action);
        await saveExpose(property.id, content);
        res.json(content);
    }
    catch (error) {
        res.status(502).json({ error: error instanceof Error ? error.message : "AI could not respond" });
    }
});
app.get("/api/properties/:id/expose", async (req, res) => {
    const propertyId = getParamValue(req.params.id);
    const property = await getProperty(propertyId);
    if (!property)
        return res.status(404).json({ error: "Not found" });
    res.json(property.expose ?? null);
});
app.put("/api/properties/:id/expose", async (req, res) => {
    try {
        const propertyId = getParamValue(req.params.id);
        const content = exposeContentSchema.parse(req.body);
        const expose = await saveExpose(propertyId, content);
        if (!expose)
            return res.status(404).json({ error: "Not found" });
        res.json(expose);
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : "Invalid content" });
    }
});
app.post("/api/properties/:id/images", upload.array("files"), async (req, res) => {
    const propertyId = getParamValue(req.params.id);
    const property = await getProperty(propertyId);
    if (!property)
        return res.status(404).json({ error: "Not found" });
    const files = Array.isArray(req.files) ? req.files : [];
    const category = typeof req.body?.category === "string" ? req.body.category : "";
    const subcategory = typeof req.body?.subcategory === "string" ? req.body.subcategory : null;
    const caption = typeof req.body?.caption === "string" ? req.body.caption : null;
    if (!["exterior", "interior", "floor_plan", "document"].includes(category)) {
        return res.status(400).json({ error: "A semantic image category is required" });
    }
    if (!files.length)
        return res.status(400).json({ error: "No images found" });
    const images = [];
    await fs.mkdir(uploadDir, { recursive: true });
    for (const file of files) {
        if (!file || !allowed.has(file.mimetype)) {
            return res.status(400).json({ error: "Only JPG, PNG and WEBP are supported" });
        }
        if (file.size > 15 * 1024 * 1024) {
            return res.status(400).json({ error: "Images may be up to 15 MB" });
        }
        const name = `${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "")}`;
        const outputPath = path.join(uploadDir, name);
        await fs.writeFile(outputPath, file.buffer);
        const image = await addImage(property.id, {
            url: `/uploads/${name}`,
            fileName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            sequence: 0,
            isCover: false,
            assetId: randomUUID(),
            category: category,
            subcategory,
            caption,
            description: null,
            isHeroCandidate: category === "exterior" && !property.images.some((image) => image.isCover),
        });
        if (image)
            images.push(image);
    }
    res.status(201).json(images);
});
app.delete("/api/properties/:id/images/:imageId", async (req, res) => {
    const propertyId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const imageId = Array.isArray(req.params.imageId) ? req.params.imageId[0] : req.params.imageId;
    const property = await getProperty(propertyId);
    const image = property?.images.find((item) => item.id === imageId);
    if (!image)
        return res.status(404).json({ error: "Not found" });
    await removeImage(propertyId, imageId);
    if (image.url.startsWith("/uploads/")) {
        const safeUploadPath = image.url.replace(/^\/+/, "");
        await fs.rm(path.join(process.cwd(), "public", safeUploadPath), { force: true });
    }
    res.json({ ok: true });
});
app.put("/api/properties/:id/images/:imageId", async (req, res) => {
    if (!req.body?.cover)
        return res.status(400).json({ error: "Invalid action" });
    const propertyId = getParamValue(req.params.id);
    const imageId = getParamValue(req.params.imageId);
    const property = await setCover(propertyId, imageId);
    if (!property)
        return res.status(404).json({ error: "Not found" });
    res.json(property.images);
});
app.put("/api/properties/:id/images/reorder", async (req, res) => {
    const propertyId = getParamValue(req.params.id);
    const property = await reorderImages(propertyId, Array.isArray(req.body?.imageIds) ? req.body.imageIds : []);
    if (!property)
        return res.status(404).json({ error: "Not found" });
    res.json(property.images);
});
app.post("/api/properties/:id/pdf", async (req, res) => {
    const propertyId = getParamValue(req.params.id);
    const property = await getProperty(propertyId);
    if (!property?.expose?.content)
        return res.status(400).json({ error: "Please generate content first" });
    res.status(501).json({ error: "PDF generation is handled by the web application in this architecture." });
});
app.listen(port, host, () => {
    console.log(`Vista expose service listening on http://${host}:${port}`);
});
