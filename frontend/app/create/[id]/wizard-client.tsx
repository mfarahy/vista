'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, FileText, LoaderCircle, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { VistaLogoLink } from '@/components/vista-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
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
  MarketingContent,
  PhotoUnderstanding,
  Property,
  PropertyPayload,
  StructuredAddress,
} from './types';
import { STEPS, PROPERTY_TYPES, emptyExposeData, initialPayload } from './types';
import {
  collectAdditionalInformation,
  collectWizardFieldCandidates,
  computeWizardPrefills,
  groupAdditionalByKey,
  groupCandidatesByField,
  wizardCurrentValues,
  type AdditionalInfoCandidate,
  type WizardFieldCandidate,
} from './document-prefill';
import { buildReviewIssues, type ReviewIssue } from './review-checklist';
import {
  stepStatus,
  stepStatusLabel,
  normalizeCertificateType,
  normalizeEnergySource,
  type WizardStepStatus,
} from './wizard-steps';
import { StepBuilding, StepProperty, type AddressFieldState } from './components/basic-steps';
import { StepEnergy, StepFeatures, StepAgent } from './components/feature-steps';
import {
  StepFinancial,
  StepLegal,
  StepLocation,
  StepYourInformation,
} from './components/financial-steps';
import { StepPhotos, StepPlans } from './components/media-steps';
import { StepDocuments } from './components/documents-step';
import { StepMarketingContent } from './components/marketing-steps';
import { Review, ContentEditor } from './components/review';
import { useI18n } from '@/lib/i18n';

const REVIEW_STEP = 13;
const CONTENT_STEP = 14;

export default function WizardClient({ initialProperty }: { initialProperty: Property }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [property, setProperty] = useState<PropertyPayload>(initialPayload(initialProperty));
  const [images, setImages] = useState(initialProperty.images);
  const [content, setContent] = useState<ExposeContent | null>(
    initialProperty.expose?.content ?? null,
  );
  const [marketingContent, setMarketingContent] = useState<MarketingContent | null>(
    initialProperty.marketingContent ?? null,
  );
  const [step, setStep] = useState(content ? CONTENT_STEP : 0);
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
  const [fieldSources, setFieldSources] = useState<Record<string, WizardFieldCandidate[]>>({});
  const [additionalInfoByKey, setAdditionalInfoByKey] = useState<
    Record<string, AdditionalInfoCandidate[]>
  >({});
  const [documentRecords, setDocumentRecords] = useState<DocumentRecord[]>([]);

  /**
   * AI cover suggestions from property-photo documents (Phase 9). Only photos
   * the model rates as "high" are suggested; the user stays in control and the
   * actual cover is never changed automatically.
   */
  const coverSuggestions = useMemo(() => {
    const byFilename = new Map<string, PhotoUnderstanding>();
    for (const record of documentRecords) {
      const photo = record.understandingResult?.photo;
      if (photo && record.documentType === 'property_photo' && photo.coverSuitability === 'high') {
        byFilename.set(record.filename, photo);
      }
    }
    return byFilename;
  }, [documentRecords]);

  /**
   * AI photo understanding keyed by filename (Phase 10). Displayed as subtle
   * "KI-Erkennung" hints in the Fotos step; never treated as Property facts.
   */
  const photoMetadata = useMemo(() => {
    const byFilename = new Map<string, PhotoUnderstanding>();
    for (const record of documentRecords) {
      const photo = record.understandingResult?.photo;
      if (photo && record.documentType === 'property_photo') {
        byFilename.set(record.filename, photo);
      }
    }
    return byFilename;
  }, [documentRecords]);

  const reviewIssues: ReviewIssue[] = useMemo(
    () =>
      buildReviewIssues(
        {
          property,
          sourcesByField: fieldSources,
          documents: {
            total: documentRecords.length,
            analyzed: documentRecords.filter((record) => record.status === 'completed').length,
            failed: documentRecords.filter(
              (record) => record.status === 'failed' || record.understandingError != null,
            ).length,
          },
          imageCount: images.length,
          marketingContentExists: Boolean(marketingContent),
        },
        { locale, t },
      ),
    [property, fieldSources, documentRecords, images.length, marketingContent, locale, t],
  );

  // Load persisted documents and prefill empty wizard fields from their AI
  // understanding results. This is what makes prefill survive a page reload:
  // the user never has to re-upload or re-analyze anything.
  useEffect(() => {
    let cancelled = false;
    async function loadPersistedDocuments() {
      try {
        const response = await apiFetch(`/api/properties/${initialProperty.id}/documents`);
        if (!response.ok) return;
        const records = (await response.json()) as DocumentRecord[];
        if (!cancelled) applyExtractedDocuments(records);
      } catch {
        // The documents step renders its own error state; prefill stays empty here.
      }
    }
    loadPersistedDocuments();
    return () => {
      cancelled = true;
    };
  }, [initialProperty.id]);

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
        if (!response.ok) throw new Error(t('address.lookupUnavailable'));
        setAddressSuggestions(await response.json());
      } catch (lookupError) {
        if (!controller.signal.aborted)
          setAddressError(
            lookupError instanceof Error ? lookupError.message : t('address.lookupFailed'),
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
    if (meters < 1000)
      return `${Math.round(meters / 10) * 10} ${t('expose.units.meter')}`;
    return `${(meters / 1000).toLocaleString(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} ${t('expose.units.km')}`;
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
    const hasGeocoding = Boolean(
      geocoding?.coordinates || geocoding?.summary || geocoding?.facilities,
    );
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
      for (const [key, value] of Object.entries(
        surroundingsFromFacilities(geocoding?.facilities),
      )) {
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
    setDocumentRecords(records);
    // Collect every AI-extracted candidate across all persisted documents. All
    // sources are preserved (conflicting values are never silently discarded);
    // only empty wizard fields are prefilled.
    const sourcesByField = groupCandidatesByField(collectWizardFieldCandidates(records));
    setFieldSources(sourcesByField);
    setAdditionalInfoByKey(groupAdditionalByKey(collectAdditionalInformation(records)));
    if (!Object.keys(sourcesByField).length) return;

    setProperty((current) => {
      const currentValues: Record<string, unknown> = wizardCurrentValues(current);
      const { defaults } = computeWizardPrefills(records, currentValues);
      return applyPrefillToProperty(current, defaults);
    });

    if (!addressSelected && (sourcesByField.street || sourcesByField.city)) {
      const prefilled = [
        [sourcesByField.street?.[0]?.value, sourcesByField.houseNumber?.[0]?.value]
          .filter(Boolean)
          .join(' '),
        [sourcesByField.postalCode?.[0]?.value, sourcesByField.city?.[0]?.value]
          .filter(Boolean)
          .join(' '),
      ]
        .filter(Boolean)
        .join(', ');
      if (prefilled) setAddressQuery(prefilled);
    }
  }

  function applyPrefillToProperty(
    current: PropertyPayload,
    defaults: Record<string, string | number | boolean>,
  ): PropertyPayload {
    if (!Object.keys(defaults).length) return current;
    // Strict numeric coercion for the prefill boundary: AI values that are not
    // numbers (for example a boolean guestToilets) must never be coerced into
    // misleading counts like 1 or 0, and they must not create false provenance.
    const toFiniteNumber = (value: string | number | boolean): number | null => {
      if (typeof value === 'boolean' || value === null || value === undefined) return null;
      const num = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(num) ? num : null;
    };
    // Enum values the persistence layer accepts. An AI value outside these sets
    // would fail the backend validation and break the autosave, so it is
    // skipped here at the prefill boundary instead.
    const buildingStatusValues = ['new', 'existing'];
    const commissionPayerValues = ['buyer', 'seller', 'both'];
    const next = { ...current };
    // Never mutate the incoming state: updater functions must stay pure
    // (React StrictMode invokes them twice in development). The prefill below
    // assigns into exposeData, so it needs a fresh copy.
    const data = next.exposeData ? { ...next.exposeData } : emptyExposeData(initialProperty);
    const address = { ...data.basicInformation.address };
    const basicInfo = { ...data.basicInformation };
    const details = { ...data.propertyDetails };
    const pricing = { ...data.pricing };
    const energy = data.energy ? { ...data.energy } : {};
    const rental = { ...(data.rental ?? {}) };
    const weg = { ...(data.weg ?? {}) };
    const investment = { ...(data.investment ?? {}) };
    const legalFlags = { ...(data.additionalInformation.legalFlags ?? {}) };
    let addressChanged = false;
    let energyChanged = false;
    let detailsChanged = false;
    let pricingChanged = false;
    let rentalChanged = false;
    let wegChanged = false;
    let investmentChanged = false;
    let legalChanged = false;
    let basicChanged = false;
    const addressRecord = address as Record<string, string | null | undefined>;
    const setAddress = (key: keyof StructuredAddress, value: string) => {
      if (value && !addressRecord[key]) {
        addressRecord[key] = value;
        addressChanged = true;
      }
    };
    const setEnergy = (key: keyof EnergyData, value: string | number | boolean | null) => {
      if (value !== null && value !== undefined && value !== '' && energy[key] == null) {
        (energy as Record<string, string | number | boolean | null>)[key] = value;
        energyChanged = true;
      }
    };
    const setRental = (key: keyof typeof rental, value: string | number | boolean) => {
      if (value !== null && value !== undefined && value !== '' && rental[key] == null) {
        (rental as Record<string, string | number | boolean | null>)[key] = value;
        rentalChanged = true;
      }
    };
    const setWeg = (key: keyof typeof weg, value: string | number | boolean | null) => {
      if (value !== null && value !== undefined && value !== '' && weg[key] == null) {
        (weg as Record<string, string | number | boolean | null>)[key] = value;
        wegChanged = true;
      }
    };
    const setInvestment = (key: keyof typeof investment, value: string | number | boolean) => {
      if (value !== null && value !== undefined && value !== '' && investment[key] == null) {
        (investment as Record<string, string | number | boolean | null>)[key] = value;
        investmentChanged = true;
      }
    };
    const setLegalFlag = (key: keyof typeof legalFlags, value: boolean) => {
      if (value && legalFlags[key] !== true) {
        (legalFlags as Record<string, boolean | null | undefined>)[key] = true;
        legalChanged = true;
      }
    };

    const features: string[] = [];
    for (const [field, value] of Object.entries(defaults)) {
      switch (field) {
        case 'street':
          setAddress('street', String(value));
          break;
        case 'houseNumber':
          setAddress('houseNumber', String(value));
          break;
        case 'postalCode':
          setAddress('postalCode', String(value));
          break;
        case 'city':
          setAddress('city', String(value));
          break;
        case 'district':
          setAddress('district', String(value));
          break;
        case 'state':
          setAddress('state', String(value));
          break;
        case 'country':
          setAddress('country', String(value));
          break;
        case 'propertyType': {
          // propertyType always has the initial default value, so treat that
          // default as "empty" and never overwrite an explicit user choice.
          // Also guard against non-normalized AI values (e.g. "Wohnhaus").
          const validType = (PROPERTY_TYPES as readonly (readonly [string, string])[]).some(
            ([key]) => key === value,
          );
          const currentType = current.propertyType;
          if (validType && (!currentType || currentType === 'apartment')) {
            next.propertyType = value as PropertyPayload['propertyType'];
            basicChanged = true;
          }
          break;
        }
        case 'propertySubtype': {
          if (!basicInfo.propertySubtype) {
            basicInfo.propertySubtype = String(value);
            basicChanged = true;
          }
          break;
        }
        case 'usageType': {
          if (!basicInfo.usageType) {
            basicInfo.usageType = String(value);
            basicChanged = true;
          }
          break;
        }
        case 'livingArea': {
          const num = toFiniteNumber(value);
          if (num != null && next.livingArea == null) next.livingArea = num;
          break;
        }
        case 'usableArea': {
          const num = toFiniteNumber(value);
          if (num != null && details.usableArea == null) {
            details.usableArea = num;
            detailsChanged = true;
          }
          break;
        }
        case 'plotArea': {
          const num = toFiniteNumber(value);
          if (num != null && next.plotArea == null) next.plotArea = num;
          break;
        }
        case 'rooms': {
          const num = toFiniteNumber(value);
          if (num != null && next.rooms == null) next.rooms = num;
          break;
        }
        case 'bedrooms': {
          const num = toFiniteNumber(value);
          if (num != null && next.bedrooms == null) next.bedrooms = num;
          break;
        }
        case 'bathrooms': {
          const num = toFiniteNumber(value);
          if (num != null && next.bathrooms == null) next.bathrooms = num;
          break;
        }
        case 'guestToilets': {
          const num = toFiniteNumber(value);
          if (num != null && details.guestToilets == null) {
            details.guestToilets = num;
            detailsChanged = true;
          }
          break;
        }
        case 'yearBuilt': {
          const num = toFiniteNumber(value);
          if (num != null && next.constructionYear == null) next.constructionYear = num;
          break;
        }
        case 'numberOfFloors': {
          const num = toFiniteNumber(value);
          if (num != null && next.totalFloors == null) next.totalFloors = num;
          break;
        }
        case 'floor':
          if (!next.floor) next.floor = String(value);
          break;
        case 'condition':
          if (!next.condition) next.condition = String(value);
          break;
        case 'buildingStatus':
          if (
            details.buildingStatus == null &&
            typeof value === 'string' &&
            buildingStatusValues.includes(value)
          ) {
            details.buildingStatus = value as 'new' | 'existing';
            detailsChanged = true;
          }
          break;
        case 'renovationStatus':
          if (!details.renovationStatus) {
            details.renovationStatus = String(value);
            detailsChanged = true;
          }
          break;
        case 'lastModernizationYear': {
          const num = toFiniteNumber(value);
          if (num != null && details.lastModernizationYear == null) {
            details.lastModernizationYear = num;
            detailsChanged = true;
          }
          break;
        }
        case 'askingPrice': {
          const num = toFiniteNumber(value);
          if (num != null && next.askingPrice == null) next.askingPrice = num;
          break;
        }
        case 'pricePerM2': {
          const num = toFiniteNumber(value);
          if (num != null && pricing.pricePerM2 == null) {
            pricing.pricePerM2 = num;
            pricingChanged = true;
          }
          break;
        }
        case 'commissionRate': {
          const num = toFiniteNumber(value);
          if (num != null && pricing.commissionRate == null) {
            pricing.commissionRate = num;
            pricingChanged = true;
          }
          break;
        }
        case 'commissionPayer':
          if (
            !pricing.commissionPayer &&
            typeof value === 'string' &&
            commissionPayerValues.includes(value)
          ) {
            pricing.commissionPayer = value as ExposeData['pricing']['commissionPayer'];
            pricingChanged = true;
          }
          break;
        case 'energyClass':
          setEnergy('efficiencyClass', String(value));
          break;
        case 'energyConsumption': {
          const num = toFiniteNumber(value);
          if (num != null) setEnergy('finalEnergyConsumption', num);
          break;
        }
        case 'energyDemand': {
          const num = toFiniteNumber(value);
          if (num != null) setEnergy('finalEnergyDemand', num);
          break;
        }
        case 'certificateType': {
          const normalized = normalizeCertificateType(String(value));
          if (normalized) setEnergy('certificateType', normalized);
          break;
        }
        case 'certificateDate':
          setEnergy('certificateDate', String(value));
          break;
        case 'certificateValidUntil':
          setEnergy('certificateValidUntil', String(value));
          break;
        case 'heatingType': {
          // heatingType is stored verbatim as the heating system name and also
          // used to derive the primary energy source when that is still empty.
          setEnergy('heatingType', String(value));
          if (!energy.primaryEnergySource) {
            const source = normalizeEnergySource(String(value));
            if (source) setEnergy('primaryEnergySource', source);
          }
          break;
        }
        case 'primaryEnergySource': {
          const source = normalizeEnergySource(String(value));
          if (source) setEnergy('primaryEnergySource', source);
          break;
        }
        case 'yearOfConstruction': {
          const num = toFiniteNumber(value);
          if (num != null) setEnergy('yearOfConstruction', num);
          break;
        }
        case 'hotWaterIncluded':
          if (value === true && energy.hotWaterIncluded !== true) {
            setEnergy('hotWaterIncluded', true);
          }
          break;
        case 'isRented':
          if (value === true && rental.isRented !== true) setRental('isRented', true);
          break;
        case 'monthlyRent': {
          const num = toFiniteNumber(value);
          if (next.transactionType === 'rent' && next.coldRent == null && num != null)
            next.coldRent = num;
          break;
        }
        case 'annualRent': {
          const num = toFiniteNumber(value);
          if (num != null) setRental('annualRent', num);
          break;
        }
        case 'additionalCosts': {
          const num = toFiniteNumber(value);
          if (next.additionalCosts == null && num != null) next.additionalCosts = num;
          break;
        }
        case 'furnished':
          if (value === true && rental.furnished !== true) setRental('furnished', true);
          break;
        case 'availableFrom':
          if (!next.availableFrom) next.availableFrom = String(value);
          break;
        case 'grossYieldTarget': {
          const num = toFiniteNumber(value);
          if (investment.grossYieldTargetPercent == null && num != null)
            setInvestment('grossYieldTargetPercent', num);
          break;
        }
        case 'grossYieldActual': {
          const num = toFiniteNumber(value);
          if (investment.grossYieldActualPercent == null && num != null)
            setInvestment('grossYieldActualPercent', num);
          break;
        }
        case 'hausgeld': {
          const num = toFiniteNumber(value);
          if (num != null) setWeg('hausgeldEur', num);
          break;
        }
        case 'maintenanceReserve': {
          const num = toFiniteNumber(value);
          if (num != null) setWeg('maintenanceReserveEur', num);
          break;
        }
        case 'coOwnershipShare':
          setWeg('coOwnershipShare', String(value));
          break;
        case 'usufruct':
          if (value === true) setLegalFlag('usufruct', true);
          break;
        case 'leasehold':
          if (value === true) setLegalFlag('leasehold', true);
          break;
        case 'foreclosure':
          if (value === true) setLegalFlag('foreclosure', true);
          break;
        case 'heritageProtection':
          if (value === true) setLegalFlag('heritageProtection', true);
          break;
        case 'transactionType':
          // The default is always 'sale'; treat it as unset and only switch to
          // an explicit document statement (e.g. a rental agreement → "rent").
          // An explicitly chosen non-default value is never overwritten.
          if (next.transactionType === 'sale' && value === 'rent') {
            next.transactionType = 'rent';
            basicChanged = true;
          }
          break;
        case 'basement':
          if (value === true) features.push('basement');
          break;
        case 'attic':
          if (value === true) features.push('attic');
          break;
        case 'balcony':
          if (value === true) features.push('balcony');
          break;
        case 'terrace':
          if (value === true) features.push('terrace');
          break;
        case 'garden':
          if (value === true) features.push('garden');
          break;
        case 'garage':
          if (value === true) features.push('garage');
          break;
        case 'parking':
          if (value === true) features.push('parking');
          break;
        case 'shower':
          if (value === true) features.push('shower');
          break;
        case 'bathtub':
          if (value === true) features.push('bathtub');
          break;
        case 'carport':
          if (value === true) features.push('carport');
          break;
        default:
          // Fields without a wizard target (e.g. parcelNumber, plotNumber) stay
          // available in sourcesByField for inspection but are not forced in.
          break;
      }
    }

    if (basicChanged) data.basicInformation = { ...basicInfo, address };
    if (addressChanged) {
      data.basicInformation = { ...data.basicInformation, address };
      data.location = { ...data.location, address, district: address.district };
      if (address.city && !next.city) next.city = address.city;
      if (address.postalCode && !next.zipCode) next.zipCode = address.postalCode;
      if (address.district && !next.district) next.district = address.district;
      if (address.street && !next.address)
        next.address = [address.street, address.houseNumber].filter(Boolean).join(' ');
    }

    for (const feature of features) {
      if (!next.selectedFeatures.includes(feature))
        next.selectedFeatures = [...next.selectedFeatures, feature];
    }

    if (energyChanged) data.energy = energy as EnergyData;
    if (detailsChanged) data.propertyDetails = details;
    if (pricingChanged) data.pricing = pricing;
    if (rentalChanged) data.rental = rental;
    if (wegChanged) data.weg = weg;
    if (investmentChanged) data.investment = investment;
    if (legalChanged) {
      data.additionalInformation = { ...data.additionalInformation, legalFlags };
    }

    data.propertyDetails = {
      ...data.propertyDetails,
      livingArea: next.livingArea ?? data.propertyDetails.livingArea ?? null,
      plotArea: next.plotArea ?? data.propertyDetails.plotArea ?? null,
      rooms: next.rooms ?? data.propertyDetails.rooms ?? null,
      bathrooms: next.bathrooms ?? data.propertyDetails.bathrooms ?? null,
      yearBuilt: next.constructionYear ?? data.propertyDetails.yearBuilt ?? null,
      floor: next.floor ?? data.propertyDetails.floor ?? null,
      numberOfFloors: next.totalFloors ?? data.propertyDetails.numberOfFloors ?? null,
    };

    data.pricing = {
      ...data.pricing,
      purchasePrice:
        next.transactionType === 'sale'
          ? (next.askingPrice ?? data.pricing.purchasePrice ?? null)
          : (data.pricing.purchasePrice ?? null),
      rentPrice:
        next.transactionType === 'rent'
          ? (next.coldRent ?? data.pricing.rentPrice ?? null)
          : (data.pricing.rentPrice ?? null),
      additionalCosts: next.additionalCosts ?? data.pricing.additionalCosts ?? null,
      buyerCommission: next.commission ?? data.pricing.buyerCommission ?? null,
    };
    if (next.availableFrom)
      data.additionalInformation = {
        ...data.additionalInformation,
        availability: next.availableFrom,
      };

    return { ...next, exposeData: data };
  }

  function set<K extends keyof PropertyPayload>(key: K, value: PropertyPayload[K]) {
    setProperty((current) => {
      const next = { ...current, [key]: value };
      // Keep the canonical exposeData in sync with the legacy flat fields edited
      // here. Values are coerced to null so JSON serialization never drops a
      // known key (JSON.stringify omits undefined properties). exposeData is
      // copied before mutation so the updater stays pure (StrictMode double
      // invocation in development must observe identical input state).
      const data = next.exposeData ? { ...next.exposeData } : emptyExposeData(initialProperty);
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
        livingArea: next.livingArea ?? data.propertyDetails.livingArea ?? null,
        plotArea: next.plotArea ?? data.propertyDetails.plotArea ?? null,
        rooms: next.rooms ?? data.propertyDetails.rooms ?? null,
        bathrooms: next.bathrooms ?? data.propertyDetails.bathrooms ?? null,
        yearBuilt: next.constructionYear ?? data.propertyDetails.yearBuilt ?? null,
        floor: next.floor ?? data.propertyDetails.floor ?? null,
        numberOfFloors: next.totalFloors ?? data.propertyDetails.numberOfFloors ?? null,
        bodenrichtwert: next.bodenrichtwert ?? null,
      };
      data.pricing = {
        ...data.pricing,
        purchasePrice:
          next.transactionType === 'sale'
            ? (next.askingPrice ?? null)
            : (data.pricing.purchasePrice ?? null),
        rentPrice:
          next.transactionType === 'rent'
            ? (next.coldRent ?? next.askingPrice ?? null)
            : (data.pricing.rentPrice ?? null),
        additionalCosts: next.additionalCosts ?? null,
        buyerCommission: next.commission ?? null,
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
  const [marketingLoading, setMarketingLoading] = useState(false);
  async function generateMetadata() {
    setMetadataLoading(true);
    setError('');
    const response = await apiFetch(`/api/properties/${initialProperty.id}/ai/metadata`, {
      method: 'POST',
    });
    const result = await response.json();
    if (!response.ok) setError(t('wizard.generateTitleFailed'));
    else {
      updateExposeData({
        basicInformation: {
          ...property.exposeData!.basicInformation,
          title: result.title,
          propertySubtype: result.subtitle,
        },
      });
      toast.success(t('wizard.titleGenerated'));
    }
    setMetadataLoading(false);
  }

  async function save() {
    setSaving(true);
    setError('');
    const response = await apiFetch(`/api/properties/${initialProperty.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...property, marketingContent }),
    });
    if (!response.ok) setError(t('wizard.saveFailed'));
    setSaving(false);
  }

  async function next() {
    if (step === 1 && !addressSelected) {
      setError(t('wizard.addressFirst'));
      return;
    }
    await save();
    setStep((current) => Math.min(current + 1, REVIEW_STEP));
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
    if (!response.ok) setError(t('wizard.aiImproveFailed'));
    else {
      setContent(result);
      setStep(CONTENT_STEP);
    }
    setAiLoading(false);
  }

  async function generateMarketingContent() {
    await save();
    setMarketingLoading(true);
    setError('');
    const response = await apiFetch(
      `/api/properties/${initialProperty.id}/marketing-content/generate`,
      { method: 'POST' },
    );
    const result = await response.json();
    if (!response.ok) setError(t('wizard.marketingGenerateFailed'));
    else setMarketingContent(result);
    setMarketingLoading(false);
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
    else setError(t('wizard.contentSaveFailed'));
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
    if (!response.ok) setError(t('wizard.uploadFailed'));
    else setImages((current) => [...current, ...result]);
  }

  async function removeImage(id: string) {
    try {
      const response = await apiFetch(`/api/properties/${initialProperty.id}/images/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setImages((current) => current.filter((image) => image.id !== id));
        toast.success(t('wizard.photoRemoved'));
      } else setError(t('wizard.photoRemoveFailed'));
    } catch {
      setError(t('wizard.photoRemoveFailed'));
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
      else setError(t('wizard.coverFailed'));
    } catch {
      setError(t('wizard.coverFailed'));
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
      if (!response.ok) setError(t('wizard.reorderFailed'));
    } catch {
      setError(t('wizard.reorderFailed'));
    }
  }

  const data = property.exposeData!;
  const addressState: AddressFieldState = {
    query: addressQuery,
    suggestions: addressSuggestions,
    loading: addressLoading,
    lookupError: addressError,
    selected: addressSelected,
    address: data.basicInformation.address,
    onQueryChange: (value) => {
      setAddressQuery(value);
      setAddressSelected(false);
    },
    onSelect: selectAddress,
  };

  const stepStatuses: WizardStepStatus[] = STEPS.map((_, index) =>
    stepStatus(index, {
      documents: {
        total: documentRecords.length,
        analyzed: documentRecords.filter((record) => record.status === 'completed').length,
      },
      addressSelected,
      propertyType: property.propertyType,
      transactionType: property.transactionType,
      usageType: data.basicInformation.usageType,
      livingArea: data.propertyDetails.livingArea ?? property.livingArea,
      usableArea: data.propertyDetails.usableArea,
      plotArea: data.propertyDetails.plotArea ?? property.plotArea,
      rooms: data.propertyDetails.rooms ?? property.rooms,
      bedrooms: property.bedrooms,
      bathrooms: data.propertyDetails.bathrooms ?? property.bathrooms,
      guestToilets: data.propertyDetails.guestToilets,
      yearBuilt: data.propertyDetails.yearBuilt ?? property.constructionYear,
      condition: property.condition,
      renovationStatus: data.propertyDetails.renovationStatus,
      lastModernizationYear: data.propertyDetails.lastModernizationYear,
      selectedFeatures: property.selectedFeatures,
      gardenArea: data.outdoorAreas.find((area) => area.type === 'garden')?.area,
      energy: data.energy ?? undefined,
      askingPrice: property.askingPrice ?? data.pricing.purchasePrice,
      rentPrice: property.coldRent ?? data.pricing.rentPrice,
      commissionRate: data.pricing.commissionRate,
      legalFlags: data.additionalInformation.legalFlags,
      additionalInfoCount: Object.keys(additionalInfoByKey).length,
      surroundings: property.surroundings,
      yourInfo: {
        sellerDescription: property.sellerDescription,
        specialNotes: property.specialNotes,
        targetAudience: property.targetAudience,
        sellerNotes: data.additionalInformation.sellerNotes,
        additionalInformation: data.additionalInformation.additionalInformation,
      },
      imageCount: images.length,
      planCount: images.filter(
        (image) => image.category === 'floor_plan' || image.category === 'document',
      ).length,
      agentName: data.agent?.name,
      agentCompany: data.agent?.company,
      contentExists: Boolean(content),
      marketingContentExists: Boolean(marketingContent),
    }),
  );

  const currentStep = Math.min(step, REVIEW_STEP);
  const currentStatus = stepStatuses[currentStep];
  const completedSteps = stepStatuses.filter((status) => status === 'complete').length;
  const progressPercent = Math.round((completedSteps / STEPS.length) * 100);

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-card/90 px-5 py-3.5 backdrop-blur sm:px-8">
        <VistaLogoLink href="/" />
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            {saving ? (
              <>
                <LoaderCircle className="size-3.5 animate-spin" /> {t('wizard.saving')}
              </>
            ) : (
              <>
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {t('wizard.saved')}
              </>
            )}
          </span>
          <Button variant="outline" size="sm" asChild>
            <Link href="/">{t('wizard.backToDrafts')}</Link>
          </Button>
          <LanguageSwitcher />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-10">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              {t('wizard.kicker')}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {step < STEPS.length ? t(STEPS[step]) : t('wizard.aiEditor')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('wizard.stepIndicator', {
                current: currentStep + 1,
                total: STEPS.length,
                status: t(stepStatusLabel(currentStatus)),
              })}
            </p>
          </div>
          <span className="hidden text-sm font-medium text-muted-foreground sm:block">
            {t('wizard.percentComplete', { percent: progressPercent })}
          </span>
        </div>

        <Progress value={progressPercent} className="mb-8 h-1.5" />

        <div className="lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-8">
          <nav
            className="mb-6 flex gap-1 overflow-x-auto pb-2 lg:mb-0 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0"
            aria-label={t('wizard.navLabel')}
          >
            {STEPS.map((name, index) => {
              const current = index === currentStep;
              const completed = index < currentStep;
              const future = index > currentStep;
              const status = stepStatuses[index];
              return (
                <button
                  key={name}
                  onClick={() => index <= currentStep && setStep(index)}
                  disabled={future}
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'group flex min-w-[160px] shrink-0 items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors lg:min-w-0 lg:w-full',
                    current
                      ? 'border-primary bg-primary/[0.06]'
                      : completed
                        ? 'border-border bg-card hover:bg-muted/40'
                        : 'cursor-not-allowed border-transparent bg-transparent',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-colors',
                      current
                        ? 'border-primary bg-primary text-primary-foreground'
                        : completed
                          ? 'border-transparent bg-primary/90 text-primary-foreground'
                          : 'border-border text-muted-foreground',
                    )}
                  >
                    {completed ? <Check className="size-3.5" aria-hidden /> : index + 1}
                  </span>
                  <span
                    className={cn(
                      'truncate text-sm',
                      current
                        ? 'font-semibold text-primary'
                        : completed
                          ? 'font-medium text-foreground'
                          : 'font-medium text-muted-foreground/60',
                    )}
                  >
                    {t(name)}
                  </span>
                  <span
                    aria-label={t('wizard.stepLabel', {
                      name: t(name),
                      status: t(stepStatusLabel(status)),
                    })}
                    className={cn(
                      'ml-auto size-2 shrink-0 rounded-full',
                      status === 'complete' && 'bg-emerald-500',
                      status === 'partial' && 'bg-amber-500',
                      status === 'incomplete' && 'bg-muted-foreground/30',
                    )}
                  />
                </button>
              );
            })}
          </nav>

          <div className="min-w-0">
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertTitle className="flex items-center justify-between gap-2">
                  {t('wizard.somethingWentWrong')}
                  <button onClick={() => setError('')} aria-label={t('common.close')}>
                    <X className="size-4" />
                  </button>
                </AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              >
                {step < REVIEW_STEP ? (
                  <>
                    {step === 0 && (
                      <StepDocuments
                        propertyId={initialProperty.id}
                        onExtracted={applyExtractedDocuments}
                      />
                    )}
                    {step === 1 && (
                      <StepProperty
                        property={property}
                        set={set}
                        exposeData={data}
                        updateExposeData={updateExposeData}
                        sources={fieldSources}
                        addressState={addressState}
                      />
                    )}
                    {step === 2 && (
                      <StepBuilding
                        property={property}
                        set={set}
                        exposeData={data}
                        updateExposeData={updateExposeData}
                        sources={fieldSources}
                      />
                    )}
                    {step === 3 && (
                      <StepFeatures
                        property={property}
                        set={set}
                        exposeData={data}
                        updateExposeData={updateExposeData}
                        noteValue={noteValue}
                        setNote={setNote}
                        sources={fieldSources}
                      />
                    )}
                    {step === 4 && (
                      <StepEnergy
                        data={data.energy}
                        update={(energy) => updateExposeData({ energy })}
                        noteValue={noteValue}
                        setNote={setNote}
                        sources={fieldSources}
                      />
                    )}
                    {step === 5 && (
                      <StepFinancial
                        property={property}
                        set={set}
                        exposeData={data}
                        updateExposeData={updateExposeData}
                        sources={fieldSources}
                        boris={boris}
                        borisLoading={borisLoading}
                      />
                    )}
                    {step === 6 && (
                      <StepLegal
                        exposeData={data}
                        updateExposeData={updateExposeData}
                        sources={fieldSources}
                        additionalInfo={additionalInfoByKey}
                        noteValue={noteValue}
                        setNote={setNote}
                      />
                    )}
                    {step === 7 && (
                      <StepLocation
                        property={property}
                        set={set}
                        exposeData={data}
                        updateExposeData={updateExposeData}
                        sources={fieldSources}
                        propertyId={initialProperty.id}
                        address={data.basicInformation.address}
                        addressSelected={addressSelected}
                        onData={applyExternalData}
                      />
                    )}
                    {step === 8 && (
                      <StepYourInformation
                        property={property}
                        set={set}
                        exposeData={data}
                        updateExposeData={updateExposeData}
                        noteValue={noteValue}
                        setNote={setNote}
                      />
                    )}
                    {step === 9 && (
                      <StepMarketingContent
                        content={marketingContent}
                        setContent={setMarketingContent}
                        onGenerate={generateMarketingContent}
                        generating={marketingLoading}
                      />
                    )}
                    {step === 10 && (
                      <StepPhotos
                        images={images}
                        rooms={property.rooms}
                        upload={upload}
                        removeImage={removeImage}
                        cover={cover}
                        moveImage={moveImage}
                        noteValue={noteValue}
                        setNote={setNote}
                        coverSuggestions={coverSuggestions}
                        photoMetadata={photoMetadata}
                      />
                    )}
                    {step === 11 && (
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
                    {step === 12 && (
                      <StepAgent
                        data={data.agent}
                        update={(agent) => updateExposeData({ agent })}
                        noteValue={noteValue}
                        setNote={setNote}
                      />
                    )}
                  </>
                ) : step === REVIEW_STEP ? (
                  <Review
                    property={property}
                    images={images}
                    onEdit={setStep}
                    generateMetadata={generateMetadata}
                    metadataLoading={metadataLoading}
                    updateExposeData={updateExposeData}
                    noteValue={noteValue}
                    issues={reviewIssues}
                  />
                ) : (
                  <ContentEditor
                    content={content}
                    setContent={setContent}
                    onGenerate={generate}
                    loading={aiLoading}
                    saving={saving}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between border-t pt-5 lg:ml-[270px]">
          <Button
            variant="outline"
            disabled={step === 0}
            onClick={() => setStep((current) => Math.max(current - 1, 0))}
          >
            <ArrowLeft className="size-4" /> {t('common.back')}
          </Button>
          {step < REVIEW_STEP ? (
            <Button onClick={next} disabled={saving}>
              {saving ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" /> {t('wizard.saving')}
                </>
              ) : (
                <>
                  {t('common.next')} <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          ) : step === REVIEW_STEP ? (
            <Button onClick={() => generate()} disabled={aiLoading}>
              {aiLoading ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" /> {t('wizard.improving')}
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> {t('wizard.improveWithAi')}
                </>
              )}
            </Button>
          ) : (
            <Button onClick={saveContent} disabled={saving}>
              <FileText className="size-4" /> {t('wizard.openPreview')}{' '}
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
