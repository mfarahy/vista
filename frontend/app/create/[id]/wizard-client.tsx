'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FileText, LoaderCircle, Sparkles, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type {
  BorisEnrichment,
  DocumentRecord,
  EnergyData,
  ExposeContent,
  ExposeData,
  ExternalFacility,
  ExternalGeocoding,
  ExternalResearch,
  Property,
  PropertyPayload,
  StructuredAddress,
} from './types';
import { STEPS, PROPERTY_TYPES, emptyExposeData, initialPayload } from './types';
import { StepAddress, StepProperty, StepDetails } from './components/basic-steps';
import { StepFeatures, StepEnergy, StepAgent } from './components/feature-steps';
import { StepPhotos, StepPlans } from './components/media-steps';
import { StepDocuments } from './components/documents-step';
import { Review, ContentEditor } from './components/review';
import { AddressDebugPanel } from './components/debug';

export default function WizardClient({ initialProperty }: { initialProperty: Property }) {
  const router = useRouter();
  const [property, setProperty] = useState<PropertyPayload>(initialPayload(initialProperty));
  const [images, setImages] = useState(initialProperty.images);
  const [content, setContent] = useState<ExposeContent | null>(
    initialProperty.expose?.content ?? null,
  );
  const [step, setStep] = useState(content ? 11 : 0);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const initialAddress = property.exposeData?.basicInformation.address ?? {};
  const [addressQuery, setAddressQuery] = useState(
    initialAddress.formattedAddress ||
      [
        initialAddress.street,
        initialAddress.houseNumber,
        initialAddress.postalCode,
        initialAddress.city,
      ]
        .filter(Boolean)
        .join(', '),
  );
  const [addressSuggestions, setAddressSuggestions] = useState<StructuredAddress[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState('');
  const [addressSelected, setAddressSelected] = useState(
    Boolean(initialAddress.houseNumber && initialAddress.postalCode && initialAddress.city),
  );
  const [boris, setBoris] = useState<BorisEnrichment | null>(null);
  const [borisLoading, setBorisLoading] = useState(false);

  useEffect(() => {
    if (addressSelected || addressQuery.trim().length < 3) {
      setAddressSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAddressLoading(true);
      setAddressError('');
      try {
        const response = await apiFetch(
          `/api/address/suggestions?q=${encodeURIComponent(addressQuery.trim())}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error('Address lookup is currently unavailable.');
        setAddressSuggestions(await response.json());
      } catch (lookupError) {
        if (!controller.signal.aborted)
          setAddressError(
            lookupError instanceof Error ? lookupError.message : 'Address lookup failed.',
          );
      } finally {
        if (!controller.signal.aborted) setAddressLoading(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [addressQuery, addressSelected]);

  function selectAddress(address: StructuredAddress) {
    const nextAddress = { ...address, country: address.country || 'Deutschland' };
    setAddressQuery(
      [
        [address.street, address.houseNumber].filter(Boolean).join(' '),
        [address.postalCode, address.city].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(', '),
    );
    setAddressSuggestions([]);
    setAddressSelected(true);
    setProperty((current) => ({
      ...current,
      address: [address.street, address.houseNumber].filter(Boolean).join(' '),
      zipCode: address.postalCode,
      city: address.city,
      district: address.district,
      exposeData: {
        ...current.exposeData!,
        basicInformation: { ...current.exposeData!.basicInformation, address: nextAddress },
        location: {
          ...current.exposeData!.location,
          address: nextAddress,
          district: address.district,
          latitude: address.latitude,
          longitude: address.longitude,
        },
      },
    }));
    fetchBorisEnrichment(address.latitude, address.longitude);
  }

  async function fetchBorisEnrichment(latitude?: number | null, longitude?: number | null) {
    setBorisLoading(true);
    try {
      const response = await apiFetch(`/api/properties/${initialProperty.id}/location/boris`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(latitude != null && longitude != null ? { latitude, longitude } : {}),
      });
      const data = await response.json();
      setBoris(data);
      // Use the BORIS value as an editable default only when the user has not entered one yet.
      if (data?.available && Number.isFinite(data?.bodenrichtwert?.value)) {
        setProperty((current) => {
          if (current.bodenrichtwert != null) return current;
          const value = data.bodenrichtwert.value as number;
          return {
            ...current,
            bodenrichtwert: value,
            exposeData: {
              ...current.exposeData!,
              propertyDetails: { ...current.exposeData!.propertyDetails, bodenrichtwert: value },
            },
          };
        });
      }
    } catch {
      setBoris(null);
    } finally {
      setBorisLoading(false);
    }
  }

  function formatDistance(meters: number) {
    if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
    return `${(meters / 1000).toLocaleString('de-DE', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} km`;
  }

  function facilityList(items: ExternalFacility[] = []) {
    return items
      .slice(0, 3)
      .map((place) =>
        place.name ? `${place.name} (${formatDistance(place.distanceMeters ?? 0)})` : '',
      )
      .filter(Boolean)
      .join(', ');
  }

  function surroundingsFromFacilities(facilities: ExternalGeocoding['facilities']) {
    const surroundings: Record<string, string> = {};
    if (facilities?.transport?.length) surroundings.transport = facilityList(facilities.transport);
    if (facilities?.shopping?.length) surroundings.shopping = facilityList(facilities.shopping);
    const restaurants = facilities?.dailyLife?.filter(
      (place) => place.category === 'restaurant' || place.category === 'cafe',
    );
    if (restaurants?.length) surroundings.restaurants = facilityList(restaurants);
    const parks = facilities?.recreation?.filter(
      (place) => place.category === 'park' || place.category === 'playground',
    );
    if (parks?.length) surroundings.parks = facilityList(parks);
    const schools = facilities?.education?.filter((place) => place.category === 'school');
    if (schools?.length) surroundings.schools = facilityList(schools);
    const childcare = facilities?.education?.filter((place) => place.category === 'kindergarten');
    if (childcare?.length) surroundings.childcare = facilityList(childcare);
    if (facilities?.healthcare?.length) surroundings.medical = facilityList(facilities.healthcare);
    return surroundings;
  }

  function applyExternalData(raw: Record<string, unknown>) {
    const geocoding = raw.geocoding as ExternalGeocoding | undefined;
    const research = raw.research as ExternalResearch | undefined;
    const hasGeocoding = Boolean(geocoding?.coordinates || geocoding?.summary || geocoding?.facilities);
    if (!hasGeocoding && !research) return;
    setProperty((current) => {
      const data = current.exposeData ?? emptyExposeData(initialProperty);
      const basicAddress = { ...data.basicInformation.address };
      const location = { ...data.location };
      const surroundings = { ...current.surroundings };
      let changed = false;

      if (geocoding?.coordinates) {
        if (location.latitude == null && Number.isFinite(geocoding.coordinates.latitude)) {
          location.latitude = geocoding.coordinates.latitude;
          changed = true;
        }
        if (location.longitude == null && Number.isFinite(geocoding.coordinates.longitude)) {
          location.longitude = geocoding.coordinates.longitude;
          changed = true;
        }
      }
      if (geocoding?.address?.district && !basicAddress.district) {
        basicAddress.district = geocoding.address.district;
        location.district = geocoding.address.district;
        changed = true;
      }
      for (const [key, value] of Object.entries(surroundingsFromFacilities(geocoding?.facilities))) {
        if (!surroundings[key] && value) {
          surroundings[key] = value;
          changed = true;
        }
      }
      if (!current.locationNote) {
        const researchNote = [research?.mikrolage?.summary, research?.makrolage?.summary]
          .filter(Boolean)
          .join(' ');
        const note = geocoding?.summary || researchNote || location.description;
        if (note) {
          location.description = note;
          changed = true;
        }
      }
      if (!changed) return current;
      return {
        ...current,
        district: basicAddress.district ?? current.district,
        surroundings,
        locationNote: location.description ?? current.locationNote,
        exposeData: {
          ...data,
          basicInformation: { ...data.basicInformation, address: basicAddress },
          location,
        },
      };
    });
  }

  function applyExtractedDocuments(records: DocumentRecord[]) {
    const address: Partial<StructuredAddress> = {};
    const flat: Partial<PropertyPayload> = {};
    const featureSet = new Set<string>();
    let energyClass: string | null = null;
    let energyConsumption: number | null = null;
    let energyDemand: number | null = null;
    let heatingType: string | null = null;
    let yearOfConstruction: number | null = null;

    for (const record of records) {
      if (record.status !== 'completed' || !record.analysisResult) continue;
      // Prefer the AI understanding result; fall back to the rule-based OCR
      // fields when understanding is unavailable.
      const understanding = record.understandingResult;
      const candidates = understanding?.wizardFields?.length
        ? understanding.wizardFields.map((field) => ({
            field: field.field,
            value: field.value,
            sourceDocumentId: record.id,
          }))
        : record.analysisResult.fields;
      for (const field of candidates) {
        const value = field.value;
        if (value === null || value === undefined || value === '') continue;
        switch (field.field) {
          case 'street':
            if (!address.street) address.street = String(value);
            break;
          case 'houseNumber':
            if (!address.houseNumber) address.houseNumber = String(value);
            break;
          case 'postalCode':
            if (!address.postalCode) address.postalCode = String(value);
            break;
          case 'city':
            if (!address.city) address.city = String(value);
            break;
          case 'district':
            if (!address.district) address.district = String(value);
            break;
          case 'state':
            if (!address.state) address.state = String(value);
            break;
          case 'country':
            if (!address.country) address.country = String(value);
            break;
          case 'propertyType':
            if (!flat.propertyType && PROPERTY_TYPES.some(([key]) => key === value)) {
              flat.propertyType = value as PropertyPayload['propertyType'];
            }
            break;
          case 'livingArea':
            if (flat.livingArea == null) flat.livingArea = Number(value);
            break;
          case 'plotArea':
            if (flat.plotArea == null) flat.plotArea = Number(value);
            break;
          case 'rooms':
            if (flat.rooms == null) flat.rooms = Number(value);
            break;
          case 'bedrooms':
            if (flat.bedrooms == null) flat.bedrooms = Number(value);
            break;
          case 'bathrooms':
            if (flat.bathrooms == null) flat.bathrooms = Number(value);
            break;
          case 'yearBuilt':
            if (flat.constructionYear == null) flat.constructionYear = Number(value);
            break;
          case 'numberOfFloors':
            if (flat.totalFloors == null) flat.totalFloors = Number(value);
            break;
          case 'floor':
            if (!flat.floor) flat.floor = String(value);
            break;
          case 'energyClass':
            if (!energyClass) energyClass = String(value);
            break;
          case 'energyConsumption':
            if (energyConsumption == null) energyConsumption = Number(value);
            break;
          case 'energyDemand':
            if (energyDemand == null) energyDemand = Number(value);
            break;
          case 'heatingType':
            if (!heatingType) heatingType = String(value);
            break;
          case 'yearOfConstruction':
            if (yearOfConstruction == null) yearOfConstruction = Number(value);
            break;
          case 'basement':
            if (value === true) featureSet.add('basement');
            break;
          case 'parking':
            if (value === true) featureSet.add('parking');
            break;
          case 'garage':
            if (value === true) featureSet.add('garage');
            break;
          case 'balcony':
            if (value === true) featureSet.add('balcony');
            break;
          case 'terrace':
            if (value === true) featureSet.add('terrace');
            break;
          case 'garden':
            if (value === true) featureSet.add('garden');
            break;
          default:
            break;
        }
      }
    }

    const hasData =
      Object.keys(address).length ||
      Object.keys(flat).length ||
      featureSet.size ||
      energyClass ||
      energyConsumption != null ||
      energyDemand != null ||
      heatingType ||
      yearOfConstruction != null;
    if (!hasData) return;

    setProperty((current) => {
      const next = { ...current };
      const data = next.exposeData ?? emptyExposeData(initialProperty);

      if (Object.keys(address).length) {
        const mergedAddress = { ...data.basicInformation.address, ...address };
        data.basicInformation = { ...data.basicInformation, address: mergedAddress };
        data.location = { ...data.location, address: mergedAddress };
      }
      if (address.city && !next.city) next.city = address.city;
      if (address.postalCode && !next.zipCode) next.zipCode = address.postalCode;
      if (address.district && !next.district) next.district = address.district;
      if (address.street && !next.address)
        next.address = [address.street, address.houseNumber].filter(Boolean).join(' ');

      if (flat.propertyType && next.propertyType !== flat.propertyType) {
        next.propertyType = flat.propertyType;
        data.basicInformation = { ...data.basicInformation, propertyType: flat.propertyType };
      }
      if (flat.livingArea != null && next.livingArea == null) next.livingArea = flat.livingArea;
      if (flat.plotArea != null && next.plotArea == null) next.plotArea = flat.plotArea;
      if (flat.rooms != null && next.rooms == null) next.rooms = flat.rooms;
      if (flat.bedrooms != null && next.bedrooms == null) next.bedrooms = flat.bedrooms;
      if (flat.bathrooms != null && next.bathrooms == null) next.bathrooms = flat.bathrooms;
      if (flat.constructionYear != null && next.constructionYear == null)
        next.constructionYear = flat.constructionYear;
      if (flat.totalFloors != null && next.totalFloors == null)
        next.totalFloors = flat.totalFloors;
      if (flat.floor && !next.floor) next.floor = flat.floor;

      for (const feature of featureSet) {
        if (!next.selectedFeatures.includes(feature))
          next.selectedFeatures = [...next.selectedFeatures, feature];
      }

      if (
        energyClass ||
        energyConsumption != null ||
        energyDemand != null ||
        heatingType ||
        yearOfConstruction != null
      ) {
        const primaryEnergySource = heatingType
          ? (heatingType.toLowerCase().replace('heizung', '').trim() as EnergyData['primaryEnergySource'])
          : undefined;
        data.energy = {
          ...data.energy,
          ...(energyClass ? { efficiencyClass: energyClass } : {}),
          ...(energyConsumption != null ? { finalEnergyConsumption: energyConsumption } : {}),
          ...(energyDemand != null ? { finalEnergyDemand: energyDemand } : {}),
          ...(yearOfConstruction != null ? { yearOfConstruction } : {}),
          ...(primaryEnergySource ? { primaryEnergySource } : {}),
        } as EnergyData;
      }

      data.propertyDetails = {
        ...data.propertyDetails,
        livingArea: next.livingArea,
        plotArea: next.plotArea,
        rooms: next.rooms,
        bathrooms: next.bathrooms,
        yearBuilt: next.constructionYear,
        floor: next.floor ?? data.propertyDetails.floor,
        numberOfFloors: next.totalFloors,
      };

      return { ...next, exposeData: data };
    });

    if (!addressSelected && (address.street || address.city)) {
      setAddressQuery(
        [
          [address.street, address.houseNumber].filter(Boolean).join(' '),
          [address.postalCode, address.city].filter(Boolean).join(' '),
        ]
          .filter(Boolean)
          .join(', '),
      );
    }
  }

  function set<K extends keyof PropertyPayload>(key: K, value: PropertyPayload[K]) {
    setProperty((current) => {
      const next = { ...current, [key]: value };
      const data = next.exposeData ?? emptyExposeData(initialProperty);
      // Keep the canonical exposeData in sync with the legacy flat fields edited here.
      if (key === 'address' || key === 'zipCode' || key === 'city' || key === 'district') {
        const address = {
          ...data.basicInformation.address,
          street: next.address,
          postalCode: next.zipCode,
          city: next.city,
          district: next.district,
        };
        data.basicInformation = { ...data.basicInformation, address };
        data.location = { ...data.location, address, district: address.district };
      }
      data.propertyDetails = {
        ...data.propertyDetails,
        livingArea: next.livingArea,
        plotArea: next.plotArea,
        rooms: next.rooms,
        bathrooms: next.bathrooms,
        yearBuilt: next.constructionYear,
        floor: next.floor,
        numberOfFloors: next.totalFloors,
        bodenrichtwert: next.bodenrichtwert,
      };
      data.pricing = {
        ...data.pricing,
        purchasePrice:
          next.transactionType === 'sale' ? next.askingPrice : data.pricing.purchasePrice,
        rentPrice:
          next.transactionType === 'rent'
            ? (next.coldRent ?? next.askingPrice)
            : data.pricing.rentPrice,
        additionalCosts: next.additionalCosts,
        buyerCommission: next.commission,
      };
      return { ...next, exposeData: data };
    });
  }
  function updateExposeData(patch: Partial<ExposeData>) {
    setProperty((current) => ({ ...current, exposeData: { ...current.exposeData!, ...patch } }));
  }
  const sectionNotes = property.exposeData?.additionalInformation?.notes ?? {};
  const noteValue = (key: string) => sectionNotes[key] ?? '';
  const setNote = (key: string, value: string) => {
    const notes = { ...sectionNotes, [key]: value };
    const additionalInformation = {
      ...property.exposeData?.additionalInformation,
      notes,
    };
    updateExposeData({ additionalInformation });
  };
  const [metadataLoading, setMetadataLoading] = useState(false);
  async function generateMetadata() {
    setMetadataLoading(true);
    setError('');
    const response = await apiFetch(`/api/properties/${initialProperty.id}/ai/metadata`, {
      method: 'POST',
    });
    const result = await response.json();
    if (!response.ok) setError(result.error || 'The AI could not generate a title.');
    else
      updateExposeData({
        basicInformation: {
          ...property.exposeData!.basicInformation,
          title: result.title,
          propertySubtype: result.subtitle,
        },
      });
    setMetadataLoading(false);
  }

  async function save() {
    setSaving(true);
    setError('');
    const response = await apiFetch(`/api/properties/${initialProperty.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(property),
    });
    if (!response.ok) setError('The details could not be saved.');
    setSaving(false);
  }

  async function next() {
    if (step === 1 && !addressSelected) {
      setError('Please select an exact address from the suggestions before continuing.');
      return;
    }
    await save();
    setStep((current) => Math.min(current + 1, 9));
  }

  async function generate(action = '') {
    await save();
    setAiLoading(true);
    setError('');
    const response = await apiFetch(`/api/properties/${initialProperty.id}/ai/improve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error || 'The AI could not create the text.');
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
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(content),
    });
    if (response.ok) router.push(`/preview/${initialProperty.id}`);
    else setError('The content could not be saved.');
    setSaving(false);
  }

  async function upload(
    files: FileList | null,
    meta: {
      category: 'exterior' | 'interior' | 'floor_plan' | 'document';
      subcategory?: string;
      caption?: string;
    },
  ) {
    if (!files?.length) return;
    setError('');
    const body = new FormData();
    [...files].forEach((file) => body.append('files', file));
    body.append('category', meta.category);
    if (meta.subcategory) body.append('subcategory', meta.subcategory);
    if (meta.caption) body.append('caption', meta.caption);
    const response = await apiFetch(`/api/properties/${initialProperty.id}/images`, {
      method: 'POST',
      body,
    });
    const result = await response.json();
    if (!response.ok) setError(result.error);
    else setImages((current) => [...current, ...result]);
  }

  async function removeImage(id: string) {
    try {
      const response = await apiFetch(`/api/properties/${initialProperty.id}/images/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) setImages((current) => current.filter((image) => image.id !== id));
      else setError('The image could not be removed.');
    } catch {
      setError('The image could not be removed.');
    }
  }

  async function cover(id: string) {
    try {
      const response = await apiFetch(`/api/properties/${initialProperty.id}/images/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover: true }),
      });
      if (response.ok) setImages(await response.json());
      else setError('The cover could not be updated.');
    } catch {
      setError('The cover could not be updated.');
    }
  }

  async function moveImage(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= images.length) return;
    const reordered = [...images];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setImages(reordered.map((image, sequence) => ({ ...image, sequence })));
    try {
      const response = await apiFetch(`/api/properties/${initialProperty.id}/images/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageIds: reordered.map((image) => image.id) }),
      });
      if (!response.ok) setError('The image order could not be saved.');
    } catch {
      setError('The image order could not be saved.');
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f6f3]">
      <header className="flex items-center justify-between border-b border-[#e0e5e0] bg-white px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#202522] font-serif text-white">
            R
          </span>
          <span className="hidden text-sm font-bold tracking-[.16em] sm:block">RAUMWERK</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-[#7a877e] sm:block">
            {saving ? 'Saving…' : 'Saved automatically'}
          </span>
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
          <nav
            className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5 lg:mb-0 lg:block lg:space-y-2"
            aria-label="Wizard steps"
          >
            {STEPS.map((name, index) => (
              <button
                key={name}
                onClick={() => index <= step && setStep(index)}
                disabled={index > step}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left text-xs font-bold transition ${index === step ? 'border-[#202522] bg-[#202522] text-white' : index < step ? 'border-[#c5d3c7] bg-[#edf3ee] text-[#48624f]' : 'border-[#e0e5e0] bg-white text-[#aab4ac]'}`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[11px] ${index < step ? 'border-[#78917d] bg-[#78917d] text-white' : index === step ? 'border-white/30 bg-white/10 text-white' : 'border-[#d7ded8] bg-white'}`}
                >
                  {index < step ? <Check size={14} /> : `0${index + 1}`}
                </span>
                <span className="min-w-0 leading-4">{name}</span>
              </button>
            ))}
          </nav>
          <div className="min-w-0">
            {error && (
              <div className="mb-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
                <button onClick={() => setError('')}>
                  <X size={16} />
                </button>
              </div>
            )}
            {step < 10 ? (
              <div className="step-enter">
                {step === 0 && (
                  <StepDocuments
                    propertyId={initialProperty.id}
                    onExtracted={applyExtractedDocuments}
                  />
                )}
                {step === 1 && (
                  <StepAddress
                    query={addressQuery}
                    suggestions={addressSuggestions}
                    loading={addressLoading}
                    lookupError={addressError}
                    selected={addressSelected}
                    onQueryChange={(value) => {
                      setAddressQuery(value);
                      setAddressSelected(false);
                    }}
                    onSelect={selectAddress}
                    address={property.exposeData!.basicInformation.address}
                  />
                )}
                {step === 1 && addressSelected && (
                  <AddressDebugPanel
                    propertyId={initialProperty.id}
                    property={property}
                    address={property.exposeData!.basicInformation.address}
                    onData={applyExternalData}
                  />
                )}
                {step === 2 && (
                  <StepProperty
                    property={property}
                    set={set}
                    exposeData={property.exposeData!}
                    updateExposeData={updateExposeData}
                    noteValue={noteValue}
                    setNote={setNote}
                  />
                )}
                {step === 3 && (
                  <StepDetails
                    property={property}
                    set={set}
                    boris={boris}
                    borisLoading={borisLoading}
                    noteValue={noteValue}
                    setNote={setNote}
                  />
                )}
                {step === 4 && (
                  <StepFeatures
                    property={property}
                    set={set}
                    exposeData={property.exposeData!}
                    updateExposeData={updateExposeData}
                    noteValue={noteValue}
                    setNote={setNote}
                  />
                )}
                {step === 5 && (
                  <StepEnergy
                    data={property.exposeData!.energy}
                    update={(energy) => updateExposeData({ energy })}
                    noteValue={noteValue}
                    setNote={setNote}
                  />
                )}
                {step === 6 && (
                  <StepPhotos
                    images={images}
                    rooms={property.rooms}
                    upload={upload}
                    removeImage={removeImage}
                    cover={cover}
                    moveImage={moveImage}
                    noteValue={noteValue}
                    setNote={setNote}
                  />
                )}
                {step === 7 && (
                  <StepPlans
                    images={images}
                    upload={upload}
                    removeImage={removeImage}
                    cover={cover}
                    moveImage={moveImage}
                    noteValue={noteValue}
                    setNote={setNote}
                  />
                )}
                {step === 8 && (
                  <StepAgent
                    data={property.exposeData!.agent}
                    update={(agent) => updateExposeData({ agent })}
                    noteValue={noteValue}
                    setNote={setNote}
                  />
                )}
                {step === 9 && (
                  <Review
                    property={property}
                    images={images}
                    onEdit={setStep}
                    generateMetadata={generateMetadata}
                    metadataLoading={metadataLoading}
                    updateExposeData={updateExposeData}
                    noteValue={noteValue}
                  />
                )}
              </div>
            ) : (
              <ContentEditor
                content={content}
                setContent={setContent}
                onGenerate={generate}
                loading={aiLoading}
                saving={saving}
              />
            )}
          </div>
        </div>
        <div className="mt-10 flex border-t border-[#e0e5e0] pt-5 lg:ml-[250px]">
          <button
            className="btn btn-ghost flex items-center gap-2"
            disabled={step === 0}
            onClick={() => setStep((current) => current - 1)}
          >
            <ArrowLeft size={15} /> Back
          </button>
          {step < 9 ? (
            <button className="btn btn-primary flex items-center gap-2" onClick={next}>
              {saving ? 'Saving…' : 'Next'} <ArrowRight size={15} />
            </button>
          ) : step === 9 ? (
            <button
              className="btn btn-primary flex items-center gap-2"
              onClick={() => generate()}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Sparkles size={15} />
              )}{' '}
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
