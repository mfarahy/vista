"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  LoaderCircle,
  Sparkles,
  X,
} from "lucide-react";
import { MapContainer, TileLayer, ImageOverlay, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { apiAssetUrl, apiFetch } from "@/lib/api";

const PROPERTY_TYPES = [
  ["apartment", "Apartment"],
  ["house", "House"],
  ["villa", "Villa"],
  ["penthouse", "Penthouse"],
  ["semi-detached", "Semi-detached house"],
  ["terraced", "Terraced house"],
  ["other", "Other"],
] as const;

const FEATURE_OPTIONS = [
  ["balcony", "Balcony"],
  ["terrace", "Terrace"],
  ["garden", "Garden"],
  ["garage", "Garage"],
  ["parking", "Parking space"],
  ["elevator", "Elevator"],
  ["basement", "Basement"],
  ["attic", "Attic"],
  ["fitted-kitchen", "Fitted kitchen"],
  ["underfloor-heating", "Underfloor heating"],
  ["air-conditioning", "Air conditioning"],
  ["guest-toilet", "Guest toilet"],
  ["accessible", "Accessible"],
  ["storage", "Storage room"],
  ["wardrobes", "Built-in wardrobes"],
  ["smart-home", "Smart home"],
  ["energy-efficient", "Energy efficient"],
] as const;

type Property = {
  id: string;
  propertyType: string;
  transactionType: "sale" | "rent";
  constructionYear?: number | null;
  address?: string | null;
  zipCode?: string | null;
  city?: string | null;
  district?: string | null;
  livingArea?: number | null;
  plotArea?: number | null;
  rooms?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floor?: string | null;
  totalFloors?: number | null;
  availableFrom?: string | null;
  condition?: string | null;
  askingPrice?: number | null;
  additionalCosts?: number | null;
  commission?: string | null;
  hausgeld?: number | null;
  coldRent?: number | null;
  deposit?: number | null;
  selectedFeatures: string[];
  additionalFeatures?: string | null;
  surroundings: Record<string, string>;
  locationNote?: string | null;
  sellerDescription?: string | null;
  specialNotes?: string | null;
  targetAudience?: string | null;
  tone: "professional" | "premium" | "modern" | "warm" | "neutral";
  language: "de" | "en";
  images: Array<{ id: string; url: string; fileName: string; mimeType: string; size: number; sequence: number; isCover: boolean; room?: string | null }>; 
  roomsData: Array<{ id?: string; name: string; type: string; size?: number | null; floor?: string | null; description?: string | null; sequence: number }>;
  expose?: { id: string; propertyId: string; template: "modern"; content: ExposeContent | null; pdfUrl?: string | null; generatedAt?: string | null } | null;
  createdAt?: string;
  updatedAt?: string;
  exposeData?: ExposeData;
};

type EnergyData = {
  certificateType?: "needs_based" | "consumption_based" | "not_available" | "unknown" | null;
  yearOfConstruction?: number | null;
  primaryEnergySource?: "gas" | "oil" | "district_heating" | "heat_pump" | "electricity" | "wood" | "pellets" | "other" | null;
  finalEnergyDemand?: number | null;
  finalEnergyConsumption?: number | null;
  efficiencyClass?: "A+" | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | null;
};
type StructuredAddress = {
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  country?: string;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};
type ExposeData = {
  basicInformation: { propertyType: string; propertySubtype?: string | null; title?: string | null; address: StructuredAddress };
  pricing: { purchasePrice?: number | null; rentPrice?: number | null; additionalCosts?: number | null; buyerCommission?: string | null; sellerCommission?: string | null };
  propertyDetails: { livingArea?: number | null; plotArea?: number | null; rooms?: number | null; bathrooms?: number | null; yearBuilt?: number | null; completionYear?: number | null; floor?: string | null; numberOfFloors?: number | null; garageCount?: number | null; parkingSpaceCount?: number | null };
  energy?: EnergyData | null;
  rooms: Array<{ id?: string; type: string; name: string; area?: number | null; description?: string | null; features: string[]; floor?: string | null; order?: number }>;
  equipment: Array<{ category: string; name: string; description?: string | null }>;
  outdoorAreas: Array<{ type: string; area?: number | null; orientation?: string | null; description?: string | null }>;
  location: { address: ExposeData["basicInformation"]["address"]; latitude?: number | null; longitude?: number | null; district?: string | null; neighborhood?: string | null; description?: string | null };
  images: Array<Record<string, unknown>>;
  floorPlans: Array<Record<string, unknown>>;
  maps: Array<Record<string, unknown>>;
  additionalInformation: Record<string, string | null | undefined>;
  agent?: { name?: string | null; company?: string | null; address?: ExposeData["basicInformation"]["address"]; phone?: string | null; email?: string | null; website?: string | null; photo?: string | null; logo?: string | null };
  systemBranding: { companyName: string; logo?: string | null; website?: string | null; email?: string | null; phone?: string | null; description?: string | null; processSteps: string[] };
};

type ExposeContent = {
  title: string;
  portalTitle: string;
  shortDescription: string;
  mainDescription: string;
  highlights: string[];
  roomDescriptions: Array<{ roomId: string; name: string; description: string }>;
  locationDescription: string;
  targetAudience: string;
  factualSnapshot: string[];
};

type PropertyPayload = Omit<Property, "id" | "images" | "expose" | "roomsData" | "createdAt" | "updatedAt"> & {
  roomsData: Array<Omit<NonNullable<Property["roomsData"]>[number], "id">>;
};

const steps = ["Property Address", "Objekt", "Preis & Eckdaten", "Ausstattung", "Räume", "Energie", "Bilder", "Pläne & Dokumente", "Makler / Kontakt", "Vorschau"];

const emptyExposeData = (property: Property): ExposeData => ({
  basicInformation: { propertyType: property.propertyType, propertySubtype: null, title: null, address: { street: property.address, houseNumber: null, postalCode: property.zipCode, city: property.city, district: property.district, country: "Deutschland" } },
  pricing: { purchasePrice: property.transactionType === "sale" ? property.askingPrice : null, rentPrice: property.transactionType === "rent" ? property.coldRent ?? property.askingPrice : null, additionalCosts: property.additionalCosts, buyerCommission: property.commission, sellerCommission: null },
  propertyDetails: { livingArea: property.livingArea, plotArea: property.plotArea, rooms: property.rooms, bathrooms: property.bathrooms, yearBuilt: property.constructionYear, completionYear: null, floor: property.floor, numberOfFloors: property.totalFloors, garageCount: null, parkingSpaceCount: null },
  energy: null, rooms: [], equipment: [], outdoorAreas: [], location: { address: { street: property.address, houseNumber: null, postalCode: property.zipCode, city: property.city, district: property.district, country: "Deutschland" }, district: property.district, latitude: null, longitude: null, neighborhood: null, description: property.locationNote }, images: [], floorPlans: [], maps: [], additionalInformation: { additionalInformation: null, legalNotes: null, sellerNotes: property.specialNotes, commissionNotes: null, availability: property.availableFrom }, systemBranding: { companyName: "Vista", processSteps: [] }, agent: undefined,
});

const demoDefaults: Partial<PropertyPayload> = {
  constructionYear: 2018,
  address: "Lychener Straße 18",
  zipCode: "10437",
  city: "Berlin",
  district: "Prenzlauer Berg",
  livingArea: 86,
  rooms: 3,
  bathrooms: 1,
  floor: "3. OG",
  totalFloors: 5,
  availableFrom: "01.10.2026",
  condition: "good",
  askingPrice: 645000,
  additionalCosts: 19350,
  hausgeld: 385,
  selectedFeatures: ["balcony", "elevator", "fitted-kitchen", "underfloor-heating", "basement"],
  additionalFeatures: "Oak flooring and triple-glazed windows",
  surroundings: {
    transport: "U2 and several tram lines are just a few minutes away",
    shopping: "Weekly market at Kollwitzplatz and everyday shops nearby",
  },
  roomsData: [{ name: "Living room", type: "Living", size: 31, floor: "3. OG", description: "Bright living area with balcony access and large windows.", sequence: 0 }, { name: "Kitchen", type: "Kitchen", size: 11, floor: "3. OG", description: "Open-plan fitted kitchen with generous work surfaces.", sequence: 1 }],
};

const initialPayload = (property: Property): PropertyPayload => {
  const { id: _id, images: _images, expose: _expose, createdAt: _createdAt, updatedAt: _updatedAt, ...payload } = property;
  const freshDraft = !property.address && !property.city && property.roomsData.length === 0 && property.selectedFeatures.length === 0;
  return {
    ...(freshDraft ? demoDefaults : {}),
    ...payload,
    roomsData: freshDraft ? (demoDefaults.roomsData ?? []) : property.roomsData.map(({ id: _roomId, ...room }) => room),
    exposeData: property.exposeData ?? emptyExposeData(property),
  };
};

const pretty = (value: string | number | null | undefined) => value === null || value === undefined || value === "" ? "Not provided" : String(value);
const money = (value?: number | null) => value ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value) : "Not provided";

export default function WizardClient({ initialProperty }: { initialProperty: Property }) {
  const router = useRouter();
  const [property, setProperty] = useState<PropertyPayload>(initialPayload(initialProperty));
  const [images, setImages] = useState(initialProperty.images);
  const [content, setContent] = useState<ExposeContent | null>(initialProperty.expose?.content ?? null);
  const [step, setStep] = useState(content ? 10 : 0);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState("");
  const [locationIntelligence, setLocationIntelligence] = useState<any>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<"exterior" | "interior" | "floor_plan" | "document">("exterior");
  const [uploadSubcategory, setUploadSubcategory] = useState("");
  const [uploadCaption, setUploadCaption] = useState("");
  const initialAddress = property.exposeData?.basicInformation.address ?? {};
  const [addressQuery, setAddressQuery] = useState(initialAddress.formattedAddress || [initialAddress.street, initialAddress.houseNumber, initialAddress.postalCode, initialAddress.city].filter(Boolean).join(", "));
  const [addressSuggestions, setAddressSuggestions] = useState<StructuredAddress[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [addressSelected, setAddressSelected] = useState(Boolean(initialAddress.houseNumber && initialAddress.postalCode && initialAddress.city));

  useEffect(() => {
    if (addressSelected || addressQuery.trim().length < 3) {
      setAddressSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAddressLoading(true);
      setAddressError("");
      try {
        const response = await apiFetch(`/api/address/suggestions?q=${encodeURIComponent(addressQuery.trim())}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Address lookup is currently unavailable.");
        setAddressSuggestions(await response.json());
      } catch (lookupError) {
        if (!controller.signal.aborted) setAddressError(lookupError instanceof Error ? lookupError.message : "Address lookup failed.");
      } finally {
        if (!controller.signal.aborted) setAddressLoading(false);
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [addressQuery, addressSelected]);

  function selectAddress(address: StructuredAddress) {
    const nextAddress = { ...address, country: address.country || "Deutschland" };
    setAddressQuery([ [address.street, address.houseNumber].filter(Boolean).join(" "), [address.postalCode, address.city].filter(Boolean).join(" ") ].filter(Boolean).join(", "));
    setAddressSuggestions([]);
    setAddressSelected(true);
    setProperty((current) => ({
      ...current,
      address: [address.street, address.houseNumber].filter(Boolean).join(" "),
      zipCode: address.postalCode,
      city: address.city,
      district: address.district,
      exposeData: { ...current.exposeData!, basicInformation: { ...current.exposeData!.basicInformation, address: nextAddress }, location: { ...current.exposeData!.location, address: nextAddress, district: address.district, latitude: address.latitude, longitude: address.longitude } },
    }));
  }

  function set<K extends keyof PropertyPayload>(key: K, value: PropertyPayload[K]) {
    setProperty((current) => {
      const next = { ...current, [key]: value } as PropertyPayload;
      const data = next.exposeData ?? emptyExposeData(initialProperty);
      if (key === "address" || key === "zipCode" || key === "city" || key === "district") {
        data.basicInformation = { ...data.basicInformation, address: { ...data.basicInformation.address, street: key === "address" ? String(value ?? "") : next.address, postalCode: key === "zipCode" ? String(value ?? "") : next.zipCode, city: key === "city" ? String(value ?? "") : next.city, district: key === "district" ? String(value ?? "") : next.district } };
        data.location = { ...data.location, address: data.basicInformation.address, district: data.basicInformation.address.district };
      }
      if (["livingArea", "plotArea", "rooms", "bathrooms", "constructionYear", "floor", "totalFloors"].includes(String(key))) {
        data.propertyDetails = { ...data.propertyDetails, livingArea: key === "livingArea" ? value as number | null : next.livingArea, plotArea: key === "plotArea" ? value as number | null : next.plotArea, rooms: key === "rooms" ? value as number | null : next.rooms, bathrooms: key === "bathrooms" ? value as number | null : next.bathrooms, yearBuilt: key === "constructionYear" ? value as number | null : next.constructionYear, floor: key === "floor" ? value as string : next.floor, numberOfFloors: key === "totalFloors" ? value as number | null : next.totalFloors };
      }
      if (["askingPrice", "coldRent", "additionalCosts", "commission"].includes(String(key))) {
        data.pricing = { ...data.pricing, purchasePrice: next.transactionType === "sale" ? (key === "askingPrice" ? value as number | null : next.askingPrice) : data.pricing.purchasePrice, rentPrice: next.transactionType === "rent" ? (key === "coldRent" ? value as number | null : next.coldRent ?? next.askingPrice) : data.pricing.rentPrice, additionalCosts: key === "additionalCosts" ? value as number | null : next.additionalCosts, buyerCommission: key === "commission" ? value as string : next.commission };
      }
      return { ...next, exposeData: data };
    });
  }
  function updateExposeData(patch: Partial<ExposeData>) {
    setProperty((current) => ({ ...current, exposeData: { ...current.exposeData!, ...patch } }));
  }

  async function save() {
    setSaving(true);
    setError("");
    const response = await apiFetch(`/api/properties/${initialProperty.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(property),
    });
    if (!response.ok) setError("The details could not be saved.");
    setSaving(false);
  }

  async function next() {
    if (step === 0 && !addressSelected) {
      setError("Please select an exact address from the suggestions before continuing.");
      return;
    }
    await save();
    setStep((current) => Math.min(current + 1, 9));
  }

  async function fetchLocationIntelligence() {
    setLocationLoading(true);
    setLocationError("");
    try {
      const response = await apiFetch(`/api/properties/${initialProperty.id}/location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: true }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch location intelligence");
      }
      const data = await response.json();
      setLocationIntelligence(data);
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "Failed to fetch location intelligence");
    } finally {
      setLocationLoading(false);
    }
  }

  async function generate(action = "") {
    await save();
    setAiLoading(true);
    setError("");
    const response = await apiFetch(`/api/properties/${initialProperty.id}/ai/improve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error || "The AI could not create the text.");
    else {
      setContent(result);
      setStep(10);
    }
    setAiLoading(false);
  }

  async function saveContent() {
    if (!content) return;
    setSaving(true);
    const response = await apiFetch(`/api/properties/${initialProperty.id}/expose`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });
    if (response.ok) router.push(`/preview/${initialProperty.id}`);
    else setError("The content could not be saved.");
    setSaving(false);
  }

  async function upload(files: FileList | null, categoryOverride = uploadCategory) {
    if (!files?.length) return;
    setError("");
    const body = new FormData();
    [...files].forEach((file) => body.append("files", file));
    body.append("category", categoryOverride);
    if (uploadSubcategory) body.append("subcategory", uploadSubcategory);
    if (uploadCaption) body.append("caption", uploadCaption);
    const response = await apiFetch(`/api/properties/${initialProperty.id}/images`, { method: "POST", body });
    const result = await response.json();
    if (!response.ok) setError(result.error);
    else setImages((current) => [...current, ...result]);
  }

  async function removeImage(id: string) {
    await apiFetch(`/api/properties/${initialProperty.id}/images/${id}`, { method: "DELETE" });
    setImages((current) => current.filter((image) => image.id !== id));
  }

  async function cover(id: string) {
    const response = await apiFetch(`/api/properties/${initialProperty.id}/images/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cover: true }),
    });
    if (response.ok) setImages(await response.json());
  }

  async function moveImage(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= images.length) return;
    const reordered = [...images];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setImages(reordered.map((image, sequence) => ({ ...image, sequence })));
    await apiFetch(`/api/properties/${initialProperty.id}/images/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageIds: reordered.map((image) => image.id) }),
    });
  }

  const canonicalRoomType = (type: string) => ({ Living: "living_room", Wohnen: "living_room", Kitchen: "kitchen", Kochen: "kitchen", Bedroom: "bedroom", Schlafen: "bedroom", Bathroom: "bathroom", Bad: "bathroom", Office: "office", Arbeiten: "office" } as Record<string, string>)[type] ?? "other";
  const syncRooms = (rooms: Property["roomsData"]) => updateExposeData({ rooms: rooms.map((room, order) => ({ id: room.id, type: canonicalRoomType(room.type), name: room.name || "Raum", area: room.size, description: room.description, features: [], floor: room.floor, order })) });
  const roomAdd = () => { const rooms = [...property.roomsData, { name: "Raum", type: "other", size: null, floor: "", description: "", sequence: property.roomsData.length }]; set("roomsData", rooms); syncRooms(rooms); };
  const roomUpdate = (index: number, patch: Partial<Omit<Property["roomsData"][number], "id">>) => { const rooms = property.roomsData.map((room, roomIndex) => roomIndex === index ? { ...room, ...patch } : room); set("roomsData", rooms); syncRooms(rooms); };
  const roomRemove = (index: number) => { const rooms = property.roomsData.filter((_, roomIndex) => roomIndex !== index).map((room, sequence) => ({ ...room, sequence })); set("roomsData", rooms); syncRooms(rooms); };

  return (
    <main className="min-h-screen bg-[#f4f6f3]">
      <header className="flex items-center justify-between border-b border-[#e0e5e0] bg-white px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#202522] font-serif text-white">R</span>
          <span className="hidden text-sm font-bold tracking-[.16em] sm:block">RAUMWERK</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-[#7a877e] sm:block">{saving ? "Saving…" : "Saved automatically"}</span>
          <span className="h-2 w-2 rounded-full bg-[#84a28b]" />
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
        <div className="mb-9 flex items-end justify-between">
          <div>
            <p className="text-xs font-bold tracking-[.18em] text-[#607b68]">NEW EXPOSÉ</p>
            <h1 className="serif mt-2 text-3xl sm:text-4xl">Your property, in focus.</h1>
          </div>
          <span className="text-sm text-[#7c887f]">{Math.min(step + 1, 10)} / 10</span>
        </div>
        <div className="mb-10 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
          <nav className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5 lg:mb-0 lg:block lg:space-y-2" aria-label="Wizard steps">
            {steps.map((name, index) => (
              <button key={name} onClick={() => index <= step && setStep(index)} disabled={index > step} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left text-xs font-bold transition ${index === step ? "border-[#202522] bg-[#202522] text-white" : index < step ? "border-[#c5d3c7] bg-[#edf3ee] text-[#48624f]" : "border-[#e0e5e0] bg-white text-[#aab4ac]"}`}>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[11px] ${index < step ? "border-[#78917d] bg-[#78917d] text-white" : index === step ? "border-white/30 bg-white/10 text-white" : "border-[#d7ded8] bg-white"}`}>
                    {index < step ? <Check size={14} /> : `0${index + 1}`}
                  </span>
                  <span className="min-w-0 leading-4">{name}</span>
              </button>
            ))}
          </nav>
          <div className="min-w-0">
            {error && <div className="mb-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button onClick={() => setError("")}><X size={16} /></button></div>}
            {step < 10 ? (
              <div className="step-enter">
                {step === 0 && <StepAddress query={addressQuery} suggestions={addressSuggestions} loading={addressLoading} lookupError={addressError} selected={addressSelected} onQueryChange={(value) => { setAddressQuery(value); setAddressSelected(false); }} onSelect={selectAddress} address={property.exposeData!.basicInformation.address} />}
                {step === 0 && addressSelected && <AddressDebugPanel propertyId={initialProperty.id} property={property} address={property.exposeData!.basicInformation.address} />}
                {step === 1 && <StepProperty property={property} set={set} exposeData={property.exposeData!} updateExposeData={updateExposeData} />}
                {step === 2 && <StepDetails property={property} set={set} />}
                {step === 3 && <StepFeatures property={property} set={set} exposeData={property.exposeData!} updateExposeData={updateExposeData} />}
                {step === 4 && <StepRooms rooms={property.roomsData} roomAdd={roomAdd} roomUpdate={roomUpdate} roomRemove={roomRemove} />}
                {step === 5 && <StepEnergy data={property.exposeData!.energy} update={(energy) => updateExposeData({ energy })} />}
                {step === 6 && <StepPhotos images={images} fileInput={fileInput} upload={upload} removeImage={removeImage} cover={cover} moveImage={moveImage} category={uploadCategory} subcategory={uploadSubcategory} caption={uploadCaption} setCategory={setUploadCategory} setSubcategory={setUploadSubcategory} setCaption={setUploadCaption} />}
                {step === 7 && <StepPhotos images={images} fileInput={fileInput} upload={(files) => upload(files, "floor_plan")} removeImage={removeImage} cover={cover} moveImage={moveImage} category="floor_plan" subcategory={uploadSubcategory} caption={uploadCaption} setCategory={() => setUploadCategory("floor_plan")} setSubcategory={setUploadSubcategory} setCaption={setUploadCaption} />}
                {step === 8 && <StepAgent data={property.exposeData!.agent} update={(agent) => updateExposeData({ agent })} />}
                {step === 9 && <Review property={property} images={images} onEdit={setStep} />}
              </div>
            ) : <ContentEditor content={content} setContent={setContent} onGenerate={generate} onPreview={saveContent} loading={aiLoading} saving={saving} />}
          </div>
        </div>
        <div className="mt-10 flex border-t border-[#e0e5e0] pt-5 lg:ml-[250px]">
          <button className="btn btn-ghost flex items-center gap-2" disabled={step === 0} onClick={() => setStep((current) => current - 1)}><ArrowLeft size={15} /> Back</button>
          {step < 9 ? (
            <button className="btn btn-primary flex items-center gap-2" onClick={next}>{saving ? "Saving…" : "Next"} <ArrowRight size={15} /></button>
          ) : step === 9 ? (
            <button className="btn btn-primary flex items-center gap-2" onClick={() => generate()} disabled={aiLoading}>{aiLoading ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />} Improve with AI</button>
          ) : (
            <button className="btn btn-primary flex items-center gap-2" onClick={saveContent} disabled={saving}><FileText size={15} /> Open preview <ArrowRight size={15} /></button>
          )}
        </div>
      </div>
    </main>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <div className="card bg-white p-5 sm:p-8"><h2 className="serif text-2xl sm:text-3xl">{title}</h2>{description && <p className="mt-2 text-sm leading-6 text-[#78847c]">{description}</p>}<div className="mt-8">{children}</div></div>;
}

function Input({ label, value, onChange, type = "text", placeholder }: { label: string; value: string | number | null | undefined; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label><span className="label">{label}</span><input className="field" type={type} value={value ?? ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string | undefined | null; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) {
  return <label><span className="label">{label}</span><select className="field" value={value ?? ""} onChange={(event) => onChange(event.target.value)}>{options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>;
}

function Textarea({ label, value, onChange, placeholder }: { label: string; value: string | null | undefined; onChange: (value: string) => void; placeholder?: string }) {
  return <label><span className="label">{label}</span><textarea className="field min-h-28 resize-y" value={value ?? ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function StepAddress({ query, suggestions, loading, lookupError, selected, onQueryChange, onSelect, address }: { query: string; suggestions: StructuredAddress[]; loading: boolean; lookupError: string; selected: boolean; onQueryChange: (value: string) => void; onSelect: (address: StructuredAddress) => void; address: StructuredAddress }) {
  return <Section title="Property Address" description="Start with the exact property address. Vista can use it as the foundation for location and property data."><div className="relative"><label><span className="label">Search address</span><input autoFocus className="field" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Start typing a street, house number or city" aria-autocomplete="list" aria-expanded={suggestions.length > 0} /></label>{loading && <div className="mt-3 flex items-center gap-2 text-sm text-[#718078]"><LoaderCircle size={15} className="animate-spin" /> Searching addresses…</div>}{lookupError && <p className="mt-3 text-sm text-red-700">{lookupError}</p>}{!loading && query.trim().length >= 3 && !suggestions.length && !selected && !lookupError && <p className="mt-3 text-sm text-[#718078]">No matching addresses found.</p>}{suggestions.length > 0 && <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-[#dce4dc] bg-white shadow-xl" role="listbox">{suggestions.map((suggestion, index) => <button type="button" role="option" key={`${suggestion.formattedAddress}-${index}`} onClick={() => onSelect(suggestion)} className="block w-full border-b border-[#edf1ed] px-4 py-3 text-left last:border-0 hover:bg-[#f1f6f1]"><span className="block text-sm font-bold text-[#33463a]">{[suggestion.street, suggestion.houseNumber].filter(Boolean).join(" ") || suggestion.formattedAddress}</span><span className="mt-1 block text-xs text-[#718078]">{[suggestion.postalCode, suggestion.city, suggestion.state, suggestion.country].filter(Boolean).join(", ")}</span></button>)}</div>}</div>{selected && <div className="mt-6 rounded-xl border border-[#c8d9cb] bg-[#f0f6f0] p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#607b68]">Selected address</p><p className="mt-2 font-bold text-[#304636]">{[ [address.street, address.houseNumber].filter(Boolean).join(" "), [address.postalCode, address.city].filter(Boolean).join(" ") ].filter(Boolean).join(", ")}</p><p className="mt-1 text-sm text-[#65736a]">{[address.street, address.houseNumber].filter(Boolean).join(" ")} · {[address.postalCode, address.city, address.state, address.country].filter(Boolean).join(", ")}</p><p className="mt-3 text-xs text-[#607b68]">Structured address saved. You can continue without entering it again.</p></div>}</Section>;
}

function AddressDebugPanel({ propertyId, property, address }: { propertyId: string; property: PropertyPayload; address: StructuredAddress }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError("");
      const results: Record<string, unknown> = {};
      try {
        const saveRes = await apiFetch(`/api/properties/${propertyId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(property) });
        results.saved = saveRes.ok ? { ok: true } : { ok: false, status: saveRes.status };
      } catch (saveError) {
        results.saved = { error: saveError instanceof Error ? saveError.message : "Save failed" };
      }
      for (const [key, path] of [["geocoding", "/location"], ["research", "/location/research"]] as const) {
        try {
          const res = await apiFetch(`/api/properties/${propertyId}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh: true }) });
          results[key] = res.ok ? await res.json() : { error: `HTTP ${res.status}`, body: await res.text() };
        } catch (queryError) {
          results[key] = { error: queryError instanceof Error ? queryError.message : "Query failed" };
        }
      }
      if (!cancelled) { setData(results); setLoading(false); }
    }
    run();
    return () => { cancelled = true; };
  }, [propertyId, address]);

  return (
    <div className="mt-6 rounded-xl border border-dashed border-[#d0a35a] bg-[#fdf9f0] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#9a7a2f]">Debug · External services (remove later)</p>
        <button type="button" onClick={() => setData(null)} className="text-xs text-[#8a6d2a] underline">Clear</button>
      </div>
      {loading && <p className="mt-3 text-sm text-[#8a7a4a]">Querying external services…</p>}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {(() => {
        const geocoding = data?.geocoding as { coordinates?: { latitude: number; longitude: number }; mapAsset?: { url?: string; caption?: string }; facilities?: Record<string, Array<{ id?: string; name?: string; latitude?: number; longitude?: number; category?: string; distanceMeters?: number }>>; radiusMeters?: number } | undefined;
        const coordinates = geocoding?.coordinates;
        if (!coordinates) return null;
        return (
          <div className="mt-3">
            <DebugMap intelligence={{ coordinates, mapAsset: geocoding?.mapAsset, facilities: geocoding?.facilities, radiusMeters: geocoding?.radiusMeters }} />
            <p className="mt-1 text-[11px] text-[#8a7a4a]">OSM map centered on coordinates · SVG mapAsset overlaid on the real map</p>
          </div>
        );
      })()}
      {data && <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-[#1f1f1f] p-3 text-[11px] leading-5 text-[#d6d6d6]">{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}

const propertyPin = L.divIcon({ className: "", html: '<div style="width:15px;height:15px;border-radius:50%;background:#26352b;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"></div>', iconSize: [15, 15], iconAnchor: [7.5, 7.5] });
const placePin = L.divIcon({ className: "", html: '<div style="width:10px;height:10px;border-radius:50%;background:#718b78;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"></div>', iconSize: [10, 10], iconAnchor: [5, 5] });

function DebugMap({ intelligence }: { intelligence: { coordinates: { latitude: number; longitude: number }; radiusMeters?: number; mapAsset?: { url?: string; caption?: string }; facilities?: Record<string, Array<{ id?: string; name?: string; latitude?: number; longitude?: number; category?: string; distanceMeters?: number }>> } }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { latitude, longitude } = intelligence.coordinates;
  const radiusMeters = intelligence.radiusMeters ?? 1000;
  const latScale = 111320;
  const lonScale = Math.max(111320 * Math.cos((latitude * Math.PI) / 180), 1);
  const halfLat = radiusMeters / (0.72 * latScale);
  const halfLon = radiusMeters / (0.72 * lonScale);
  const bounds: [[number, number], [number, number]] = [
    [latitude - halfLat, longitude - halfLon],
    [latitude + halfLat, longitude + halfLon],
  ];
  const places = Object.values(intelligence.facilities ?? {}).flat().filter((place) => place.latitude != null && place.longitude != null);
  if (!mounted) return <div className="h-80 w-full rounded-lg border border-[#e4d9b8] bg-[#eef1ec]" />;
  return (
    <MapContainer center={[latitude, longitude]} zoom={15} scrollWheelZoom={false} className="h-80 w-full rounded-lg border border-[#e4d9b8]">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {intelligence.mapAsset?.url && <ImageOverlay url={intelligence.mapAsset.url} bounds={bounds} opacity={0.7} />}
      <Marker position={[latitude, longitude]} icon={propertyPin}><Popup>Property · {latitude.toFixed(5)}, {longitude.toFixed(5)}</Popup></Marker>
      {places.map((place) => (
        <Marker key={place.id ?? `${place.name}-${place.latitude}-${place.longitude}`} position={[place.latitude as number, place.longitude as number]} icon={placePin}>
          <Popup>{place.name} · {place.category} · {place.distanceMeters}m</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

function StepProperty({ property, set, exposeData, updateExposeData }: { property: PropertyPayload; set: <K extends keyof PropertyPayload>(key: K, value: PropertyPayload[K]) => void; exposeData: ExposeData; updateExposeData: (patch: Partial<ExposeData>) => void }) {
  return <Section title="Objekt" description="Grundinformationen und eine optionale Überschrift für das Exposé."><div className="grid gap-6"><div><span className="label">Property type</span><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{PROPERTY_TYPES.map(([key, name]) => <button key={key} onClick={() => { set("propertyType", key); updateExposeData({ basicInformation: { ...exposeData.basicInformation, propertyType: key } }); }} className={`rounded-xl border px-3 py-3 text-left text-xs font-bold transition ${property.propertyType === key ? "border-[#6e8b76] bg-[#eaf0ea] text-[#45614d]" : "border-[#e0e5e0] bg-white text-[#66716a] hover:border-[#9caf9e]"}`}>{name}</button>)}</div></div><div className="grid gap-5 sm:grid-cols-2"><Input label="Objekttitel" value={exposeData.basicInformation.title} onChange={(value) => updateExposeData({ basicInformation: { ...exposeData.basicInformation, title: value } })} placeholder="Helle 3-Zimmer-Wohnung" /><Input label="Unterart" value={exposeData.basicInformation.propertySubtype} onChange={(value) => updateExposeData({ basicInformation: { ...exposeData.basicInformation, propertySubtype: value } })} placeholder="z. B. Altbauwohnung" /></div><div><span className="label">What are you planning?</span><div className="grid grid-cols-2 gap-2"><button onClick={() => set("transactionType", "sale")} className={`rounded-xl border px-4 py-4 text-left text-sm font-bold ${property.transactionType === "sale" ? "border-[#6e8b76] bg-[#eaf0ea] text-[#45614d]" : "border-[#e0e5e0]"}`}>Sell</button><button onClick={() => set("transactionType", "rent")} className={`rounded-xl border px-4 py-4 text-left text-sm font-bold ${property.transactionType === "rent" ? "border-[#6e8b76] bg-[#eaf0ea] text-[#45614d]" : "border-[#e0e5e0]"}`}>Rent</button></div></div><div className="max-w-xs"><Input label="Year built (optional)" value={property.constructionYear} type="number" onChange={(value) => set("constructionYear", value ? Number(value) : null)} placeholder="e.g. 2018" /></div></div></Section>;
}

function StepDetails({ property, set }: { property: PropertyPayload; set: <K extends keyof PropertyPayload>(key: K, value: PropertyPayload[K]) => void }) {
  return <Section title="The key details." description="The more precise the details, the better the AI can write."><div className="grid gap-5 sm:grid-cols-2"><Input label="Living area (m²)" value={property.livingArea} type="number" onChange={(value) => set("livingArea", value ? Number(value) : null)} placeholder="92" /><Input label="Plot size (m²)" value={property.plotArea} type="number" onChange={(value) => set("plotArea", value ? Number(value) : null)} placeholder="Optional" /><Input label="Zimmer" value={property.rooms} type="number" onChange={(value) => set("rooms", value ? Number(value) : null)} placeholder="3" /><Input label="Bedrooms" value={property.bedrooms} type="number" onChange={(value) => set("bedrooms", value ? Number(value) : null)} placeholder="2" /><Input label="Bathrooms" value={property.bathrooms} type="number" onChange={(value) => set("bathrooms", value ? Number(value) : null)} placeholder="1" /><Input label="Floor" value={property.floor} onChange={(value) => set("floor", value)} placeholder="2. OG" /><Input label="Total floors" value={property.totalFloors} type="number" onChange={(value) => set("totalFloors", value ? Number(value) : null)} placeholder="5" /><Input label="Available from" value={property.availableFrom} onChange={(value) => set("availableFrom", value)} placeholder="immediately / 10/01/2026" /><Select label="Condition" value={property.condition} onChange={(value) => set("condition", value)} options={[["", "Select an option"], ["new", "Like new"], ["renovated", "Renovated"], ["good", "Well maintained"], ["needs-renovation", "Needs renovation"]]} /></div></Section>;
}

function StepFinance({ property, set }: { property: PropertyPayload; set: <K extends keyof PropertyPayload>(key: K, value: PropertyPayload[K]) => void }) {
  const sale = property.transactionType === "sale";
  return <Section title="The financial details." description="Optional details can be added later."><div className="grid gap-5 sm:grid-cols-2">{sale ? <><Input label="Asking price" value={property.askingPrice} type="number" onChange={(value) => set("askingPrice", value ? Number(value) : null)} placeholder="449000" /><Input label="Purchase costs" value={property.additionalCosts} type="number" onChange={(value) => set("additionalCosts", value ? Number(value) : null)} placeholder="Optional" /><Input label="Commission" value={property.commission} onChange={(value) => set("commission", value)} placeholder="e.g. 3.57% incl. VAT" /><Input label="Service charge / month" value={property.hausgeld} type="number" onChange={(value) => set("hausgeld", value ? Number(value) : null)} placeholder="Optional" /></> : <><Input label="Cold rent / month" value={property.coldRent} type="number" onChange={(value) => set("coldRent", value ? Number(value) : null)} placeholder="1800" /><Input label="Additional costs / month" value={property.additionalCosts} type="number" onChange={(value) => set("additionalCosts", value ? Number(value) : null)} placeholder="350" /><Input label="Total rent / month" value={property.askingPrice} type="number" onChange={(value) => set("askingPrice", value ? Number(value) : null)} placeholder="2150" /><Input label="Deposit" value={property.deposit} type="number" onChange={(value) => set("deposit", value ? Number(value) : null)} placeholder="5400" /></>}</div></Section>;
}

function StepFeatures({ property, set, exposeData, updateExposeData }: { property: PropertyPayload; set: <K extends keyof PropertyPayload>(key: K, value: PropertyPayload[K]) => void; exposeData: ExposeData; updateExposeData: (patch: Partial<ExposeData>) => void }) {
  const toggle = (key: string) => set("selectedFeatures", property.selectedFeatures.includes(key) ? property.selectedFeatures.filter((value) => value !== key) : [...property.selectedFeatures, key]);
  const addEquipment = () => updateExposeData({ equipment: [...exposeData.equipment, { category: "interior", name: "", description: null }] });
  const updateEquipment = (index: number, patch: Partial<ExposeData["equipment"][number]>) => updateExposeData({ equipment: exposeData.equipment.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  const removeEquipment = (index: number) => updateExposeData({ equipment: exposeData.equipment.filter((_, itemIndex) => itemIndex !== index) });
  return <Section title="Ausstattung" description="Fakten und Ausstattungsmerkmale strukturiert erfassen."><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{FEATURE_OPTIONS.map(([key, name]) => <button key={key} type="button" onClick={() => toggle(key)} className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold ${property.selectedFeatures.includes(key) ? "border-[#6e8b76] bg-[#eaf0ea] text-[#45614d]" : "border-[#e0e5e0] bg-white text-[#66716a]"}`}>{name}</button>)}</div><div className="mt-6"><Textarea label="Additional features" value={property.additionalFeatures} onChange={(value) => set("additionalFeatures", value)} placeholder="e.g. Einbauküche, Parkett, Dreifachverglasung" /></div><div className="mt-8 space-y-3"><div className="flex items-center justify-between"><span className="label mb-0">Strukturierte Ausstattung</span><button type="button" onClick={addEquipment} className="btn btn-secondary px-3 py-2 text-xs">Ausstattung hinzufügen</button></div>{exposeData.equipment.map((item, index) => <div key={index} className="grid gap-3 rounded-xl border border-[#e0e5e0] p-3 sm:grid-cols-[1fr_1.5fr_auto]"><Select label="Kategorie" value={item.category} onChange={(value) => updateEquipment(index, { category: value })} options={[["interior", "Innenbereich"], ["kitchen", "Küche"], ["bathroom", "Bad"], ["flooring", "Boden"], ["windows", "Fenster"], ["heating", "Heizung"], ["technology", "Technik"], ["outdoor", "Außenbereich"], ["parking", "Parken"], ["storage", "Stauraum"], ["other", "Sonstiges"]]} /><Input label="Name" value={item.name} onChange={(value) => updateEquipment(index, { name: value })} placeholder="z. B. Einbauküche" /><button type="button" onClick={() => removeEquipment(index)} className="btn-ghost self-end">Entfernen</button></div>)}</div></Section>;
}

function StepRooms({ rooms, roomAdd, roomUpdate, roomRemove }: { rooms: Array<{ name: string; type: string; size?: number | null; floor?: string | null; description?: string | null; sequence: number }>; roomAdd: () => void; roomUpdate: (index: number, patch: Partial<{ name: string; type: string; size?: number | null; floor?: string | null; description?: string | null; sequence: number }>) => void; roomRemove: (index: number) => void }) {
  return <Section title="Room plan" description="Add the rooms and their most relevant details."><div className="space-y-4">{rooms.map((room, index) => <div key={`${room.name || "room"}-${index}`} className="rounded-2xl border border-[#e5e9e5] bg-[#fafcfb] p-4"><div className="mb-4 flex items-center justify-between"><h3 className="font-bold text-[#415743]">Room {index + 1}</h3><button onClick={() => roomRemove(index)} className="text-sm text-[#6d7b6f]">Remove</button></div><div className="grid gap-4 sm:grid-cols-2"><Input label="Name" value={room.name} onChange={(value) => roomUpdate(index, { name: value })} placeholder="Living room" /><Input label="Type" value={room.type} onChange={(value) => roomUpdate(index, { type: value })} placeholder="Living" /><Input label="Size (m²)" value={room.size} type="number" onChange={(value) => roomUpdate(index, { size: value ? Number(value) : null })} placeholder="25" /><Input label="Floor" value={room.floor} onChange={(value) => roomUpdate(index, { floor: value })} placeholder="Ground floor" /><div className="sm:col-span-2"><Textarea label="Description" value={room.description} onChange={(value) => roomUpdate(index, { description: value })} placeholder="Brief description of the room" /></div></div></div>)}<button type="button" onClick={roomAdd} className="btn btn-secondary">Add room</button></div></Section>;
}

function StepEnergy({ data, update }: { data?: EnergyData | null; update: (data: EnergyData | null) => void }) {
  const energy = data ?? {};
  const number = (value: string) => value === "" ? null : Number(value);
  return <Section title="Energie" description="Nur die Werte eintragen, die im Energieausweis vorhanden sind."><div className="grid gap-5 sm:grid-cols-2"><Select label="Energieausweis" value={energy.certificateType} onChange={(value) => update({ ...energy, certificateType: (value || null) as EnergyData["certificateType"] })} options={[["", "Bitte auswählen"], ["needs_based", "Bedarfsorientiert"], ["consumption_based", "Verbrauchsorientiert"], ["not_available", "Nicht vorhanden"], ["unknown", "Unbekannt"]]} /><Input label="Baujahr laut Energieausweis" value={energy.yearOfConstruction} type="number" onChange={(value) => update({ ...energy, yearOfConstruction: number(value) })} placeholder="1969" /><Select label="Hauptenergieträger" value={energy.primaryEnergySource} onChange={(value) => update({ ...energy, primaryEnergySource: (value || null) as EnergyData["primaryEnergySource"] })} options={[["", "Bitte auswählen"], ["gas", "Gas"], ["oil", "Öl"], ["district_heating", "Fernwärme"], ["heat_pump", "Wärmepumpe"], ["electricity", "Strom"], ["wood", "Holz"], ["pellets", "Pellets"], ["other", "Sonstige"]]} /><Input label="Endenergiebedarf (kWh/(m²·a))" value={energy.finalEnergyDemand} type="number" onChange={(value) => update({ ...energy, finalEnergyDemand: number(value) })} placeholder="250,20" /><Input label="Endenergieverbrauch (kWh/(m²·a))" value={energy.finalEnergyConsumption} type="number" onChange={(value) => update({ ...energy, finalEnergyConsumption: number(value) })} placeholder="Optional" /><Select label="Energieeffizienzklasse" value={energy.efficiencyClass} onChange={(value) => update({ ...energy, efficiencyClass: (value || null) as EnergyData["efficiencyClass"] })} options={[["", "Bitte auswählen"], ...["A+", "A", "B", "C", "D", "E", "F", "G", "H"].map((item) => [item, item] as const)]} /></div></Section>;
}

function StepPhotos({ images, fileInput, upload, removeImage, cover, moveImage, category, subcategory, caption, setCategory, setSubcategory, setCaption }: { images: Array<{ id: string; url: string; fileName: string; mimeType: string; size: number; sequence: number; isCover: boolean; category?: string | null; subcategory?: string | null; caption?: string | null }>; fileInput: React.RefObject<HTMLInputElement | null>; upload: (files: FileList | null) => Promise<void>; removeImage: (id: string) => Promise<void>; cover: (id: string) => Promise<void>; moveImage: (index: number, direction: -1 | 1) => Promise<void>; category: "exterior" | "interior" | "floor_plan" | "document"; subcategory: string; caption: string; setCategory: (value: "exterior" | "interior" | "floor_plan" | "document") => void; setSubcategory: (value: string) => void; setCaption: (value: string) => void }) {
  const options: readonly (readonly [string, string])[] = category === "exterior" ? [["front", "Hausansicht"], ["garden", "Garten"], ["terrace", "Terrasse"], ["balcony", "Balkon"], ["driveway", "Zufahrt"], ["entrance", "Eingang"], ["garage", "Garage"], ["parking", "Stellplatz"], ["other", "Sonstiges Außen"]] : category === "interior" ? [["living_room", "Wohnzimmer"], ["bedroom", "Schlafzimmer"], ["child_room", "Kinderzimmer"], ["office", "Arbeitszimmer"], ["kitchen", "Küche"], ["dining_room", "Esszimmer"], ["bathroom", "Badezimmer"], ["guest_wc", "Gäste-WC"], ["hallway", "Flur"], ["hobby_room", "Hobbyraum"], ["utility_room", "Hauswirtschaftsraum"], ["basement", "Keller"], ["attic", "Dachboden"], ["other", "Sonstiger Innenraum"]] : category === "floor_plan" ? [["ground_floor", "Grundriss"], ["furnished", "Grundriss möbliert"], ["site_plan", "Lageplan"], ["macro_location", "Makrolage"]] : [["energy_certificate", "Energieausweis"], ["other", "Sonstiges Dokument"]];
  return <Section title={category === "floor_plan" ? "Pläne & Dokumente" : "Bilder"} description="Jedes Bild erhält eine semantische Kategorie und kann später automatisch beschriftet werden."><div className="grid gap-5 sm:grid-cols-2"><Select label="Bildgruppe" value={category} onChange={(value) => setCategory(value as typeof category)} options={[["exterior", "Außenbereich"], ["interior", "Innenbereich"], ["floor_plan", "Pläne & Grundrisse"], ["document", "Energie / Dokumente"]]} /><Select label="Konkrete Zuordnung" value={subcategory} onChange={setSubcategory} options={[["", "Bitte auswählen"], ...options]} /><Input label="Optionale Bildunterschrift" value={caption} onChange={setCaption} placeholder="z. B. Küche" /></div><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => { upload(event.target.files); event.target.value = "" }} /><button type="button" onClick={() => fileInput.current?.click()} className="btn btn-primary mt-6">Bilder hinzufügen</button><div className="mt-6 grid gap-3 sm:grid-cols-2">{images.map((image, index) => <div key={image.id} className="rounded-2xl border border-[#e2e8e2] bg-white p-3"><img src={apiAssetUrl(image.url)} alt={image.caption || image.subcategory || "Immobilienbild"} className="h-36 w-full rounded-xl object-cover" /><div className="mt-3 text-xs text-[#6e796f]">{image.caption || image.subcategory || image.category || "Nicht kategorisiert"}</div><div className="mt-3 flex gap-2"><button type="button" onClick={() => cover(image.id)} className="btn btn-secondary px-2 py-2 text-[11px]">Als Titelbild</button><button type="button" onClick={() => removeImage(image.id)} className="btn btn-secondary px-2 py-2 text-[11px]">Löschen</button><button type="button" onClick={() => moveImage(index, -1)} className="btn btn-secondary px-2 py-2 text-[11px]">↑</button><button type="button" onClick={() => moveImage(index, 1)} className="btn btn-secondary px-2 py-2 text-[11px]">↓</button></div></div>)}</div></Section>;
}

function StepAgent({ data, update }: { data: ExposeData["agent"]; update: (data: ExposeData["agent"]) => void }) {
  const agent = data ?? {};
  return <Section title="Makler / Kontakt" description="Maklerdaten bleiben getrennt von Vista-Systeminformationen."><div className="grid gap-5 sm:grid-cols-2"><Input label="Name" value={agent.name} onChange={(value) => update({ ...agent, name: value })} /><Input label="Unternehmen" value={agent.company} onChange={(value) => update({ ...agent, company: value })} /><Input label="Telefon" value={agent.phone} onChange={(value) => update({ ...agent, phone: value })} /><Input label="E-Mail" value={agent.email} onChange={(value) => update({ ...agent, email: value })} /><Input label="Website" value={agent.website} onChange={(value) => update({ ...agent, website: value })} /><Input label="Straße und Hausnummer" value={agent.address?.street} onChange={(value) => update({ ...agent, address: { ...(agent.address ?? { country: "Deutschland" }), street: value } })} /></div></Section>;
}

function Review({ property, images, onEdit }: { property: PropertyPayload; images: Array<{ id: string; url: string; fileName: string; mimeType: string; size: number; sequence: number; isCover: boolean }>; onEdit: (step: number) => void }) {
  return <Section title="Review" description="Check everything before generating the AI copy."><div className="space-y-5"><div className="rounded-2xl border border-[#e1e7e1] bg-[#fafcfb] p-4"><div className="flex items-center justify-between"><p className="font-bold text-[#415743]">Summary</p><button type="button" onClick={() => onEdit(0)} className="text-sm text-[#607b68]">Edit</button></div><dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-[#59675f]"><div><dt className="font-bold text-[#3b4b40]">Type</dt><dd>{pretty(property.propertyType)}</dd></div><div><dt className="font-bold text-[#3b4b40]">Transaction</dt><dd>{pretty(property.transactionType)}</dd></div><div><dt className="font-bold text-[#3b4b40]">City</dt><dd>{pretty(property.city)}</dd></div><div><dt className="font-bold text-[#3b4b40]">Price</dt><dd>{money(property.askingPrice)}</dd></div></dl></div><div className="rounded-2xl border border-[#e1e7e1] bg-[#fafcfb] p-4"><div className="flex items-center justify-between"><p className="font-bold text-[#415743]">Photos</p><button type="button" onClick={() => onEdit(6)} className="text-sm text-[#607b68]">Edit</button></div><div className="mt-3 grid gap-3 sm:grid-cols-3">{images.length ? images.slice(0, 3).map((image) => <img key={image.id} src={apiAssetUrl(image.url)} alt={image.fileName} className="h-24 w-full rounded-xl object-cover" />) : <p className="text-sm text-[#78847c]">No photos uploaded yet.</p>}</div></div></div></Section>;
}

function ContentEditor({ content, setContent, onGenerate, onPreview, loading, saving }: { content: ExposeContent | null; setContent: (value: ExposeContent) => void; onGenerate: (action?: string) => Promise<void>; onPreview: () => Promise<void>; loading: boolean; saving: boolean }) {
  const draft = content ?? {
    title: "",
    portalTitle: "",
    shortDescription: "",
    mainDescription: "",
    highlights: [],
    roomDescriptions: [],
    locationDescription: "",
    targetAudience: "",
    factualSnapshot: [],
  };
  return <Section title="AI content editor" description="Review or adjust the generated exposé content."><div className="space-y-5"><Textarea label="Title" value={draft.title} onChange={(value) => setContent({ ...draft, title: value })} /><Textarea label="Portal title" value={draft.portalTitle} onChange={(value) => setContent({ ...draft, portalTitle: value })} /><Textarea label="Short description" value={draft.shortDescription} onChange={(value) => setContent({ ...draft, shortDescription: value })} /><Textarea label="Main description" value={draft.mainDescription} onChange={(value) => setContent({ ...draft, mainDescription: value })} /><Textarea label="Location description" value={draft.locationDescription} onChange={(value) => setContent({ ...draft, locationDescription: value })} /><Textarea label="Target audience" value={draft.targetAudience} onChange={(value) => setContent({ ...draft, targetAudience: value })} /><button type="button" onClick={() => onGenerate("Make the copy more premium and concise.")} className="btn btn-secondary" disabled={loading || saving}>{loading ? "Generating…" : "Regenerate with AI"}</button></div></Section>;
}
