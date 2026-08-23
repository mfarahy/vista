import { Check, LoaderCircle, MapPin, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input as ShadInput } from '@/components/ui/input';
import type {
  ExposeData,
  PropertyPayload,
  SetProperty,
  StructuredAddress,
} from '../types';
import {
  BUILDING_STATUSES,
  PROPERTY_CONDITIONS,
  PROPERTY_TYPES,
  PROPERTY_USAGE_TYPES,
  RENOVATION_STATUSES,
  normalizeCondition,
  propertySubtypeOptions,
  subtypeKey,
  subtypeLabel,
} from '../types';
import type { WizardFieldCandidate } from '../document-prefill';
import { wizardCurrentValues } from '../document-prefill';
import {
  GroupCard,
  Input,
  Select,
  Section,
  Toggle,
  UnitInput,
} from './ui';
import { DocumentSources } from './document-sources';

export type AddressFieldState = {
  query: string;
  suggestions: StructuredAddress[];
  loading: boolean;
  lookupError: string;
  selected: boolean;
  address: StructuredAddress;
  onQueryChange: (value: string) => void;
  onSelect: (address: StructuredAddress) => void;
};

const ADDRESS_FIELD_KEYS: Array<keyof StructuredAddress> = [
  'street',
  'houseNumber',
  'postalCode',
  'city',
  'district',
  'state',
  'country',
];

function AddressDocumentSources({
  sources,
  currentValues,
}: {
  sources?: Record<string, WizardFieldCandidate[]>;
  currentValues: Record<string, string | number | boolean | null | undefined>;
}) {
  const found = ADDRESS_FIELD_KEYS.filter((key) => sources?.[key]?.length);
  if (!found.length) return null;
  return (
    <div className="mt-4 space-y-2 border-t pt-3">
      {found.map((key) => (
        <DocumentSources
          key={key}
          sources={sources?.[key]}
          currentValue={currentValues[key]}
        />
      ))}
    </div>
  );
}

function AddressSection({
  addressState,
  sources,
  currentValues,
}: {
  addressState: AddressFieldState;
  sources?: Record<string, WizardFieldCandidate[]>;
  currentValues: Record<string, string | number | boolean | null | undefined>;
}) {
  const {
    query,
    suggestions,
    loading,
    lookupError,
    selected,
    address,
    onQueryChange,
    onSelect,
  } = addressState;
  const showSuggestions = suggestions.length > 0 && !selected;
  return (
    <div>
      {!selected ? (
        <div className="relative">
          <div className="relative mt-1.5">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <ShadInput
              className="w-full pl-8"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Straße, Hausnummer oder Stadt eingeben"
              aria-autocomplete="list"
              aria-expanded={showSuggestions}
            />
          </div>
          {loading && (
            <p className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Adressen werden gesucht…
            </p>
          )}
          {lookupError && <p className="mt-2 text-sm text-destructive">{lookupError}</p>}
          {!loading &&
            query.trim().length >= 3 &&
            !suggestions.length &&
            !selected &&
            !lookupError && (
              <p className="mt-2 text-sm text-muted-foreground">Keine passende Adresse gefunden.</p>
            )}
          {showSuggestions && (
            <div
              className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border bg-popover shadow-lg"
              role="listbox"
            >
              {suggestions.map((suggestion, index) => (
                <button
                  type="button"
                  role="option"
                  key={`${suggestion.formattedAddress}-${index}`}
                  onClick={() => onSelect(suggestion)}
                  className="flex w-full items-center gap-3 border-b px-3 py-3 text-left last:border-0 hover:bg-accent"
                >
                  <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {[suggestion.street, suggestion.houseNumber].filter(Boolean).join(' ') ||
                        suggestion.formattedAddress}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[suggestion.postalCode, suggestion.city, suggestion.state, suggestion.country]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3.5" aria-hidden />
              </span>
              <p className="text-sm font-semibold text-foreground">Adresse ausgewählt</p>
            </div>
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
            >
              Ändern
            </button>
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground">
            {[
              [address.street, address.houseNumber].filter(Boolean).join(' '),
              [address.postalCode, address.city].filter(Boolean).join(' '),
            ]
              .filter(Boolean)
              .join(', ')}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[address.street, address.houseNumber].filter(Boolean).join(' ')} ·{' '}
            {[address.postalCode, address.city, address.state, address.country]
              .filter(Boolean)
              .join(', ')}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Die strukturierte Adresse wird für Standort und Exposé weiterverwendet.
          </p>
          <AddressDocumentSources sources={sources} currentValues={currentValues} />
        </div>
      )}
    </div>
  );
}

export function StepProperty({
  property,
  set,
  exposeData,
  updateExposeData,
  sources,
  addressState,
}: {
  property: PropertyPayload;
  set: SetProperty;
  exposeData: ExposeData;
  updateExposeData: (patch: Partial<ExposeData>) => void;
  sources?: Record<string, WizardFieldCandidate[]>;
  addressState: AddressFieldState;
}) {
  const details = exposeData.propertyDetails;
  const setType = (type: string) => {
    const currentSubtype = subtypeLabel(property.propertyType, exposeData.basicInformation.propertySubtype);
    const subtypeStillValid = propertySubtypeOptions(type).some(
      ([, label]) => label === currentSubtype,
    );
    set('propertyType', type);
    updateExposeData({
      basicInformation: {
        ...exposeData.basicInformation,
        propertyType: type,
        propertySubtype: subtypeStillValid
          ? exposeData.basicInformation.propertySubtype
          : null,
      },
    });
  };
  const setSubtype = (value: string) => {
    const label = subtypeLabel(property.propertyType, value) || value;
    updateExposeData({
      basicInformation: { ...exposeData.basicInformation, propertySubtype: label },
    });
  };
  const setDetails = (patch: Partial<ExposeData['propertyDetails']>) =>
    updateExposeData({ propertyDetails: { ...details, ...patch } });

  const currentValues = wizardCurrentValues(property);
  const hasDocumentSources = sources && Object.keys(sources).length > 0;

  return (
    <Section
      title="Objekt"
      description={
        hasDocumentSources
          ? 'Vista hat die wichtigsten Angaben aus Ihren Dokumenten bereits übernommen. Prüfen und ergänzen Sie hier nur, was fehlt.'
          : 'Hier erfassen Sie die grundlegenden Angaben zur Immobilie. Mit hochgeladenen Dokumenten füllt Vista die Felder automatisch vor.'
      }
    >
      <div className="space-y-6">
        <GroupCard title="Objektart">
          <div className="grid gap-2 sm:grid-cols-4">
            {PROPERTY_TYPES.map(([key, name]) => {
              const active = property.propertyType === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setType(key)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-lg border px-3 py-3 text-left text-sm font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary/[0.06] text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <DocumentSources sources={sources?.propertyType} currentValue={currentValues.propertyType} />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Select
                label="Objektunterart"
                value={subtypeKey(property.propertyType, exposeData.basicInformation.propertySubtype) ?? ''}
                onChange={setSubtype}
                placeholder="Unterart auswählen"
                options={propertySubtypeOptions(property.propertyType).map(([value, label]) => [
                  value,
                  label,
                ])}
              />
              <DocumentSources sources={sources?.propertySubtype} currentValue={currentValues.propertySubtype} />
            </div>
            <div>
              <Select
                label="Verwendungszweck"
                value={exposeData.basicInformation.usageType ?? ''}
                onChange={(value) =>
                  updateExposeData({
                    basicInformation: {
                      ...exposeData.basicInformation,
                      usageType: value || null,
                    },
                  })
                }
                placeholder="Auswählen"
                options={PROPERTY_USAGE_TYPES as unknown as ReadonlyArray<readonly [string, string]>}
              />
              <DocumentSources sources={sources?.usageType} currentValue={currentValues.usageType} />
            </div>
          </div>
        </GroupCard>

        <GroupCard title="Kauf oder Miete">
          <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
            {(
              [
                ['sale', 'Kaufen'],
                ['rent', 'Mieten'],
              ] as const
            ).map(([key, label]) => {
              const active = property.transactionType === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => set('transactionType', key)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-lg border px-4 py-3.5 text-left text-sm font-semibold transition-colors',
                    active
                      ? 'border-primary bg-primary/[0.06] text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <DocumentSources sources={sources?.transactionType} currentValue={currentValues.transactionType} />
        </GroupCard>

        <GroupCard
          title="Adresse"
          description="Die Adresse ist die Grundlage für Standort und Exposé."
        >
          <AddressSection addressState={addressState} sources={sources} currentValues={currentValues} />
        </GroupCard>

        <GroupCard title="Flächen und Zimmer">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <UnitInput
                label="Wohnfläche"
                unit="m²"
                value={details.livingArea ?? property.livingArea}
                onChange={(value) => set('livingArea', value ? Number(value) : null)}
                placeholder="92"
              />
              <DocumentSources sources={sources?.livingArea} currentValue={currentValues.livingArea} />
            </div>
            <div>
              <UnitInput
                label="Nutzfläche"
                unit="m²"
                value={details.usableArea}
                onChange={(value) => setDetails({ usableArea: value ? Number(value) : null })}
                placeholder="Optional"
              />
              <DocumentSources sources={sources?.usableArea} currentValue={currentValues.usableArea} />
            </div>
            <div>
              <UnitInput
                label="Grundstücksfläche"
                unit="m²"
                value={details.plotArea ?? property.plotArea}
                onChange={(value) => set('plotArea', value ? Number(value) : null)}
                placeholder="Optional"
              />
              <DocumentSources sources={sources?.plotArea} currentValue={currentValues.plotArea} />
            </div>
            <div>
              <UnitInput
                label="Zimmer"
                unit="Zimmer"
                type="number"
                value={details.rooms ?? property.rooms}
                onChange={(value) => set('rooms', value ? Number(value) : null)}
                placeholder="3"
              />
              <DocumentSources sources={sources?.rooms} currentValue={currentValues.rooms} />
            </div>
            <div>
              <UnitInput
                label="Schlafzimmer"
                unit="Zimmer"
                type="number"
                value={property.bedrooms}
                onChange={(value) => set('bedrooms', value ? Number(value) : null)}
                placeholder="2"
              />
              <DocumentSources sources={sources?.bedrooms} currentValue={currentValues.bedrooms} />
            </div>
            <div>
              <UnitInput
                label="Badezimmer"
                unit="Bäder"
                type="number"
                value={details.bathrooms ?? property.bathrooms}
                onChange={(value) => set('bathrooms', value ? Number(value) : null)}
                placeholder="1"
              />
              <DocumentSources sources={sources?.bathrooms} currentValue={currentValues.bathrooms} />
            </div>
            <div>
              <UnitInput
                label="Gäste-WCs"
                unit="WCs"
                type="number"
                value={details.guestToilets}
                onChange={(value) => setDetails({ guestToilets: value ? Number(value) : null })}
                placeholder="Optional"
              />
              <DocumentSources sources={sources?.guestToilets} currentValue={currentValues.guestToilets} />
            </div>
          </div>
        </GroupCard>
      </div>
    </Section>
  );
}

export function StepBuilding({
  property,
  set,
  exposeData,
  updateExposeData,
  sources,
}: {
  property: PropertyPayload;
  set: SetProperty;
  exposeData: ExposeData;
  updateExposeData: (patch: Partial<ExposeData>) => void;
  sources?: Record<string, WizardFieldCandidate[]>;
}) {
  const details = exposeData.propertyDetails;
  const showShell = ['house', 'villa', 'semi-detached', 'terraced'].includes(
    property.propertyType,
  );
  const setDetails = (patch: Partial<ExposeData['propertyDetails']>) =>
    updateExposeData({ propertyDetails: { ...details, ...patch } });
  const toggleFeature = (key: string) =>
    set(
      'selectedFeatures',
      property.selectedFeatures.includes(key)
        ? property.selectedFeatures.filter((value) => value !== key)
        : [...property.selectedFeatures, key],
    );
  const condition = normalizeCondition(property.condition);
  const currentValues = wizardCurrentValues(property);

  return (
    <Section
      title="Gebäude"
      description="Angaben zur Bausubstanz. Lassen Sie Felder leer, die Sie nicht kennen."
    >
      <div className="space-y-6">
        <GroupCard title="Bauweise">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Input
                label="Baujahr"
                type="number"
                value={details.yearBuilt ?? property.constructionYear}
                onChange={(value) => set('constructionYear', value ? Number(value) : null)}
                placeholder="z. B. 2018"
              />
              <DocumentSources sources={sources?.yearBuilt} currentValue={currentValues.yearBuilt} />
            </div>
            <div>
              <Select
                label="Objektstatus"
                value={details.buildingStatus ?? ''}
                onChange={(value) => setDetails({ buildingStatus: (value || null) as 'new' | 'existing' | null })}
                placeholder="Auswählen"
                options={BUILDING_STATUSES as unknown as ReadonlyArray<readonly [string, string]>}
              />
              <DocumentSources sources={sources?.buildingStatus} currentValue={currentValues.buildingStatus} />
            </div>
            <div>
              <Select
                label="Zustand"
                value={condition}
                onChange={(value) => set('condition', value || null)}
                placeholder="Auswählen"
                options={PROPERTY_CONDITIONS as unknown as ReadonlyArray<readonly [string, string]>}
              />
              <DocumentSources sources={sources?.condition} currentValue={currentValues.condition} />
            </div>
          </div>
        </GroupCard>

        <GroupCard
          title="Sanierung & Modernisierung"
          description="Nur relevant, wenn eine Sanierung oder Modernisierung stattgefunden hat."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Select
                label="Sanierungsstatus"
                value={details.renovationStatus ?? ''}
                onChange={(value) => setDetails({ renovationStatus: value || null })}
                placeholder="Auswählen"
                options={RENOVATION_STATUSES as unknown as ReadonlyArray<readonly [string, string]>}
              />
              <DocumentSources sources={sources?.renovationStatus} currentValue={currentValues.renovationStatus} />
            </div>
            <div>
              <Input
                label="Letzte Modernisierung"
                type="number"
                value={details.lastModernizationYear}
                onChange={(value) =>
                  setDetails({ lastModernizationYear: value ? Number(value) : null })
                }
                placeholder="z. B. 2019"
              />
              <DocumentSources sources={sources?.lastModernizationYear} currentValue={currentValues.lastModernizationYear} />
            </div>
          </div>
        </GroupCard>

        {showShell && (
          <GroupCard
            title="Geschosse & Keller"
            description="Angaben zur Geschossstruktur des Hauses."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <UnitInput
                  label="Etagen"
                  unit="Etagen"
                  type="number"
                  value={details.numberOfFloors ?? property.totalFloors}
                  onChange={(value) => set('totalFloors', value ? Number(value) : null)}
                  placeholder="2"
                />
                <DocumentSources sources={sources?.numberOfFloors} currentValue={currentValues.numberOfFloors} />
              </div>
              <Toggle
                label="Keller"
                checked={property.selectedFeatures.includes('basement')}
                onChange={() => toggleFeature('basement')}
              />
              <Toggle
                label="Dachgeschoss"
                checked={property.selectedFeatures.includes('attic')}
                onChange={() => toggleFeature('attic')}
              />
            </div>
          </GroupCard>
        )}
      </div>
    </Section>
  );
}