"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  GripVertical,
  ImagePlus,
  LoaderCircle,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  FEATURE_OPTIONS,
  PROPERTY_TYPES,
  type ExposeContent,
  type Property,
  type PropertyPayload,
  type PropertyRoom,
} from "@/lib/types";

const steps = [
  "Property",
  "Details",
  "Finances",
  "Features",
  "Rooms",
  "Location",
  "Photos",
  "Review",
];
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
  selectedFeatures: [
    "balcony",
    "elevator",
    "fitted-kitchen",
    "underfloor-heating",
    "basement",
  ],
  additionalFeatures: "Oak flooring and triple-glazed windows",
  surroundings: {
    transport: "U2 and several tram lines are just a few minutes away",
    shopping:
      "Weekly market at Kollwitzplatz and everyday shops nearby",
  },
  roomsData: [
    {
      name: "Living room",
      type: "Living",
      size: 31,
      floor: "3. OG",
      description:
        "Bright living area with balcony access and large windows.",
      sequence: 0,
    },
    {
      name: "Kitchen",
      type: "Kitchen",
      size: 11,
      floor: "3. OG",
      description: "Open-plan fitted kitchen with generous work surfaces.",
      sequence: 1,
    },
  ],
};
const initialPayload = (property: Property): PropertyPayload => {
  const {
    id: _id,
    images: _images,
    expose: _expose,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...payload
  } = property;
  const freshDraft =
    !property.address &&
    !property.city &&
    property.roomsData.length === 0 &&
    property.selectedFeatures.length === 0;
  return {
    ...(freshDraft ? demoDefaults : {}),
    ...payload,
    roomsData: freshDraft
      ? (demoDefaults.roomsData ?? [])
      : property.roomsData.map(({ id: _roomId, ...room }) => room),
  };
};
const pretty = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === ""
    ? "Not provided"
    : String(value);
const money = (value?: number | null) =>
  value
    ? new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value)
    : "Not provided";

export default function WizardClient({
  initialProperty,
}: {
  initialProperty: Property;
}) {
  const router = useRouter();
  const [property, setProperty] = useState<PropertyPayload>(
    initialPayload(initialProperty),
  );
  const [images, setImages] = useState(initialProperty.images);
  const [content, setContent] = useState<ExposeContent | null>(
    initialProperty.expose?.content && "title" in initialProperty.expose.content
      ? initialProperty.expose.content
      : null,
  );
  const [step, setStep] = useState(content ? 8 : 0);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  function set<K extends keyof PropertyPayload>(
    key: K,
    value: PropertyPayload[K],
  ) {
    setProperty((current) => ({ ...current, [key]: value }));
  }
  async function save() {
    setSaving(true);
    setError("");
    const response = await fetch(`/api/properties/${initialProperty.id}`, {
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
  async function resolvePropertyLocation() {
    setLocationLoading(true);
    setError("");
    const response = await fetch(`/api/properties/${initialProperty.id}/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error || "Location could not be resolved.");
    else {
      setProperty((current) => ({
        ...current,
        exposeData: {
          ...(current.exposeData || initialProperty.exposeData!),
          location: {
            ...(current.exposeData?.location || initialProperty.exposeData?.location),
            address: result.address,
            latitude: result.coordinates.latitude,
            longitude: result.coordinates.longitude,
            intelligence: result,
            description: result.summary,
          },
        },
      }));
    }
    setLocationLoading(false);
  }
  async function manuallyAdjustLocation(latitude: number, longitude: number) {
    setLocationLoading(true);
    const response = await fetch(`/api/properties/${initialProperty.id}/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude, longitude }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error || "The location could not be updated.");
    else setProperty((current) => ({
      ...current,
      exposeData: {
        ...(current.exposeData || initialProperty.exposeData!),
        location: { ...(current.exposeData?.location || initialProperty.exposeData?.location), address: result.address, latitude, longitude, intelligence: result, description: result.summary },
      },
    }));
    setLocationLoading(false);
  }
  async function generate(action = "") {
    await save();
    setAiLoading(true);
    setError("");
    const response = await fetch(
      `/api/properties/${initialProperty.id}/ai/improve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
    );
    const result = await response.json();
    if (!response.ok)
      setError(result.error || "The AI could not create the text.");
    else {
      setContent(result);
      setStep(8);
    }
    setAiLoading(false);
  }
  async function saveContent() {
    if (!content) return;
    setSaving(true);
    const response = await fetch(
      `/api/properties/${initialProperty.id}/expose`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      },
    );
    if (response.ok) router.push(`/preview/${initialProperty.id}`);
    else setError("The content could not be saved.");
    setSaving(false);
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const body = new FormData();
    [...files].forEach((file) => body.append("files", file));
    const response = await fetch(
      `/api/properties/${initialProperty.id}/images`,
      { method: "POST", body },
    );
    const result = await response.json();
    if (!response.ok) setError(result.error);
    else setImages((current) => [...current, ...result]);
  }
  async function removeImage(id: string) {
    await fetch(`/api/properties/${initialProperty.id}/images/${id}`, {
      method: "DELETE",
    });
    setImages((current) => current.filter((image) => image.id !== id));
  }
  async function cover(id: string) {
    const response = await fetch(
      `/api/properties/${initialProperty.id}/images/${id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cover: true }),
      },
    );
    if (response.ok) setImages(await response.json());
  }
  async function moveImage(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= images.length) return;
    const reordered = [...images];
    [reordered[index], reordered[nextIndex]] = [
      reordered[nextIndex],
      reordered[index],
    ];
    setImages(reordered.map((image, sequence) => ({ ...image, sequence })));
    await fetch(`/api/properties/${initialProperty.id}/images/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageIds: reordered.map((image) => image.id) }),
    });
  }
  const roomAdd = () =>
    set("roomsData", [
      ...property.roomsData,
      {
        name: "",
        type: "",
        size: null,
        floor: "",
        description: "",
        sequence: property.roomsData.length,
      },
    ]);
  const roomUpdate = (
    index: number,
    patch: Partial<Omit<PropertyRoom, "id">>,
  ) =>
    set(
      "roomsData",
      property.roomsData.map((room, roomIndex) =>
        roomIndex === index ? { ...room, ...patch } : room,
      ),
    );
  const roomRemove = (index: number) =>
    set(
      "roomsData",
      property.roomsData
        .filter((_, roomIndex) => roomIndex !== index)
        .map((room, sequence) => ({ ...room, sequence })),
    );
  return (
    <main className="min-h-screen bg-[#f4f6f3]">
      <header className="flex items-center justify-between border-b border-[#e0e5e0] bg-white px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#202522] font-serif text-white">
            R
          </span>
          <span className="hidden text-sm font-bold tracking-[.16em] sm:block">
            RAUMWERK
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-[#7a877e] sm:block">
            {saving ? "Saving…" : "Saved automatically"}
          </span>
          <span className="h-2 w-2 rounded-full bg-[#84a28b]" />
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
        <div className="mb-9 flex items-end justify-between">
          <div>
            <p className="text-xs font-bold tracking-[.18em] text-[#607b68]">
              NEW EXPOSÉ
            </p>
            <h1 className="serif mt-2 text-3xl sm:text-4xl">
              Your property, in focus.
            </h1>
          </div>
          <span className="text-sm text-[#7c887f]">
            {Math.min(step + 1, 8)} / 8
          </span>
        </div>
        <div className="mb-10 overflow-x-auto pb-2">
          <div className="flex min-w-[670px] items-center">
            {steps.map((name, index) => (
              <div key={name} className="flex flex-1 items-center">
                <button
                  onClick={() => index <= step && setStep(index)}
                  className={`flex items-center gap-2 text-left text-xs font-bold ${index <= step ? "text-[#48624f]" : "text-[#aab4ac]"}`}
                >
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-full border text-[11px] ${index < step ? "border-[#78917d] bg-[#78917d] text-white" : index === step ? "border-[#202522] bg-[#202522] text-white" : "border-[#d7ded8] bg-white"}`}
                  >
                    {index < step ? <Check size={14} /> : `0${index + 1}`}
                  </span>
                  <span>{name}</span>
                </button>
                {index < steps.length - 1 && (
                  <span
                    className={`mx-3 h-px flex-1 ${index < step ? "bg-[#94aa98]" : "bg-[#dfe5df]"}`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        {error && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        <div className="mx-auto max-w-4xl">
          {step < 8 ? (
            <div className="step-enter">
              {step === 0 && <StepProperty property={property} set={set} />}
              {step === 1 && <StepDetails property={property} set={set} />}
              {step === 2 && <StepFinance property={property} set={set} />}
              {step === 3 && <StepFeatures property={property} set={set} />}
              {step === 4 && (
                <StepRooms
                  rooms={property.roomsData}
                  roomAdd={roomAdd}
                  roomUpdate={roomUpdate}
                  roomRemove={roomRemove}
                />
              )}
               {step === 5 && <StepLocation property={property} set={set} onResolve={resolvePropertyLocation} onAdjust={manuallyAdjustLocation} loading={locationLoading} />}
              {step === 6 && (
                <StepPhotos
                  images={images}
                  fileInput={fileInput}
                  upload={upload}
                  removeImage={removeImage}
                  cover={cover}
                  moveImage={moveImage}
                />
              )}
              {step === 7 && (
                <Review property={property} images={images} onEdit={setStep} />
              )}
            </div>
          ) : (
            <ContentEditor
              content={content}
              setContent={setContent}
              onGenerate={generate}
              onPreview={saveContent}
              loading={aiLoading}
              saving={saving}
            />
          )}
        </div>
        <div className="mx-auto mt-10 flex max-w-4xl justify-between border-t border-[#e0e5e0] pt-5">
          <button
            className="btn btn-ghost flex items-center gap-2"
            disabled={step === 0}
            onClick={() => setStep((current) => current - 1)}
          >
            <ArrowLeft size={15} /> Back
          </button>
          {step < 7 ? (
            <button
              className="btn btn-primary flex items-center gap-2"
              onClick={next}
            >
              {saving ? "Saving…" : "Next"} <ArrowRight size={15} />
            </button>
          ) : step === 7 ? (
            <button
              className="btn btn-primary flex items-center gap-2"
              onClick={() => generate()}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Sparkles size={15} />
              )}{" "}
              Improve with AI
            </button>
          ) : (
            <button
              className="btn btn-primary flex items-center gap-2"
              onClick={saveContent}
              disabled={saving}
            >
              <FileText size={15} /> Open preview <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card bg-white p-5 sm:p-8">
      <h2 className="serif text-2xl sm:text-3xl">{title}</h2>
      {description && (
        <p className="mt-2 text-sm leading-6 text-[#78847c]">{description}</p>
      )}
      <div className="mt-8">{children}</div>
    </div>
  );
}
function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <input
        className="field"
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | undefined | null;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <select
        className="field"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
function Textarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <textarea
        className="field min-h-28 resize-y"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function StepProperty({
  property,
  set,
}: {
  property: PropertyPayload;
  set: <K extends keyof PropertyPayload>(
    key: K,
    value: PropertyPayload[K],
  ) => void;
}) {
  return (
    <Section
      title="What would you like to offer?"
      description="Start with the most important details about your property."
    >
      <div className="grid gap-6">
        <div>
          <span className="label">Property type</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PROPERTY_TYPES.map(([key, name]) => (
              <button
                key={key}
                onClick={() => set("propertyType", key)}
                className={`rounded-xl border px-3 py-3 text-left text-xs font-bold transition ${property.propertyType === key ? "border-[#6e8b76] bg-[#eaf0ea] text-[#45614d]" : "border-[#e0e5e0] bg-white text-[#66716a] hover:border-[#9caf9e]"}`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">What are you planning?</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => set("transactionType", "sale")}
              className={`rounded-xl border px-4 py-4 text-left text-sm font-bold ${property.transactionType === "sale" ? "border-[#6e8b76] bg-[#eaf0ea] text-[#45614d]" : "border-[#e0e5e0]"}`}
            >
              Sell
              <span className="mt-1 block text-xs font-normal text-[#78847c]">
                List the property for sale
              </span>
            </button>
            <button
              onClick={() => set("transactionType", "rent")}
              className={`rounded-xl border px-4 py-4 text-left text-sm font-bold ${property.transactionType === "rent" ? "border-[#6e8b76] bg-[#eaf0ea] text-[#45614d]" : "border-[#e0e5e0]"}`}
            >
              Rent
              <span className="mt-1 block text-xs font-normal text-[#78847c]">
                Find new tenants
              </span>
            </button>
          </div>
        </div>
        <div className="max-w-xs">
          <Input
            label="Year built (optional)"
            value={property.constructionYear}
            type="number"
            onChange={(value) =>
              set("constructionYear", value ? Number(value) : null)
            }
            placeholder="e.g. 2018"
          />
        </div>
      </div>
    </Section>
  );
}
function StepDetails({
  property,
  set,
}: {
  property: PropertyPayload;
  set: <K extends keyof PropertyPayload>(
    key: K,
    value: PropertyPayload[K],
  ) => void;
}) {
  return (
    <Section
      title="The key details."
      description="The more precise the details, the better the AI can write."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label="Street and house number"
          value={property.address}
          onChange={(value) => set("address", value)}
          placeholder="e.g. 42 Bergmannstraße"
        />
        <Input
          label="Postal code"
          value={property.zipCode}
          onChange={(value) => set("zipCode", value)}
          placeholder="10961"
        />
        <Input
          label="City"
          value={property.city}
          onChange={(value) => set("city", value)}
          placeholder="Berlin"
        />
        <Input
          label="District / neighborhood"
          value={property.district}
          onChange={(value) => set("district", value)}
          placeholder="Kreuzberg"
        />
        <Input
          label="Living area (m²)"
          value={property.livingArea}
          type="number"
          onChange={(value) => set("livingArea", value ? Number(value) : null)}
          placeholder="92"
        />
        <Input
          label="Plot size (m²)"
          value={property.plotArea}
          type="number"
          onChange={(value) => set("plotArea", value ? Number(value) : null)}
          placeholder="Optional"
        />
        <Input
          label="Zimmer"
          value={property.rooms}
          type="number"
          onChange={(value) => set("rooms", value ? Number(value) : null)}
          placeholder="3"
        />
        <Input
          label="Bedrooms"
          value={property.bedrooms}
          type="number"
          onChange={(value) => set("bedrooms", value ? Number(value) : null)}
          placeholder="2"
        />
        <Input
          label="Bathrooms"
          value={property.bathrooms}
          type="number"
          onChange={(value) => set("bathrooms", value ? Number(value) : null)}
          placeholder="1"
        />
        <Input
          label="Floor"
          value={property.floor}
          onChange={(value) => set("floor", value)}
          placeholder="2. OG"
        />
        <Input
          label="Total floors"
          value={property.totalFloors}
          type="number"
          onChange={(value) => set("totalFloors", value ? Number(value) : null)}
          placeholder="5"
        />
        <Input
          label="Available from"
          value={property.availableFrom}
          onChange={(value) => set("availableFrom", value)}
          placeholder="immediately / 10/01/2026"
        />
        <Select
          label="Condition"
          value={property.condition}
          onChange={(value) => set("condition", value)}
          options={[
            ["", "Select an option"],
            ["new", "Like new"],
            ["renovated", "Renovated"],
            ["good", "Well maintained"],
            ["needs-renovation", "Needs renovation"],
          ]}
        />
      </div>
    </Section>
  );
}
function StepFinance({
  property,
  set,
}: {
  property: PropertyPayload;
  set: <K extends keyof PropertyPayload>(
    key: K,
    value: PropertyPayload[K],
  ) => void;
}) {
  const sale = property.transactionType === "sale";
  return (
    <Section
      title="The financial details."
      description="Optional details can be added later."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {sale ? (
          <>
            <Input
              label="Asking price"
              value={property.askingPrice}
              type="number"
              onChange={(value) =>
                set("askingPrice", value ? Number(value) : null)
              }
              placeholder="449000"
            />
            <Input
              label="Purchase costs"
              value={property.additionalCosts}
              type="number"
              onChange={(value) =>
                set("additionalCosts", value ? Number(value) : null)
              }
              placeholder="Optional"
            />
            <Input
              label="Commission"
              value={property.commission}
              onChange={(value) => set("commission", value)}
              placeholder="e.g. 3.57% incl. VAT"
            />
            <Input
              label="Service charge / month"
              value={property.hausgeld}
              type="number"
              onChange={(value) =>
                set("hausgeld", value ? Number(value) : null)
              }
              placeholder="Optional"
            />
          </>
        ) : (
          <>
            <Input
              label="Cold rent / month"
              value={property.coldRent}
              type="number"
              onChange={(value) =>
                set("coldRent", value ? Number(value) : null)
              }
              placeholder="1800"
            />
            <Input
              label="Additional costs / month"
              value={property.additionalCosts}
              type="number"
              onChange={(value) =>
                set("additionalCosts", value ? Number(value) : null)
              }
              placeholder="350"
            />
            <Input
              label="Total rent / month"
              value={property.askingPrice}
              type="number"
              onChange={(value) =>
                set("askingPrice", value ? Number(value) : null)
              }
              placeholder="2150"
            />
            <Input
              label="Deposit"
              value={property.deposit}
              type="number"
              onChange={(value) => set("deposit", value ? Number(value) : null)}
              placeholder="5400"
            />
          </>
        )}
      </div>
    </Section>
  );
}
function StepFeatures({
  property,
  set,
}: {
  property: PropertyPayload;
  set: <K extends keyof PropertyPayload>(
    key: K,
    value: PropertyPayload[K],
  ) => void;
}) {
  const toggle = (key: string) =>
    set(
      "selectedFeatures",
      property.selectedFeatures.includes(key)
        ? property.selectedFeatures.filter((item) => item !== key)
        : [...property.selectedFeatures, key],
    );
  return (
    <Section
      title="What makes this property special?"
      description="Select all features that apply."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {FEATURE_OPTIONS.map(([key, name]) => (
          <button
            key={key}
            onClick={() => toggle(key)}
            className={`rounded-xl border px-3 py-3 text-left text-xs font-bold ${property.selectedFeatures.includes(key) ? "border-[#6e8b76] bg-[#eaf0ea] text-[#45614d]" : "border-[#e0e5e0] bg-white text-[#66716a]"}`}
          >
            <span
              className={`mr-2 inline-block h-2 w-2 rounded-full ${property.selectedFeatures.includes(key) ? "bg-[#6f8d77]" : "bg-[#d4dbd4]"}`}
            />
            {name}
          </button>
        ))}
      </div>
      <div className="mt-7">
        <Textarea
          label="Additional features"
          value={property.additionalFeatures}
          onChange={(value) => set("additionalFeatures", value)}
          placeholder="e.g. custom lighting, premium fixtures …"
        />
      </div>
    </Section>
  );
}
function StepRooms({
  rooms,
  roomAdd,
  roomUpdate,
  roomRemove,
}: {
  rooms: Omit<PropertyRoom, "id">[];
  roomAdd: () => void;
  roomUpdate: (index: number, patch: Partial<Omit<PropertyRoom, "id">>) => void;
  roomRemove: (index: number) => void;
}) {
  return (
    <Section
      title="The rooms."
      description="Describe each room. The AI will turn them into a coherent tour."
    >
      <div className="space-y-4">
        {rooms.map((room, index) => (
          <div
            key={index}
            className="rounded-xl border border-[#e0e5e0] bg-[#fbfcfa] p-4"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-bold text-[#78917d]">
                RAUM {String(index + 1).padStart(2, "0")}
              </span>
              <button
                onClick={() => roomRemove(index)}
                className="btn-ghost text-[#a16e6e]"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Room name"
                value={room.name}
                onChange={(value) => roomUpdate(index, { name: value })}
                placeholder="Living room"
              />
              <Input
                label="Type"
                value={room.type}
                onChange={(value) => roomUpdate(index, { type: value })}
                placeholder="Living"
              />
              <Input
                label="Size (m²)"
                value={room.size}
                type="number"
                onChange={(value) =>
                  roomUpdate(index, { size: value ? Number(value) : null })
                }
                placeholder="32"
              />
            </div>
            <div className="mt-4">
              <Textarea
                label="Description"
                value={room.description}
                onChange={(value) => roomUpdate(index, { description: value })}
                placeholder="Large windows, access to the balcony …"
              />
            </div>
          </div>
        ))}
        <button
          onClick={roomAdd}
          className="btn btn-secondary flex w-full items-center justify-center gap-2 border-dashed"
        >
          <Plus size={16} /> Add room
        </button>
      </div>
    </Section>
  );
}
function StepLocation({
  property,
  set,
  onResolve,
  onAdjust,
  loading,
}: {
  property: PropertyPayload;
  set: <K extends keyof PropertyPayload>(
    key: K,
    value: PropertyPayload[K],
  ) => void;
  onResolve: () => void;
  onAdjust: (latitude: number, longitude: number) => void;
  loading: boolean;
}) {
  const [latitude, setLatitude] = useState<number | null>(property.exposeData?.location.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(property.exposeData?.location.longitude ?? null);
  const fields: [keyof PropertyPayload["surroundings"], string, string][] = [
    ["transport", "Public transport", "e.g. subway, bus, train"],
    ["schools", "Schools", "Schools and education"],
    ["childcare", "Childcare", "Childcare nearby"],
    ["shopping", "Shopping", "Supermarkets, markets …"],
    ["restaurants", "Restaurants", "Gastronomie und Cafés"],
    ["parks", "Parks & recreation", "Green spaces, sports …"],
    ["medical", "Medical care", "Doctors, pharmacies …"],
    ["highway", "Highway access", "Enter manually"],
    ["airport", "Airport", "Enter manually"],
  ];
  return (
    <Section
      title="The location, in your words."
      description="Only enter information you know for sure. We do not make anything up."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map(([key, label, placeholder]) => (
          <label key={key}>
            <span className="label">{label}</span>
            <input
              className="field"
              value={property.surroundings[key] || ""}
              placeholder={placeholder}
              onChange={(event) =>
                set("surroundings", {
                  ...property.surroundings,
                  [key]: event.target.value,
                })
              }
            />
          </label>
        ))}
      </div>
      <div className="mt-6">
        <Textarea
          label="What is special about this location?"
          value={property.locationNote}
          onChange={(value) => set("locationNote", value)}
          placeholder="Your personal notes about the neighborhood …"
        />
      </div>
      <div className="mt-8 rounded-2xl border border-[#dce5dd] bg-[#f7faf7] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="label">Standort prüfen</span>
            <p className="mt-1 text-sm text-[#66716a]">Die Adresse wird serverseitig geprüft. Der Standort kann danach bestätigt oder angepasst werden.</p>
          </div>
          <button onClick={onResolve} disabled={loading} className="btn btn-secondary flex items-center gap-2">
            {loading ? <LoaderCircle size={15} className="animate-spin" /> : <MapPin size={15} />} Standort ermitteln
          </button>
        </div>
        {property.exposeData?.location.intelligence && (
          <div className="mt-5 overflow-hidden rounded-xl border border-[#dce5dd] bg-white">
            {property.exposeData.location.intelligence.mapAsset?.url && <img src={property.exposeData.location.intelligence.mapAsset.url} alt="Standortkarte" className="h-56 w-full object-cover" />}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="text-sm">
                <b className="block text-[#45614d]">✓ Standort gefunden</b>
                <span className="mt-1 block text-xs text-[#78847c]">{property.exposeData.location.intelligence.formattedAddress || property.city}</span>
              </div>
              <div className="flex items-end gap-2">
                <label className="w-28"><span className="label">Breitengrad</span><input className="field" type="number" step="any" value={latitude ?? ""} onChange={(event) => setLatitude(event.target.value ? Number(event.target.value) : null)} /></label>
                <label className="w-28"><span className="label">Längengrad</span><input className="field" type="number" step="any" value={longitude ?? ""} onChange={(event) => setLongitude(event.target.value ? Number(event.target.value) : null)} /></label>
                <button onClick={() => latitude != null && longitude != null && onAdjust(latitude, longitude)} disabled={loading || latitude == null || longitude == null} className="text-xs font-bold text-[#607b68]">Standort anpassen</button>
              </div>
            </div>
            {property.exposeData.location.intelligence.source === "manual" && <p className="px-4 pb-4 text-xs text-[#607b68]">Manuell angepasster Standort</p>}
          </div>
        )}
      </div>
    </Section>
  );
}
function StepPhotos({
  images,
  fileInput,
  upload,
  removeImage,
  cover,
  moveImage,
}: {
  images: Property["images"];
  fileInput: React.RefObject<HTMLInputElement | null>;
  upload: (files: FileList | null) => void;
  removeImage: (id: string) => void;
  cover: (id: string) => void;
  moveImage: (index: number, direction: -1 | 1) => void;
}) {
  return (
    <Section
      title="Show what you mean."
      description="Upload your best property photos. The first image is automatically the cover image."
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => upload(event.target.files)}
      />
      <button
        onClick={() => fileInput.current?.click()}
        className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#b9c9bb] bg-[#f7faf7] px-6 py-12 text-center transition hover:bg-[#eef5ee]"
      >
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-[#deebdf] text-[#607b68]">
          <Upload size={20} />
        </span>
        <b className="text-sm">Drag photos here or choose files</b>
        <span className="mt-2 text-xs text-[#7e8b82]">
          JPG, PNG oder WEBP · max. 15 MB pro Bild
        </span>
      </button>
      <div className="mt-6 flex items-center justify-between text-xs text-[#718078]">
        <span>
          {images.length} {images.length === 1 ? "photo" : "photos"} uploaded
        </span>
        {images.length > 0 && (
          <span className="flex items-center gap-1 text-[#607b68]">
            <Check size={13} /> Cover image selected
          </span>
        )}
      </div>
      {images.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image, index) => (
            <div
              key={image.id}
              className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-[#dce5dd]"
            >
              <img
                src={image.url}
                alt={image.fileName}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-x-2 top-2 flex justify-between">
                <button
                  onClick={() => cover(image.id)}
                  className={`rounded-full px-2 py-1 text-[10px] font-bold backdrop-blur ${image.isCover ? "bg-white text-[#4d6b55]" : "bg-[#202522b8] text-white"}`}
                >
                  {image.isCover ? "Cover image" : "Set as cover"}
                </button>
                <button
                  onClick={() => removeImage(image.id)}
                  className="grid h-7 w-7 place-items-center rounded-full bg-[#202522b8] text-white"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="absolute inset-x-2 bottom-2 flex justify-between opacity-0 transition group-hover:opacity-100">
                <button
                  onClick={() => moveImage(index, -1)}
                  disabled={index === 0}
                  className="grid h-7 w-7 place-items-center rounded-full bg-white/90"
                >
                  <ChevronUp size={14} />
                </button>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#202522b8] text-white">
                  <GripVertical size={13} />
                </span>
                <button
                  onClick={() => moveImage(index, 1)}
                  disabled={index === images.length - 1}
                  className="grid h-7 w-7 place-items-center rounded-full bg-white/90"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-5 flex items-center gap-2 text-xs text-[#8a958d]">
        <ImagePlus size={14} /> Tip: Use different perspectives for a lively
        gallery.
      </p>
    </Section>
  );
}
function Review({
  property,
  images,
  onEdit,
}: {
  property: PropertyPayload;
  images: Property["images"];
  onEdit: (step: number) => void;
}) {
  const rows = [
    [
      "Property",
      `${property.propertyType} · ${property.transactionType === "sale" ? "Sale" : "Rent"}`,
      0,
    ],
    [
      "Details",
      [
        property.city,
        property.livingArea && `${property.livingArea} m²`,
        property.rooms && `${property.rooms} Zimmer`,
      ]
        .filter(Boolean)
        .join(" · "),
      1,
    ],
    [
      "Finances",
      property.transactionType === "sale"
        ? money(property.askingPrice)
        : money(property.coldRent),
      2,
    ],
    ["Features", `${property.selectedFeatures.length} selected`, 3],
    ["Rooms", `${property.roomsData.length} rooms`, 4],
    ["Location", property.locationNote || property.city || "No details yet", 5],
    ["Photos", `${images.length} images`, 6],
  ] as [string, string, number][];
  return (
    <Section
      title="Everything at a glance."
      description="Review your details before the AI creates the text."
    >
      <div className="space-y-2">
        {rows.map(([name, value, index]) => (
          <button
            key={name}
            onClick={() => onEdit(index)}
            className="flex w-full items-center justify-between rounded-xl border border-[#e2e6e1] bg-white px-4 py-4 text-left transition hover:border-[#91aa97]"
          >
            <span className="text-sm font-bold">{name}</span>
            <span className="mr-3 text-xs text-[#78847c]">{pretty(value)}</span>
            <ArrowRight size={15} className="text-[#91aa97]" />
          </button>
        ))}
      </div>
      <div className="mt-7 rounded-xl bg-[#eaf0ea] p-5">
        <div className="flex gap-3">
          <Sparkles className="mt-0.5 shrink-0 text-[#607b68]" size={18} />
          <div>
            <b className="text-sm text-[#45614d]">
              Ready for the finishing touch?
            </b>
            <p className="mt-1 text-xs leading-5 text-[#607b68]">
              The AI improves your wording only. Facts and location details
              remain traceable and unchanged.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
function ContentEditor({
  content,
  setContent,
  onGenerate,
  onPreview,
  loading,
  saving,
}: {
  content: ExposeContent | null;
  setContent: (content: ExposeContent) => void;
  onGenerate: (action?: string) => void;
  onPreview: () => void;
  loading: boolean;
  saving: boolean;
}) {
  if (!content)
    return (
      <Section
        title="Your exposé is being prepared."
        description="The AI is creating your first draft."
      >
        <div className="flex items-center gap-3 text-sm text-[#718078]">
          <LoaderCircle className="animate-spin" size={17} /> One moment please
          …
        </div>
      </Section>
    );
  const update = (patch: Partial<ExposeContent>) =>
    setContent({ ...content, ...patch });
  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold tracking-[.18em] text-[#607b68]">
            AI DRAFT
          </p>
          <h2 className="serif mt-2 text-3xl">
            Now make it yours.
          </h2>
        </div>
        <span className="flex items-center gap-2 text-xs text-[#607b68]">
          <span className="h-2 w-2 rounded-full bg-[#84a28b]" /> Every field
          is editable
        </span>
      </div>
      <div className="card bg-white p-5 sm:p-8">
        <div className="mb-7 flex items-start justify-between">
          <div>
            <span className="label">Title</span>
            <input
              className="field serif text-xl"
              value={content.title}
              onChange={(event) => update({ title: event.target.value })}
            />
          </div>
          <Sparkles className="mt-5 text-[#84a28b]" size={18} />
        </div>
        <div className="grid gap-6">
          <Textarea
            label="Short description"
            value={content.shortDescription}
            onChange={(value) => update({ shortDescription: value })}
          />
          <Textarea
            label="Main description"
            value={content.mainDescription}
            onChange={(value) => update({ mainDescription: value })}
          />
          <label>
            <span className="label">Portal title</span>
            <input
              className="field"
              value={content.portalTitle}
              onChange={(event) => update({ portalTitle: event.target.value })}
            />
          </label>
          <div>
            <span className="label">Highlights</span>
            <div className="space-y-2">
              {content.highlights.map((highlight, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    className="field"
                    value={highlight}
                    onChange={(event) =>
                      update({
                        highlights: content.highlights.map((item, itemIndex) =>
                          itemIndex === index ? event.target.value : item,
                        ),
                      })
                    }
                  />
                  <button
                    onClick={() =>
                      update({
                        highlights: content.highlights.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      })
                    }
                    className="btn-ghost"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() =>
                update({ highlights: [...content.highlights, ""] })
              }
              className="mt-2 flex items-center gap-1 text-xs font-bold text-[#607b68]"
            >
              <Plus size={14} /> Add highlight
            </button>
          </div>
          <div>
            <span className="label">Rooms</span>
            <div className="space-y-3">
              {content.roomDescriptions.map((room, index) => (
                <div key={room.roomId} className="rounded-xl bg-[#f7faf7] p-4">
                  <b className="text-sm">{room.name}</b>
                  <textarea
                    className="field mt-3 min-h-20 bg-white"
                    value={room.description}
                    onChange={(event) =>
                      update({
                        roomDescriptions: content.roomDescriptions.map(
                          (item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, description: event.target.value }
                              : item,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
          <Textarea
            label="Location description"
            value={content.locationDescription}
            onChange={(value) => update({ locationDescription: value })}
          />
          <label>
            <span className="label">Target audience</span>
            <input
              className="field"
              value={content.targetAudience}
              onChange={(event) =>
                update({ targetAudience: event.target.value })
              }
            />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onGenerate("Regenerate the text")}
          className="btn btn-secondary flex items-center gap-2"
          disabled={loading}
        >
          {loading ? (
            <LoaderCircle size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}{" "}
          Regenerate
        </button>
        <button
          onClick={() => onGenerate("Make the text more professional")}
          className="btn btn-secondary"
          disabled={loading}
        >
          More professional
        </button>
        <button
          onClick={() => onGenerate("Make the text shorter")}
          className="btn btn-secondary"
          disabled={loading}
        >
          Shorter
        </button>
        <button
          onClick={() => onGenerate("Give the text a premium tone")}
          className="btn btn-secondary"
          disabled={loading}
        >
          Premium tone
        </button>
        <button
          onClick={onPreview}
          className="btn btn-primary ml-auto flex items-center gap-2"
          disabled={saving}
        >
          <FileText size={15} /> Open preview <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
