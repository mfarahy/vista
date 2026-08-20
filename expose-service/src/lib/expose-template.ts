import fs from "node:fs/promises";
import path from "node:path";
import type {
  ExposeContent,
  ExposeImage,
  Property,
  PropertyImage,
  StructuredExposeContent,
  StructuredExposeFact,
  StructuredExposeImageReference,
} from "./types.js";
import type { PropertyExposeData } from "./expose-data.js";
import { structuredExposeContentSchema } from "./validation.js";

type RenderContent = ExposeContent | StructuredExposeContent;
type Asset = PropertyImage | ExposeImage;
type ResolvedAsset = { src: string; width: number; height: number; mimeType: string };

const esc = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const money = (value?: number | null) => value == null
  ? ""
  : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const paragraphs = (value: string) => value.split(/\n\s*\n|\n/).map((item) => item.trim()).filter(Boolean);
const hasText = (value: unknown): value is string | number => value !== null && value !== undefined && value !== "";

function isStructuredContent(value: RenderContent): value is StructuredExposeContent {
  return "version" in value && value.version === 2;
}

type Address = PropertyExposeData["basicInformation"]["address"];

function addressLines(address?: Address | null) {
  if (!address) return [];
  const street = [clean(address.street), clean(address.houseNumber)].filter(Boolean).join(" ");
  const city = [clean(address.postalCode), clean(address.city)].filter(Boolean).join(" ");
  return [street, city, clean(address.district)].filter(Boolean);
}

function imageCaption(asset: Asset, fallback?: string) {
  if (clean(fallback)) return clean(fallback);
  if (clean(asset.caption)) return clean(asset.caption);
  if (clean(asset.subcategory)) return clean(asset.subcategory);
  if (asset.category === "exterior") return "Hausansicht";
  if (asset.category === "interior") return "room" in asset ? clean(asset.room) || "Innenansicht" : "Innenansicht";
  if (asset.category === "floor_plan") return "Grundriss";
  return "Weitere Unterlage";
}

function assetPath(url: string) {
  if (url.startsWith("/")) return path.join(process.cwd(), "public", url.replace(/^\/+/, ""));
  if (url.startsWith("file://")) return new URL(url).pathname;
  return path.join(process.cwd(), "public", url);
}

function dimensions(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/svg+xml") {
    const source = buffer.toString("utf8");
    const viewBox = source.match(/viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
    const width = source.match(/\bwidth\s*=\s*["']([\d.]+)/i);
    const height = source.match(/\bheight\s*=\s*["']([\d.]+)/i);
    return viewBox
      ? { width: Number(viewBox[1]), height: Number(viewBox[2]) }
      : { width: Number(width?.[1]) || 1, height: Number(height?.[1]) || 1 };
  }
  if (mimeType === "image/png" && buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === "image/gif" && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (mimeType === "image/webp" && buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF") {
    if (buffer.toString("ascii", 12, 16) === "VP8X") return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    if (buffer.toString("ascii", 12, 16) === "VP8 ") return { width: 1, height: 1 };
  }
  if (mimeType === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      offset += 2 + length;
    }
  }
  return { width: 1, height: 1 };
}

function inferMime(value: string, fallback?: string) {
  if (fallback?.startsWith("image/")) return fallback;
  const extension = value.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  return extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : extension === "gif" ? "image/gif" : extension === "svg" ? "image/svg+xml" : "image/png";
}

function isImageBuffer(buffer: Buffer, mimeType: string) {
  const signature = buffer.subarray(0, 12).toString("ascii");
  return (mimeType === "image/png" && buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
    || (mimeType === "image/jpeg" && buffer[0] === 0xff && buffer[1] === 0xd8)
    || (mimeType === "image/gif" && (signature.startsWith("GIF87a") || signature.startsWith("GIF89a")))
    || (mimeType === "image/webp" && signature.startsWith("RIFF"))
    || (mimeType === "image/svg+xml" && /<svg(?:\s|>)/i.test(buffer.toString("utf8", 0, 500)));
}

async function loadImage(url: string, declaredMime?: string): Promise<ResolvedAsset | null> {
  try {
    let buffer: Buffer;
    let mimeType = inferMime(url, declaredMime);
    if (url.startsWith("data:")) {
      const match = url.match(/^data:(image\/[\w.+-]+);base64,([\s\S]*)$/);
      if (!match) return null;
      mimeType = match[1];
      buffer = Buffer.from(match[2], "base64");
    } else if (/^https?:\/\//i.test(url)) {
      const response = await fetch(url);
      if (!response.ok) return null;
      mimeType = response.headers.get("content-type")?.split(";")[0] || mimeType;
      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      buffer = await fs.readFile(assetPath(url));
    }
    if (!isImageBuffer(buffer, mimeType)) return null;
    const size = dimensions(buffer, mimeType);
    return { src: `data:${mimeType};base64,${buffer.toString("base64")}`, ...size, mimeType };
  } catch (error) {
    console.warn("[pdf] image asset unavailable", { url: url.startsWith("data:") ? "data-uri" : url, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

function allAssets(property: Property) {
  const assets = new Map<string, Asset>();
  for (const asset of [...property.images, ...(property.exposeData?.images || []), ...(property.exposeData?.floorPlans || []), ...(property.exposeData?.maps || [])]) {
    const id = "assetId" in asset ? asset.assetId : undefined;
    const setAsset = (key: string | undefined) => {
      if (!key) return;
      const existing = assets.get(key);
      const hasUrl = "url" in asset && Boolean(asset.url);
      const existingHasUrl = existing && "url" in existing && Boolean(existing.url);
      if (!existing || hasUrl || !existingHasUrl) assets.set(key, asset);
    };
    setAsset(id);
    if ("id" in asset) setAsset(asset.id);
  }
  return assets;
}

async function resolveReference(reference: StructuredExposeImageReference, assets: Map<string, Asset>) {
  const asset = assets.get(reference.assetId);
  if (!asset) {
    console.warn("[pdf] image reference not found", { assetId: reference.assetId });
    return null;
  }
  const url = "url" in asset ? asset.url : "";
  const resolved = url ? await loadImage(url, "mimeType" in asset ? asset.mimeType : undefined) : null;
  if (!resolved) console.warn("[pdf] image reference omitted", { assetId: reference.assetId });
  return resolved ? { ...resolved, caption: imageCaption(asset, reference.caption) } : null;
}

function factGrid(facts: StructuredExposeFact[]) {
  if (!facts.length) return "";
  return `<div class="fact-grid">${facts.map((fact) => `<div class="fact"><span>${esc(fact.label)}</span><strong>${esc(fact.value)}</strong></div>`).join("")}</div>`;
}

function textSection(title: string, body: string, kicker = "") {
  const content = paragraphs(body).map((item) => `<p>${esc(item)}</p>`).join("");
  return `<section class="page section-page"><div class="section-head"><p class="kicker">${esc(kicker)}</p><h2>${esc(title)}</h2></div><div class="prose">${content}</div></section>`;
}

function factSection(title: string, facts: StructuredExposeFact[], description?: string) {
  return `<section class="page section-page"><div class="section-head"><p class="kicker">VISTA IMMOBILIEN-EXPOSÉ</p><h2>${esc(title)}</h2></div>${factGrid(facts)}${description ? `<div class="prose compact">${paragraphs(description).map((item) => `<p>${esc(item)}</p>`).join("")}</div>` : ""}</section>`;
}

function subsectionHead(title: string, kicker: string) {
  return `<div class="subsection-head"><p class="kicker">${esc(kicker)}</p><h3>${esc(title)}</h3></div>`;
}

function addressSection(address: Address) {
  return `<section class="page section-page"><div class="section-head"><p class="kicker">OBJEKTINFORMATIONEN</p><h2>Objektadresse</h2></div><div class="address-card">${addressLines(address).map((line, index) => `<p class="${index === 0 ? "address-primary" : ""}">${esc(line)}</p>`).join("")}</div></section>`;
}

function efficiencyClass(value?: string) {
  if (!value) return "";
  const classes = ["A+", "A", "B", "C", "D", "E", "F", "G", "H"];
  return `<div class="efficiency"><div class="efficiency-scale">${classes.map((item) => `<span class="eff-${item.replace("+", "plus")} ${item === value ? "active" : ""}">${item}</span>`).join("")}</div><b>Effizienzklasse ${esc(value)}</b></div>`;
}

async function galleryPages(sections: NonNullable<StructuredExposeContent["imageSections"]>, assets: Map<string, Asset>) {
  const refs = sections.filter((section) => section.category !== "floor_plan").flatMap((section) => section.images.map((image) => ({ ...image, section: section.label })));
  const resolved = (await Promise.all(refs.map(async (ref) => ({ ref, image: await resolveReference(ref, assets) })))).filter((item): item is { ref: typeof refs[number]; image: NonNullable<Awaited<ReturnType<typeof resolveReference>>> } => Boolean(item.image));
  const pages: string[] = [];
  for (let index = 0; index < resolved.length; index += 2) {
    const pair = resolved.slice(index, index + 2);
    pages.push(`<section class="page gallery-page"><div class="section-head gallery-heading"><p class="kicker">OBJEKTBILDER</p><h2>Objektbilder</h2><span>${String(pages.length + 1).padStart(2, "0")}</span></div><div class="photo-stack">${pair.map(({ image }) => `<figure class="photo"><img src="${image.src}" alt="${esc(image.caption)}"/><figcaption>${esc(image.caption)}</figcaption></figure>`).join("")}</div></section>`);
  }
  return pages;
}

async function planPages(title: string, refs: StructuredExposeImageReference[], assets: Map<string, Asset>, kind: "plan" | "map") {
  const resolved = (await Promise.all(refs.map(async (ref) => ({ ref, image: await resolveReference(ref, assets) })))).filter((item): item is { ref: typeof refs[number]; image: NonNullable<Awaited<ReturnType<typeof resolveReference>>> } => Boolean(item.image));
  return resolved.map(({ image }) => `<section class="page plan-page"><div class="section-head"><p class="kicker">${kind === "map" ? "LAGE" : "GRUNDRISSE"}</p><h2>${esc(title)}</h2></div><figure class="plan"><img src="${image.src}" alt="${esc(image.caption)}"/><figcaption>${esc(image.caption)}</figcaption></figure></section>`);
}

function locationDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

function locationPage(location: NonNullable<StructuredExposeContent["location"]>) {
  const intelligence = location.intelligence;
  if (!intelligence) return "";
  const groups: Array<[string, keyof typeof intelligence.facilities]> = [["Einkaufsmöglichkeiten", "shopping"], ["Bildung", "education"], ["ÖPNV", "transport"], ["Gesundheit", "healthcare"], ["Freizeit", "recreation"], ["Alltag", "dailyLife"]];
  const facilities = groups.flatMap(([label, key]) => {
    const place = intelligence.facilities[key][0];
    return place ? [`<div class="location-row"><span>${esc(label)}</span><strong>${esc(place.name)}</strong><b>${esc(locationDistance(place.distanceMeters))}</b></div>`] : [];
  }).join("");
  const map = intelligence.mapAsset?.url ? `<img class="location-map" src="${esc(intelligence.mapAsset.url)}" alt="${esc(intelligence.mapAsset.caption)}"/>` : `<div class="location-map location-map-empty">Keine Kartenansicht verfügbar.</div>`;
  return `<section class="page location-page"><div class="section-head"><p class="kicker">LAGE &amp; UMGEBUNG</p><h2>Lage</h2></div><div class="location-map-wrap">${map}</div><div class="location-summary"><h3>Umgebung auf einen Blick</h3><p>${esc(intelligence.summary)}</p></div><div class="location-list">${facilities || `<p class="location-empty">Keine relevanten Einrichtungen in der ausgewählten Umgebung gefunden.</p>`}</div><p class="location-source">Entfernungen sind Luftlinien und keine Wegstrecken.</p></section>`;
}

function closingPage(content: StructuredExposeContent["vistaSection"]) {
  return `<section class="page vista-page"><div class="vista-mark">V</div><p class="kicker">${esc(content.subtitle)}</p><h2>${esc(content.heading)}</h2><div class="prose"><p>${esc(content.description)}</p></div><ol class="process">${content.steps.slice(0, 5).map((step, index) => `<li><b>0${index + 1}</b><span>${esc(step)}</span></li>`).join("")}</ol><div class="contact-line">${[content.website, content.email, content.phone].filter(Boolean).map((item) => esc(item)).join(" · ")}</div></section>`;
}

function heroCandidates(property: Property, content: StructuredExposeContent) {
  const assets = [...property.images, ...(property.exposeData?.images || [])];
  const unique = new Map<string, Asset>();
  for (const asset of assets) {
    const assetId = ("assetId" in asset ? asset.assetId : undefined) || asset.id;
    if (assetId) unique.set(assetId, asset);
  }
  const ordered = [...unique.values()].filter((asset) => asset.category !== "floor_plan" && asset.category !== "document");
  const priority = (asset: Asset) => {
    if (asset.isHeroCandidate || ("isCover" in asset && asset.isCover)) return 0;
    if (asset.category === "exterior" && ["front", "entrance", "garden", "terrace"].some((item) => clean(asset.subcategory).toLowerCase().includes(item))) return 1;
    if (asset.category === "exterior") return 2;
    if (asset.category === "interior" && clean(asset.subcategory).toLowerCase().includes("living")) return 3;
    if (asset.category === "interior") return 4;
    return 5;
  };
  const references = content.cover.heroImage ? [content.cover.heroImage] : [];
  return [...references, ...ordered.sort((a, b) => priority(a) - priority(b)).flatMap((asset) => {
    const assetId = ("assetId" in asset ? asset.assetId : undefined) || asset.id;
    return assetId ? [{ assetId, caption: imageCaption(asset) }] : [];
  })];
}

function legacyContent(property: Property, content: ExposeContent): StructuredExposeContent {
  const source = property.exposeData;
  const address: Address = property.exposeData?.basicInformation.address || { street: property.address, houseNumber: null, postalCode: property.zipCode, city: property.city, district: property.district, country: "Deutschland" };
  const images = property.images.filter((image) => image.category === "exterior" || image.category === "interior" || !image.category).map((image) => ({ assetId: image.assetId || image.id, caption: imageCaption(image) }));
  const facts = [...(content.factualSnapshot || []).map((item) => { const [value, ...labelParts] = item.split(" "); return { label: labelParts.join(" ") || "Angabe", value }; }), ...(property.livingArea ? [{ label: "Wohnfläche", value: `ca. ${property.livingArea} m²` }] : []), ...(content.factualSnapshot.length || property.livingArea ? [] : [{ label: "Objektart", value: property.propertyType }])];
  const structuredFacts = source ? [
    { label: "Objektart", value: source.basicInformation.propertyType === "house" ? "Haus" : source.basicInformation.propertyType },
    source.basicInformation.propertySubtype ? { label: "Objekttyp", value: source.basicInformation.propertySubtype } : null,
    source.propertyDetails.livingArea != null ? { label: "Wohnfläche", value: `ca. ${source.propertyDetails.livingArea} m²` } : null,
    source.propertyDetails.plotArea != null ? { label: "Grundstücksfläche", value: `${source.propertyDetails.plotArea} m²` } : null,
    source.propertyDetails.rooms != null ? { label: "Zimmer", value: String(source.propertyDetails.rooms) } : null,
    source.propertyDetails.bathrooms != null ? { label: "Badezimmer", value: String(source.propertyDetails.bathrooms) } : null,
    source.propertyDetails.garageCount != null ? { label: "Anzahl Garagen", value: String(source.propertyDetails.garageCount) } : null,
    source.propertyDetails.parkingSpaceCount != null ? { label: "Anzahl Stellplätze", value: String(source.propertyDetails.parkingSpaceCount) } : null,
    source.propertyDetails.yearBuilt || source.propertyDetails.completionYear ? { label: "Baujahr/Fertigstellung", value: `ca. ${source.propertyDetails.yearBuilt || source.propertyDetails.completionYear}` } : null,
    source.energy?.primaryEnergySource ? { label: "Hauptenergieträger", value: source.energy.primaryEnergySource === "oil" ? "Öl" : source.energy.primaryEnergySource } : null,
    source.pricing.purchasePrice != null ? { label: "Kaufpreis", value: money(source.pricing.purchasePrice) } : null,
    source.pricing.buyerCommission ? { label: "Käuferprovision", value: source.pricing.buyerCommission } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item)) : facts;
  const energyFacts = source?.energy ? [
    source.energy.certificateType ? { label: "Energieausweis", value: source.energy.certificateType === "needs_based" ? "bedarfsorientiert" : source.energy.certificateType === "consumption_based" ? "verbrauchsorientiert" : source.energy.certificateType } : null,
    source.energy.yearOfConstruction ? { label: "Bj. lt. Energieausweis", value: String(source.energy.yearOfConstruction) } : null,
    source.energy.finalEnergyDemand != null ? { label: "Endenergiebedarf", value: `${source.energy.finalEnergyDemand.toFixed(2).replace(".", ",")} kWh/(m²·a)` } : null,
    source.energy.finalEnergyConsumption != null ? { label: "Endenergieverbrauch", value: `${source.energy.finalEnergyConsumption.toFixed(2).replace(".", ",")} kWh/(m²·a)` } : null,
    source.energy.efficiencyClass ? { label: "Energieeffizienzklasse", value: source.energy.efficiencyClass } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item)) : undefined;
  const sourceImages = source?.images.filter((image) => image.category === "exterior" || image.category === "interior").map((image) => ({ assetId: image.assetId, caption: imageCaption(image) })) || images;
  const planImages = source?.floorPlans.map((image) => ({ assetId: image.assetId, caption: imageCaption(image) })) || [];
  const mapImages = source?.maps.map((image) => ({ assetId: image.assetId, caption: imageCaption(image) })) || [];
  return {
    version: 2,
    cover: { title: source?.basicInformation.title || content.title, location: [address.city, address.district].filter(Boolean).join(" · "), purchasePrice: money(source?.pricing.purchasePrice ?? (property.transactionType === "sale" ? property.askingPrice : property.coldRent)), livingArea: source?.propertyDetails.livingArea ? `ca. ${source.propertyDetails.livingArea} m²` : property.livingArea ? `ca. ${property.livingArea} m²` : undefined, rooms: source?.propertyDetails.rooms ? String(source.propertyDetails.rooms) : property.rooms ? String(property.rooms) : undefined, heroImage: sourceImages[0] || images[0] },
    overview: { facts: structuredFacts, ...(energyFacts?.length ? { energy: { facts: energyFacts } } : {}) },
    objectInformation: { address },
    propertyDescription: { paragraphs: [{ heading: "Objektbeschreibung", text: content.mainDescription }] },
    roomProgram: content.roomDescriptions.map((room) => ({ roomId: room.roomId, name: room.name, description: room.description })),
    equipment: source?.equipment.length ? { facts: source.equipment.map((item) => ({ label: item.name, value: item.description || "vorhanden" })) } : content.highlights.length ? { facts: content.highlights.map((item) => ({ label: "Highlight", value: item })) } : undefined,
    location: source?.location.description || content.locationDescription ? { description: source?.location.description || content.locationDescription, district: source?.location.district || undefined, neighborhood: source?.location.neighborhood || undefined, ...(source?.location.intelligence ? { intelligence: source.location.intelligence } : {}) } : undefined,
    imageSections: sourceImages.length ? [{ category: "interior", label: "Objektbilder", images: sourceImages }] : undefined,
    planSections: planImages.length ? [{ title: "Grundrisse", images: planImages }] : undefined,
    mapSections: mapImages.length ? [{ title: "Lageplan / Makrolage", images: mapImages }] : undefined,
    agentSection: source?.agent,
    vistaSection: { heading: "5 Schritte zur Wunschimmobilie", subtitle: source?.systemBranding.companyName || "Vista", description: source?.systemBranding.description || content.targetAudience || "Vista begleitet Sie auf dem Weg zu Ihrer Wunschimmobilie.", steps: source?.systemBranding.processSteps?.length ? source.systemBranding.processSteps : ["Exposé", "Interesse", "Finanzierung", "Besichtigung", "Kaufabschluss"], website: source?.systemBranding.website || undefined, email: source?.systemBranding.email || undefined, phone: source?.systemBranding.phone || undefined },
  };
}

export async function exposeHTML(property: Property, rawContent: RenderContent) {
  const content = isStructuredContent(rawContent) ? rawContent : legacyContent(property, rawContent);
  const parsed = structuredExposeContentSchema.safeParse(content);
  if (!parsed.success) throw new Error("Invalid expose content cannot be rendered");
  const data = parsed.data as StructuredExposeContent;
  const assets = allAssets(property);
  const hero = (await Promise.all(heroCandidates(property, data).map((reference) => resolveReference(reference, assets)))).find(Boolean) || null;
  const sections: string[] = [];
  sections.push(`<section class="page cover"><div class="cover-hero" ${hero ? `style="background-image:url('${hero.src}')"` : ""}><span class="cover-brand">VISTA</span></div><div class="cover-copy"><p class="kicker">IMMOBILIEN-EXPOSÉ</p><h1>${esc(data.cover.title)}</h1><p class="cover-location">${esc(data.cover.location || "")}</p><div class="cover-facts">${[["Kaufpreis", data.cover.purchasePrice], ["Wohnfläche", data.cover.livingArea], ["Zimmer", data.cover.rooms]].filter(([, value]) => value).map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div></div></section>`);
  sections.push(`<section class="page overview-page"><div class="section-head"><p class="kicker">01</p><h2>Auf einen Blick</h2></div>${factGrid(data.overview.facts)}${data.overview.energy ? `<div class="energy"><h3>Energieangaben</h3>${factGrid(data.overview.energy.facts)}${efficiencyClass(data.overview.energy.facts.find((fact) => fact.label.toLowerCase().includes("effizienzklasse"))?.value)}</div>` : ""}${data.objectInformation ? `<div class="overview-address">${subsectionHead("Objektadresse", "OBJEKTINFORMATIONEN")}<div class="address-card">${addressLines(data.objectInformation.address).map((line, index) => `<p class="${index === 0 ? "address-primary" : ""}">${esc(line)}</p>`).join("")}</div></div>` : ""}</section>`);
  if (data.propertyDescription || data.roomProgram?.length) sections.push(`<section class="page section-page content-page"><div class="section-head"><p class="kicker">OBJEKTINFORMATIONEN</p><h2>Objektbeschreibung</h2></div>${data.propertyDescription ? data.propertyDescription.paragraphs.map((paragraph) => `<article class="copy-block"><h3>${esc(paragraph.heading)}</h3>${paragraphs(paragraph.text).map((item) => `<p>${esc(item)}</p>`).join("")}</article>`).join("") : ""}${data.roomProgram?.length ? `${subsectionHead("Räume und Aufteilung", "RAUMPROGRAMM")}<div class="room-list">${data.roomProgram.map((room) => `<article><div><h3>${esc(room.name)}</h3>${room.area ? `<span>${esc(room.area)}</span>` : ""}</div><p>${esc(room.description)}</p></article>`).join("")}</div>` : ""}</section>`);
  if (data.equipment || data.location) sections.push(`<section class="page section-page content-page"><div class="section-head"><p class="kicker">AUSSTATTUNG UND LAGE</p><h2>Details zum Objekt</h2></div>${data.equipment ? `${subsectionHead("Ausstattung im Überblick", "AUSSTATTUNG")}${factGrid(data.equipment.facts)}${data.equipment.description ? `<div class="prose compact">${paragraphs(data.equipment.description).map((item) => `<p>${esc(item)}</p>`).join("")}</div>` : ""}` : ""}${data.location ? `${subsectionHead("Lage", "LAGE")}${[data.location.district, data.location.neighborhood].filter(Boolean).length ? `<p class="location-meta">${esc([data.location.district, data.location.neighborhood].filter(Boolean).join(" · "))}</p>` : ""}<div class="prose">${paragraphs(data.location.description).map((item) => `<p>${esc(item)}</p>`).join("")}</div>` : ""}</section>`);
  if (data.location?.intelligence) sections.push(locationPage(data.location));
  if (data.otherInformation) sections.push(factSection("Sonstige Angaben", data.otherInformation.items));
  if (data.additionalInformation) sections.push(factSection("Zusatzinformationen", data.additionalInformation.items));
  sections.push(...await galleryPages(data.imageSections || [], assets));
  for (const plan of data.planSections || []) sections.push(...await planPages(plan.title, plan.images, assets, "plan"));
  for (const map of data.mapSections || []) sections.push(...await planPages(map.title, map.images, assets, "map"));
  if (data.agentSection) {
    const agent = data.agentSection;
    sections.push(`<section class="page contact-page"><div class="section-head"><p class="kicker">KONTAKT</p><h2>Ihr Ansprechpartner</h2></div><div class="contact-card">${agent.name ? `<h3>${esc(agent.name)}</h3>` : ""}${agent.company ? `<p>${esc(agent.company)}</p>` : ""}${addressLines(agent.address).map((line) => `<p>${esc(line)}</p>`).join("")}${[agent.phone, agent.email, agent.website].filter(Boolean).map((line) => `<p>${esc(line)}</p>`).join("")}</div></section>`);
  }
  sections.push(closingPage(data.vistaSection));
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(data.cover.title)}</title><style>${printCSS()}.location-map-wrap{height:112mm;overflow:hidden;border:1px solid #d7ddd7;background:#e7eee8}.location-map{display:block;width:100%;height:100%;object-fit:cover}.location-summary{margin:9mm 0 5mm;padding:6mm 7mm;background:#eaf0ea}.location-summary h3{margin:0 0 3mm;font:400 19px Georgia,serif}.location-summary p{margin:0;color:#526057;font-size:12px;line-height:1.55}.location-list{border-top:1px solid #d7ddd7}.location-row{display:grid;grid-template-columns:34mm 1fr auto;gap:4mm;align-items:center;border-bottom:1px solid #d7ddd7;padding:4mm 0;font-size:11px}.location-row span{color:#718078}.location-row strong{font-weight:600}.location-row b{font-size:13px;color:#26352b}.location-source,.location-empty{color:#89958b;font-size:9px}.location-map-empty{display:grid;place-items:center;color:#89958b}</style></head><body><main class="expose">${sections.join("")}</main></body></html>`;
}

export function printCSS() {
  return `@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#dfe5df;color:#26302a;font-family:Arial,Helvetica,sans-serif}.expose{width:210mm;margin:0 auto;background:#f8f8f4;counter-reset:page}.page{width:210mm;min-height:297mm;padding:19mm 18mm 20mm;position:relative;break-after:page;overflow:hidden;background:#f8f8f4;counter-increment:page}.page:after{content:counter(page,decimal-leading-zero);position:absolute;right:18mm;bottom:9mm;color:#89958b;font-size:9px;letter-spacing:1px}.cover{padding:0;background:#24352c;color:#f8f8f4;display:flex;flex-direction:column}.cover:after{display:none}.cover-hero{height:177mm;background:#68796e center/cover no-repeat;position:relative}.cover-hero:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(22,39,29,.15),rgba(22,39,29,.45))}.cover-brand{position:absolute;top:15mm;left:18mm;color:#fff;letter-spacing:5px;font-size:12px;font-weight:700}.cover-copy{padding:12mm 18mm 16mm;flex:1;position:relative}.kicker{margin:0 0 7mm;color:#718775;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase}.cover .kicker{color:#b7c9ba}.cover h1{font:400 35px/1.08 Georgia,serif;max-width:155mm;margin:0 0 5mm}.cover-location{font-size:14px;color:#d7e1d8}.cover-facts{display:flex;gap:18mm;position:absolute;bottom:16mm;left:18mm;right:18mm;border-top:1px solid rgba(255,255,255,.28);padding-top:6mm}.cover-facts div{display:flex;flex-direction:column;gap:2mm}.cover-facts span{color:#b7c9ba;font-size:9px;text-transform:uppercase;letter-spacing:1px}.cover-facts strong{font:400 18px Georgia,serif}.section-head{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid #d7ddd7;padding-bottom:7mm;margin-bottom:11mm}.section-head h2{font:400 31px/1.08 Georgia,serif;margin:0;color:#26352b}.section-head .kicker{margin:0}.overview-page .section-head{margin-bottom:13mm}.fact-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid #d7ddd7}.fact{min-height:24mm;padding:6mm 5mm 5mm 0;border-bottom:1px solid #d7ddd7}.fact:nth-child(even){padding-left:8mm;border-left:1px solid #d7ddd7}.fact span{display:block;color:#7a887d;font-size:9px;letter-spacing:1px;text-transform:uppercase;margin-bottom:3mm}.fact strong{font-size:15px;font-weight:500;line-height:1.25}.energy{margin-top:15mm;padding-top:10mm;border-top:1px solid #d7ddd7}.energy h3{font:400 22px Georgia,serif;margin:0 0 7mm}.energy .fact-grid{border-top:0}.energy .fact{min-height:19mm}.efficiency{margin-top:8mm}.efficiency-scale{display:flex;align-items:stretch;gap:1mm}.efficiency-scale span{padding:3mm 2.5mm;color:#fff;font-size:10px;font-weight:700;background:#8ba291}.efficiency-scale .eff-Aplus{background:#3c9b62}.efficiency-scale .eff-A{background:#65ac56}.efficiency-scale .eff-B{background:#a9c348}.efficiency-scale .eff-C{background:#d7d04d}.efficiency-scale .eff-D{background:#e8b34d}.efficiency-scale .eff-E{background:#e28e45}.efficiency-scale .eff-F{background:#d76d46}.efficiency-scale .eff-G,.efficiency-scale .eff-H{background:#be564b}.efficiency-scale .active{outline:3px solid #26352b;outline-offset:2px;transform:translateY(-2px)}.efficiency b{display:block;margin-top:5mm;font-size:11px}.overview-address{margin-top:12mm;padding-top:8mm;border-top:1px solid #d7ddd7}.subsection-head{margin:8mm 0 5mm}.subsection-head .kicker{margin-bottom:2mm}.subsection-head h3{font:400 22px Georgia,serif;margin:0;color:#26352b}.address-card{padding:7mm;background:#e9efe9;border-left:4px solid #7e9882}.address-card p{margin:0 0 2mm;font-size:14px}.address-card p:last-child{margin-bottom:0}.address-card .address-primary{font:400 22px Georgia,serif;margin-bottom:3mm}.prose{max-width:166mm;font-size:13px;line-height:1.7;color:#556258}.prose p{margin:0 0 6mm}.prose.compact{margin-top:8mm}.copy-block{max-width:168mm;margin-bottom:7mm;break-inside:avoid}.copy-block h3,.room-list h3{font:400 18px Georgia,serif;color:#3f6049;margin:0 0 3mm}.copy-block p{font-size:13px;line-height:1.55;color:#556258;margin:0}.room-list{display:grid;grid-template-columns:1fr 1fr;gap:0 12mm}.room-list article{padding:5mm 0;border-top:1px solid #d7ddd7;break-inside:avoid}.room-list article:nth-child(-n+2){border-top:0;padding-top:0}.room-list article>div{display:flex;justify-content:space-between;gap:5mm}.room-list span{color:#829087;font-size:11px}.room-list p{color:#59675d;font-size:11px;line-height:1.55;margin:2mm 0 0}.gallery-page{padding-bottom:15mm}.gallery-heading span{color:#718775;font:400 18px Georgia,serif}.photo-stack{display:grid;grid-template-rows:1fr 1fr;gap:9mm;height:235mm}.photo{margin:0;min-height:0;display:flex;flex-direction:column;break-inside:avoid}.photo img{display:block;width:100%;height:calc(100% - 10mm);object-fit:contain;background:#e9eee9}.photo figcaption,.plan figcaption{padding-top:3mm;color:#617267;font-size:10px;letter-spacing:.5px}.plan{min-height:235mm;height:auto;margin:0;display:flex;flex-direction:column;align-items:center;break-inside:avoid}.plan img{display:block;width:100%;height:auto;max-height:220mm;object-fit:contain;background:#eef1ed}.contact-card{max-width:110mm;padding:11mm;background:#e9efe9;border-top:4px solid #7e9882}.contact-card h3{font:400 25px Georgia,serif;margin:0 0 4mm}.contact-card p{margin:2mm 0;color:#59675d;font-size:13px}.vista-page{background:#24352c;color:#f8f8f4;padding-top:35mm}.vista-page:after{color:#b7c9ba}.vista-page .kicker{color:#b7c9ba}.vista-page h2{max-width:150mm;font:400 37px/1.08 Georgia,serif;margin:0 0 10mm}.vista-page .prose{color:#d7e1d8;max-width:135mm}.vista-mark{width:18mm;height:18mm;border:1px solid #b7c9ba;display:grid;place-items:center;color:#b7c9ba;font:400 24px Georgia,serif;margin-bottom:25mm}.process{list-style:none;padding:0;margin:17mm 0 0;max-width:150mm}.process li{display:flex;gap:8mm;align-items:baseline;border-top:1px solid rgba(255,255,255,.25);padding:5mm 0;color:#d7e1d8}.process b{color:#b7c9ba;font-size:11px;letter-spacing:1px}.process span{font-size:13px}.contact-line{position:absolute;left:18mm;bottom:17mm;color:#b7c9ba;font-size:10px;word-break:break-word}@media print{body{background:#fff}.expose{margin:0}.page{break-after:page}.page:last-child{break-after:auto}}`;
}
