"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  LoaderCircle,
  Sparkles,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

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

const steps = ["Property", "Details", "Finances", "Features", "Rooms", "Location", "Photos", "Review"];

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
  };
};

const pretty = (value: string | number | null | undefined) => value === null || value === undefined || value === "" ? "Not provided" : String(value);
const money = (value?: number | null) => value ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value) : "Not provided";

export default function WizardClient({ initialProperty }: { initialProperty: Property }) {
  const router = useRouter();
  const [property, setProperty] = useState<PropertyPayload>(initialPayload(initialProperty));
  const [images, setImages] = useState(initialProperty.images);
  const [content, setContent] = useState<ExposeContent | null>(initialProperty.expose?.content ?? null);
  const [step, setStep] = useState(content ? 8 : 0);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function set<K extends keyof PropertyPayload>(key: K, value: PropertyPayload[K]) {
    setProperty((current) => ({ ...current, [key]: value }));
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
    await save();
    setStep((current) => Math.min(current + 1, 8));
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
      setStep(8);
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

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const body = new FormData();
    [...files].forEach((file) => body.append("files", file));
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

  const roomAdd = () => set("roomsData", [...property.roomsData, { name: "", type: "", size: null, floor: "", description: "", sequence: property.roomsData.length }]);
  const roomUpdate = (index: number, patch: Partial<Omit<Property["roomsData"][number], "id">>) => set("roomsData", property.roomsData.map((room, roomIndex) => roomIndex === index ? { ...room, ...patch } : room));
  const roomRemove = (index: number) => set("roomsData", property.roomsData.filter((_, roomIndex) => roomIndex !== index).map((room, sequence) => ({ ...room, sequence })));

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
          <span className="text-sm text-[#7c887f]">{Math.min(step + 1, 8)} / 8</span>
        </div>
        <div className="mb-10 overflow-x-auto pb-2">
          <div className="flex min-w-[670px] items-center">
            {steps.map((name, index) => (
              <div key={name} className="flex flex-1 items-center">
                <button onClick={() => index <= step && setStep(index)} className={`flex items-center gap-2 text-left text-xs font-bold ${index <= step ? "text-[#48624f]" : "text-[#aab4ac]"}`}>
                  <span className={`grid h-8 w-8 place-items-center rounded-full border text-[11px] ${index < step ? "border-[#78917d] bg-[#78917d] text-white" : index === step ? "border-[#202522] bg-[#202522] text-white" : "border-[#d7ded8] bg-white"}`}>
                    {index < step ? <Check size={14} /> : `0${index + 1}`}
                  </span>
                  <span>{name}</span>
                </button>
                {index < steps.length - 1 && <span className={`mx-3 h-px flex-1 ${index < step ? "bg-[#94aa98]" : "bg-[#dfe5df]"}`} />}
              </div>
            ))}
          </div>
        </div>
        {error && <div className="mb-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button onClick={() => setError("")}><X size={16} /></button></div>}
        <div className="mx-auto max-w-4xl">
          {step < 8 ? (
            <div className="step-enter">
              {step === 0 && <StepProperty property={property} set={set} />}
              {step === 1 && <StepDetails property={property} set={set} />}
              {step === 2 && <StepFinance property={property} set={set} />}
              {step === 3 && <StepFeatures property={property} set={set} />}
              {step === 4 && <StepRooms rooms={property.roomsData} roomAdd={roomAdd} roomUpdate={roomUpdate} roomRemove={roomRemove} />}
              {step === 5 && <StepLocation property={property} set={set} />}
              {step === 6 && <StepPhotos images={images} fileInput={fileInput} upload={upload} removeImage={removeImage} cover={cover} moveImage={moveImage} />}
              {step === 7 && <Review property={property} images={images} onEdit={setStep} />}
            </div>
          ) : (
            <ContentEditor content={content} setContent={setContent} onGenerate={generate} onPreview={saveContent} loading={aiLoading} saving={saving} />
          )}
        </div>
        <div className="mx-auto mt-10 flex max-w-4xl justify-between border-t border-[#e0e5e0] pt-5">
          <button className="btn btn-ghost flex items-center gap-2" disabled={step === 0} onClick={() => setStep((current) => current - 1)}><ArrowLeft size={15} /> Back</button>
          {step < 7 ? (
            <button className="btn btn-primary flex items-center gap-2" onClick={next}>{saving ? "Saving…" : "Next"} <ArrowRight size={15} /></button>
          ) : step === 7 ? (
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

function StepProperty({ property, set }: { property: PropertyPayload; set: <K extends keyof PropertyPayload>(key: K, value: PropertyPayload[K]) => void }) {
  return <Section title="What would you like to offer?" description="Start with the most important details about your property."><div className="grid gap-6"><div><span className="label">Property type</span><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{PROPERTY_TYPES.map(([key, name]) => <button key={key} onClick={() => set("propertyType", key)} className={`rounded-xl border px-3 py-3 text-left text-xs font-bold transition ${property.propertyType === key ? "border-[#6e8b76] bg-[#eaf0ea] text-[#45614d]" : "border-[#e0e5e0] bg-white text-[#66716a] hover:border-[#9caf9e]"}`}>{name}</button>)}</div></div><div><span className="label">What are you planning?</span><div className="grid grid-cols-2 gap-2"><button onClick={() => set("transactionType", "sale")} className={`rounded-xl border px-4 py-4 text-left text-sm font-bold ${property.transactionType === "sale" ? "border-[#6e8b76] bg-[#eaf0ea] text-[#45614d]" : "border-[#e0e5e0]"}`}>Sell<span className="mt-1 block text-xs font-normal text-[#78847c]">List the property for sale</span></button><button onClick={() => set("transactionType", "rent")} className={`rounded-xl border px-4 py-4 text-left text-sm font-bold ${property.transactionType === "rent" ? "border-[#6e8b76] bg-[#eaf0ea] text-[#45614d]" : "border-[#e0e5e0]"}`}>Rent<span className="mt-1 block text-xs font-normal text-[#78847c]">Find new tenants</span></button></div></div><div className="max-w-xs"><Input label="Year built (optional)" value={property.constructionYear} type="number" onChange={(value) => set("constructionYear", value ? Number(value) : null)} placeholder="e.g. 2018" /></div></div></Section>;
}

function StepDetails({ property, set }: { property: PropertyPayload; set: <K extends keyof PropertyPayload>(key: K, value: PropertyPayload[K]) => void }) {
  return <Section title="The key details." description="The more precise the details, the better the AI can write."><div className="grid gap-5 sm:grid-cols-2"><Input label="Street and house number" value={property.address} onChange={(value) => set("address", value)} placeholder="e.g. 42 Bergmannstraße" /><Input label="Postal code" value={property.zipCode} onChange={(value) => set("zipCode", value)} placeholder="10961" /><Input label="City" value={property.city} onChange={(value) => set("city", value)} placeholder="Berlin" /><Input label="District / neighborhood" value={property.district} onChange={(value) => set("district", value)} placeholder="Kreuzberg" /><Input label="Living area (m²)" value={property.livingArea} type="number" onChange={(value) => set("livingArea", value ? Number(value) : null)} placeholder="92" /><Input label="Plot size (m²)" value={property.plotArea} type="number" onChange={(value) => set("plotArea", value ? Number(value) : null)} placeholder="Optional" /><Input label="Zimmer" value={property.rooms} type="number" onChange={(value) => set("rooms", value ? Number(value) : null)} placeholder="3" /><Input label="Bedrooms" value={property.bedrooms} type="number" onChange={(value) => set("bedrooms", value ? Number(value) : null)} placeholder="2" /><Input label="Bathrooms" value={property.bathrooms} type="number" onChange={(value) => set("bathrooms", value ? Number(value) : null)} placeholder="1" /><Input label="Floor" value={property.floor} onChange={(value) => set("floor", value)} placeholder="2. OG" /><Input label="Total floors" value={property.totalFloors} type="number" onChange={(value) => set("totalFloors", value ? Number(value) : null)} placeholder="5" /><Input label="Available from" value={property.availableFrom} onChange={(value) => set("availableFrom", value)} placeholder="immediately / 10/01/2026" /><Select label="Condition" value={property.condition} onChange={(value) => set("condition", value)} options={[ ["", "Select an option"], ["new", "Like new"], ["renovated", "Renovated"], ["good", "Well maintained"], ["needs-renovation", "Needs renovation"] ]} /></div></Section>;
}

function StepFinance({ property, set }: { property: PropertyPayload; set: <K extends keyof PropertyPayload>(key: K, value: PropertyPayload[K]) => void }) {
  const sale = property.transactionType === "sale";
  return <Section title="The financial details." description="Optional details can be added later."><div className="grid gap-5 sm:grid-cols-2">{sale ? <><Input label="Asking price" value={property.askingPrice} type="number" onChange={(value) => set("askingPrice", value ? Number(value) : null)} placeholder="449000" /><Input label="Purchase costs" value={property.additionalCosts} type="number" onChange={(value) => set("additionalCosts", value ? Number(value) : null)} placeholder="Optional" /><Input label="Commission" value={property.commission} onChange={(value) => set("commission", value)} placeholder="e.g. 3.57% incl. VAT" /><Input label="Service charge / month" value={property.hausgeld} type="number" onChange={(value) => set("hausgeld", value ? Number(value) : null)} placeholder="Optional" /></> : <><Input label="Cold rent / month" value={property.coldRent} type="number" onChange={(value) => set("coldRent", value ? Number(value) : null)} placeholder="1800" /><Input label="Additional costs / month" value={property.additionalCosts} type="number" onChange={(value) => set("additionalCosts", value ? Number(value) : null)} placeholder="350" /><Input label="Total rent / month" value={property.askingPrice} type="number" onChange={(value) => set("askingPrice", value ? Number(value) : null)} placeholder="2150" /><Input label="Deposit" value={property.deposit} type="number" onChange={(value) => set("deposit", value ? Number(value) : null)} placeholder="5400" /></>}</div></Section>;
}

function StepFeatures({ property, set }: { property: PropertyPayload; set: <K extends keyof PropertyPayload>(key: K, value: PropertyPayload[K]) => void }) {
  const toggle = (key: string) => set("selectedFeatures", property.selectedFeatures.includes(key) ? property.selectedFeatures.filter((value) => value !== key) : [...property.selectedFeatures, key]);
  return <Section title="What makes the property special?" description="Select the features that best describe the home."><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{FEATURE_OPTIONS.map(([key, name]) => <button key={key} type="button" onClick={() => toggle(key)} className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold ${property.selectedFeatures.includes(key) ? "border-[#6e8b76] bg-[#eaf0ea] text-[#45614d]" : "border-[#e0e5e0] bg-white text-[#66716a]"}`}>{name}</button>)}</div><div className="mt-6"><Textarea label="Additional features" value={property.additionalFeatures} onChange={(value) => set("additionalFeatures", value)} placeholder="e.g. Oak flooring and splendid garden view" /></div></Section>;
}

function StepRooms({ rooms, roomAdd, roomUpdate, roomRemove }: { rooms: Array<{ name: string; type: string; size?: number | null; floor?: string | null; description?: string | null; sequence: number }>; roomAdd: () => void; roomUpdate: (index: number, patch: Partial<{ name: string; type: string; size?: number | null; floor?: string | null; description?: string | null; sequence: number }>) => void; roomRemove: (index: number) => void }) {
  return <Section title="Room plan" description="Add the rooms and their most relevant details."><div className="space-y-4">{rooms.map((room, index) => <div key={`${room.name || "room"}-${index}`} className="rounded-2xl border border-[#e5e9e5] bg-[#fafcfb] p-4"><div className="mb-4 flex items-center justify-between"><h3 className="font-bold text-[#415743]">Room {index + 1}</h3><button onClick={() => roomRemove(index)} className="text-sm text-[#6d7b6f]">Remove</button></div><div className="grid gap-4 sm:grid-cols-2"><Input label="Name" value={room.name} onChange={(value) => roomUpdate(index, { name: value })} placeholder="Living room" /><Input label="Type" value={room.type} onChange={(value) => roomUpdate(index, { type: value })} placeholder="Living" /><Input label="Size (m²)" value={room.size} type="number" onChange={(value) => roomUpdate(index, { size: value ? Number(value) : null })} placeholder="25" /><Input label="Floor" value={room.floor} onChange={(value) => roomUpdate(index, { floor: value })} placeholder="Ground floor" /><div className="sm:col-span-2"><Textarea label="Description" value={room.description} onChange={(value) => roomUpdate(index, { description: value })} placeholder="Brief description of the room" /></div></div></div>)}<button type="button" onClick={roomAdd} className="btn btn-secondary">Add room</button></div></Section>;
}

function StepLocation({ property, set }: { property: PropertyPayload; set: <K extends keyof PropertyPayload>(key: K, value: PropertyPayload[K]) => void }) {
  return <Section title="Location and surroundings" description="Useful neighborhood context helps the AI write the property story."><div className="grid gap-5 sm:grid-cols-2"><Textarea label="Location note" value={property.locationNote} onChange={(value) => set("locationNote", value)} placeholder="Describe the area or neighborhood." /><Textarea label="Seller description" value={property.sellerDescription} onChange={(value) => set("sellerDescription", value)} placeholder="What stands out most about the home?" /><Textarea label="Special notes" value={property.specialNotes} onChange={(value) => set("specialNotes", value)} placeholder="Anything else to mention?" /><Textarea label="Target audience" value={property.targetAudience} onChange={(value) => set("targetAudience", value)} placeholder="Who is the ideal buyer or tenant?" /></div></Section>;
}

function StepPhotos({ images, fileInput, upload, removeImage, cover, moveImage }: { images: Array<{ id: string; url: string; fileName: string; mimeType: string; size: number; sequence: number; isCover: boolean }>; fileInput: React.RefObject<HTMLInputElement | null>; upload: (files: FileList | null) => Promise<void>; removeImage: (id: string) => Promise<void>; cover: (id: string) => Promise<void>; moveImage: (index: number, direction: -1 | 1) => Promise<void> }) {
  return <Section title="Photos" description="Upload the best images for the exposé and preview."><div className="space-y-4"><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => { upload(event.target.files); event.target.value = "" }} /><button type="button" onClick={() => fileInput.current?.click()} className="btn btn-primary">Upload photos</button><div className="grid gap-3 sm:grid-cols-2">{images.map((image, index) => <div key={image.id} className="rounded-2xl border border-[#e2e8e2] bg-white p-3"><img src={image.url.startsWith("http") ? image.url : image.url} alt={image.fileName} className="h-36 w-full rounded-xl object-cover" /><div className="mt-3 flex items-center justify-between"><span className="text-xs text-[#6e796f]">{image.fileName}</span>{image.isCover ? <span className="rounded-full bg-[#eaf0ea] px-2 py-1 text-[10px] font-bold text-[#45614d]">Cover</span> : null}</div><div className="mt-3 flex gap-2"><button type="button" onClick={() => cover(image.id)} className="btn btn-secondary px-2 py-2 text-[11px]">Set cover</button><button type="button" onClick={() => removeImage(image.id)} className="btn btn-secondary px-2 py-2 text-[11px]">Delete</button></div><div className="mt-3 flex gap-2"><button type="button" aria-label="Move image left" onClick={() => moveImage(index, -1)} className="btn btn-secondary px-2 py-2 text-[11px]">←</button><button type="button" aria-label="Move image right" onClick={() => moveImage(index, 1)} className="btn btn-secondary px-2 py-2 text-[11px]">→</button></div></div>)}</div></div></Section>;
}

function Review({ property, images, onEdit }: { property: PropertyPayload; images: Array<{ id: string; url: string; fileName: string; mimeType: string; size: number; sequence: number; isCover: boolean }>; onEdit: (step: number) => void }) {
  return <Section title="Review" description="Check everything before generating the AI copy."><div className="space-y-5"><div className="rounded-2xl border border-[#e1e7e1] bg-[#fafcfb] p-4"><div className="flex items-center justify-between"><p className="font-bold text-[#415743]">Summary</p><button type="button" onClick={() => onEdit(0)} className="text-sm text-[#607b68]">Edit</button></div><dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-[#59675f]"><div><dt className="font-bold text-[#3b4b40]">Type</dt><dd>{pretty(property.propertyType)}</dd></div><div><dt className="font-bold text-[#3b4b40]">Transaction</dt><dd>{pretty(property.transactionType)}</dd></div><div><dt className="font-bold text-[#3b4b40]">City</dt><dd>{pretty(property.city)}</dd></div><div><dt className="font-bold text-[#3b4b40]">Price</dt><dd>{money(property.askingPrice)}</dd></div></dl></div><div className="rounded-2xl border border-[#e1e7e1] bg-[#fafcfb] p-4"><div className="flex items-center justify-between"><p className="font-bold text-[#415743]">Photos</p><button type="button" onClick={() => onEdit(6)} className="text-sm text-[#607b68]">Edit</button></div><div className="mt-3 grid gap-3 sm:grid-cols-3">{images.length ? images.slice(0, 3).map((image) => <img key={image.id} src={image.url} alt={image.fileName} className="h-24 w-full rounded-xl object-cover" />) : <p className="text-sm text-[#78847c]">No photos uploaded yet.</p>}</div></div></div></Section>;
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

