import { Check, LoaderCircle, MapPin, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input as ShadInput } from '@/components/ui/input';
import type {
  BorisEnrichment,
  ExposeData,
  PropertyPayload,
  SetProperty,
  StructuredAddress,
} from '../types';
import { PROPERTY_TYPES } from '../types';
import type { WizardFieldCandidate } from '../document-prefill';
import { DatePicker, Input, Section, SectionNotes, Select } from './ui';
import { DocumentSources } from './document-sources';

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
}: {
  sources?: Record<string, WizardFieldCandidate[]>;
}) {
  const found = ADDRESS_FIELD_KEYS.map((key) => sources?.[key]).filter(
    (group): group is WizardFieldCandidate[] => !!group?.length,
  );
  if (!found.length) return null;
  return (
    <div className="mt-4 space-y-2 border-t pt-3">
      {found.map((group) => (
        <DocumentSources key={group[0].field} sources={group} />
      ))}
    </div>
  );
}

export function StepAddress({
  query,
  suggestions,
  loading,
  lookupError,
  selected,
  onQueryChange,
  onSelect,
  address,
  sources,
}: {
  query: string;
  suggestions: StructuredAddress[];
  loading: boolean;
  lookupError: string;
  selected: boolean;
  onQueryChange: (value: string) => void;
  onSelect: (address: StructuredAddress) => void;
  address: StructuredAddress;
  sources?: Record<string, WizardFieldCandidate[]>;
}) {
  const showSuggestions = suggestions.length > 0 && !selected;
  return (
    <Section
      title="Property address"
      description="Start with the exact property address. Vista uses it as the foundation for location and property data."
    >
      <div className="space-y-6">
        <div className="relative">
          <span className="text-sm font-medium text-foreground">Search address</span>
          <div className="relative mt-1.5">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <ShadInput
              autoFocus
              className="w-full pl-8"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Start typing a street, house number or city"
              aria-autocomplete="list"
              aria-expanded={showSuggestions}
            />
          </div>
          {loading && (
            <p className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Searching addresses…
            </p>
          )}
          {lookupError && <p className="mt-2 text-sm text-destructive">{lookupError}</p>}
          {!loading &&
            query.trim().length >= 3 &&
            !suggestions.length &&
            !selected &&
            !lookupError && (
              <p className="mt-2 text-sm text-muted-foreground">No matching addresses found.</p>
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

        {selected && (
          <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3.5" aria-hidden />
              </span>
              <p className="text-sm font-semibold text-foreground">Address selected</p>
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
              Structured address saved — you can continue without entering it again.
            </p>
            <AddressDocumentSources sources={sources} />
          </div>
        )}
      </div>
    </Section>
  );
}

export function StepProperty({
  property,
  set,
  exposeData,
  updateExposeData,
  noteValue,
  setNote,
  sources,
}: {
  property: PropertyPayload;
  set: SetProperty;
  exposeData: ExposeData;
  updateExposeData: (patch: Partial<ExposeData>) => void;
  noteValue: (key: string) => string;
  setNote: (key: string, value: string) => void;
  sources?: Record<string, WizardFieldCandidate[]>;
}) {
  return (
    <Section
      title="Property"
      description="Basic information about the property. The listing title and subtype are generated at the end."
    >
      <div className="space-y-7">
        <div className="space-y-3">
          <span className="text-sm font-medium text-foreground">Property type</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PROPERTY_TYPES.map(([key, name]) => {
              const active = property.propertyType === key;
              return (
                <button
                  key={key}
                  onClick={() => {
                    set('propertyType', key);
                    updateExposeData({
                      basicInformation: { ...exposeData.basicInformation, propertyType: key },
                    });
                  }}
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
          <DocumentSources sources={sources?.propertyType} />
        </div>

        <div className="space-y-3">
          <span className="text-sm font-medium text-foreground">What are you planning?</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['sale', 'Sell'],
                ['rent', 'Rent'],
              ] as const
            ).map(([key, label]) => {
              const active = property.transactionType === key;
              return (
                <button
                  key={key}
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
        </div>

        <div className="max-w-xs">
          <Input
            label="Year built (optional)"
            value={property.constructionYear}
            type="number"
            onChange={(value) => set('constructionYear', value ? Number(value) : null)}
            placeholder="e.g. 2018"
          />
          <DocumentSources sources={sources?.yearBuilt} />
        </div>

        <SectionNotes
          value={noteValue('property')}
          onChange={(value) => setNote('property', value)}
          placeholder="Anything else about the property you want to highlight?"
        />
      </div>
    </Section>
  );
}

export function StepDetails({
  property,
  set,
  boris,
  borisLoading,
  noteValue,
  setNote,
  sources,
}: {
  property: PropertyPayload;
  set: SetProperty;
  boris: BorisEnrichment | null;
  borisLoading: boolean;
  noteValue: (key: string) => string;
  setNote: (key: string, value: string) => void;
  sources?: Record<string, WizardFieldCandidate[]>;
}) {
  const hasFloor =
    property.propertyType === 'apartment' ||
    property.propertyType === 'penthouse' ||
    property.propertyType === 'other';
  const sale = property.transactionType === 'sale';
  return (
    <Section
      title="Details & price"
      description="The more precise the details, the better the AI can write."
    >
      <div className="space-y-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Input
              label="Living area (m²)"
              value={property.livingArea}
              type="number"
              onChange={(value) => set('livingArea', value ? Number(value) : null)}
              placeholder="92"
            />
            <DocumentSources sources={sources?.livingArea} />
          </div>
          <div>
            <Input
              label="Plot size (m²)"
              value={property.plotArea}
              type="number"
              onChange={(value) => set('plotArea', value ? Number(value) : null)}
              placeholder="Optional"
            />
            <DocumentSources sources={sources?.plotArea} />
          </div>
          <div>
            <Input
              label="Rooms"
              value={property.rooms}
              type="number"
              onChange={(value) => set('rooms', value ? Number(value) : null)}
              placeholder="3"
            />
            <DocumentSources sources={sources?.rooms} />
          </div>
          <div>
            <Input
              label="Bedrooms"
              value={property.bedrooms}
              type="number"
              onChange={(value) => set('bedrooms', value ? Number(value) : null)}
              placeholder="2"
            />
            <DocumentSources sources={sources?.bedrooms} />
          </div>
          <div>
            <Input
              label="Bathrooms"
              value={property.bathrooms}
              type="number"
              onChange={(value) => set('bathrooms', value ? Number(value) : null)}
              placeholder="1"
            />
            <DocumentSources sources={sources?.bathrooms} />
          </div>
          {hasFloor && (
            <div>
              <Input
                label="Floor"
                value={property.floor}
                onChange={(value) => set('floor', value)}
                placeholder="e.g. 3rd floor"
              />
              <DocumentSources sources={sources?.floor} />
            </div>
          )}
          <div>
            <Input
              label="Total floors"
              value={property.totalFloors}
              type="number"
              onChange={(value) => set('totalFloors', value ? Number(value) : null)}
              placeholder="5"
            />
            <DocumentSources sources={sources?.numberOfFloors} />
          </div>
          <DatePicker
            value={property.availableFrom}
            onChange={(value) => set('availableFrom', value)}
          />
          <Select
            label="Condition"
            value={property.condition}
            onChange={(value) => set('condition', value)}
            placeholder="Select an option"
            options={[
              ['new', 'Like new'],
              ['renovated', 'Renovated'],
              ['good', 'Well maintained'],
              ['needs-renovation', 'Needs renovation'],
            ]}
          />
          {sale ? (
            <>
              <Input
                label="Asking price (€)"
                value={property.askingPrice}
                type="number"
                onChange={(value) => set('askingPrice', value ? Number(value) : null)}
                placeholder="449000"
              />
              <Input
                label="Purchase costs (€)"
                value={property.additionalCosts}
                type="number"
                onChange={(value) => set('additionalCosts', value ? Number(value) : null)}
                placeholder="Optional"
              />
              <Input
                label="Commission"
                value={property.commission}
                onChange={(value) => set('commission', value)}
                placeholder="e.g. 3.57% incl. VAT"
              />
              <Input
                label="Service charge / month (€)"
                value={property.hausgeld}
                type="number"
                onChange={(value) => set('hausgeld', value ? Number(value) : null)}
                placeholder="Optional"
              />
            </>
          ) : (
            <>
              <Input
                label="Cold rent / month (€)"
                value={property.coldRent}
                type="number"
                onChange={(value) => set('coldRent', value ? Number(value) : null)}
                placeholder="1800"
              />
              <Input
                label="Additional costs / month (€)"
                value={property.additionalCosts}
                type="number"
                onChange={(value) => set('additionalCosts', value ? Number(value) : null)}
                placeholder="350"
              />
              <Input
                label="Total rent / month (€)"
                value={property.askingPrice}
                type="number"
                onChange={(value) => set('askingPrice', value ? Number(value) : null)}
                placeholder="2150"
              />
              <Input
                label="Deposit (€)"
                value={property.deposit}
                type="number"
                onChange={(value) => set('deposit', value ? Number(value) : null)}
                placeholder="5400"
              />
            </>
          )}
          <Input
            label="Bodenrichtwert (€/m²)"
            value={property.bodenrichtwert}
            type="number"
            onChange={(value) => set('bodenrichtwert', value ? Number(value) : null)}
            placeholder={
              boris?.bodenrichtwert?.value != null ? String(boris.bodenrichtwert.value) : 'Optional'
            }
          />
        </div>

        {borisLoading && (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Checking Bodenrichtwert…
          </p>
        )}

        {boris?.available && boris.bodenrichtwert?.value != null && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <p className="font-semibold">Bodenrichtwert {boris.bodenrichtwert.value} €/m²</p>
            <p className="mt-0.5 text-amber-700">
              Source: {boris.source}
              {boris.referenceDate
                ? ` · Reference date: ${new Date(boris.referenceDate).toLocaleDateString('en-GB')}`
                : ''}
            </p>
            <p className="mt-1 text-amber-600">
              Official value suggested — you can change it at any time.
            </p>
          </div>
        )}

        <SectionNotes
          value={noteValue('details')}
          onChange={(value) => setNote('details', value)}
          placeholder="Add any extra details or highlights about the property…"
        />
      </div>
    </Section>
  );
}
