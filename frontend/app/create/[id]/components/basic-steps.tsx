import { LoaderCircle } from 'lucide-react';
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
    <div className="mt-3 space-y-2 border-t border-[#c8d9cb] pt-3">
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
  return (
    <Section
      title="Property Address"
      description="Start with the exact property address. Vista can use it as the foundation for location and property data."
    >
      <div className="relative">
        <label>
          <span className="label">Search address</span>
          <input
            autoFocus
            className="field"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Start typing a street, house number or city"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
          />
        </label>
        {loading && (
          <div className="mt-3 flex items-center gap-2 text-sm text-[#718078]">
            <LoaderCircle size={15} className="animate-spin" /> Searching addresses…
          </div>
        )}
        {lookupError && <p className="mt-3 text-sm text-red-700">{lookupError}</p>}
        {!loading &&
          query.trim().length >= 3 &&
          !suggestions.length &&
          !selected &&
          !lookupError && (
            <p className="mt-3 text-sm text-[#718078]">No matching addresses found.</p>
          )}
        {suggestions.length > 0 && (
          <div
            className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-[#dce4dc] bg-white shadow-xl"
            role="listbox"
          >
            {suggestions.map((suggestion, index) => (
              <button
                type="button"
                role="option"
                key={`${suggestion.formattedAddress}-${index}`}
                onClick={() => onSelect(suggestion)}
                className="block w-full border-b border-[#edf1ed] px-4 py-3 text-left last:border-0 hover:bg-[#f1f6f1]"
              >
                <span className="block text-sm font-bold text-[#33463a]">
                  {[suggestion.street, suggestion.houseNumber].filter(Boolean).join(' ') ||
                    suggestion.formattedAddress}
                </span>
                <span className="mt-1 block text-xs text-[#718078]">
                  {[suggestion.postalCode, suggestion.city, suggestion.state, suggestion.country]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <div className="mt-6 rounded-xl border border-[#c8d9cb] bg-[#f0f6f0] p-4">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#607b68]">
            Selected address
          </p>
          <p className="mt-2 font-bold text-[#304636]">
            {[
              [address.street, address.houseNumber].filter(Boolean).join(' '),
              [address.postalCode, address.city].filter(Boolean).join(' '),
            ]
              .filter(Boolean)
              .join(', ')}
          </p>
          <p className="mt-1 text-sm text-[#65736a]">
            {[address.street, address.houseNumber].filter(Boolean).join(' ')} ·{' '}
            {[address.postalCode, address.city, address.state, address.country]
              .filter(Boolean)
              .join(', ')}
          </p>
          <p className="mt-3 text-xs text-[#607b68]">
            Structured address saved. You can continue without entering it again.
          </p>
          <AddressDocumentSources sources={sources} />
        </div>
      )}
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
      <div className="grid gap-6">
        <div>
          <span className="label">Property type</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PROPERTY_TYPES.map(([key, name]) => (
              <button
                key={key}
                onClick={() => {
                  set('propertyType', key);
                  updateExposeData({
                    basicInformation: { ...exposeData.basicInformation, propertyType: key },
                  });
                }}
                className={`rounded-xl border px-3 py-3 text-left text-xs font-bold transition ${property.propertyType === key ? 'border-[#6e8b76] bg-[#eaf0ea] text-[#45614d]' : 'border-[#e0e5e0] bg-white text-[#66716a] hover:border-[#9caf9e]'}`}
              >
                {name}
              </button>
            ))}
          </div>
          <DocumentSources sources={sources?.propertyType} />
        </div>
        <div>
          <span className="label">What are you planning?</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => set('transactionType', 'sale')}
              className={`rounded-xl border px-4 py-4 text-left text-sm font-bold ${property.transactionType === 'sale' ? 'border-[#6e8b76] bg-[#eaf0ea] text-[#45614d]' : 'border-[#e0e5e0]'}`}
            >
              Sell
            </button>
            <button
              onClick={() => set('transactionType', 'rent')}
              className={`rounded-xl border px-4 py-4 text-left text-sm font-bold ${property.transactionType === 'rent' ? 'border-[#6e8b76] bg-[#eaf0ea] text-[#45614d]' : 'border-[#e0e5e0]'}`}
            >
              Rent
            </button>
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
      <div className="grid gap-5 sm:grid-cols-2">
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
          options={[
            ['', 'Select an option'],
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
        {borisLoading && <p className="text-sm text-[#718078]">Checking Bodenrichtwert…</p>}
        {boris?.available && boris.bodenrichtwert?.value != null && (
          <div className="sm:col-span-2 rounded-xl border border-[#d0a35a] bg-[#fdf9f0] px-4 py-3 text-xs text-[#7a6230]">
            <p className="font-bold">Bodenrichtwert {boris.bodenrichtwert.value} €/m²</p>
            <p>
              Source: {boris.source}
              {boris.referenceDate
                ? ` · Reference date: ${new Date(boris.referenceDate).toLocaleDateString('en-GB')}`
                : ''}
            </p>
            <p className="mt-1 text-[#9a7a2f]">
              Official value suggested — you can change it at any time.
            </p>
          </div>
        )}
      </div>
      <SectionNotes
        value={noteValue('details')}
        onChange={(value) => setNote('details', value)}
        placeholder="Add any extra details or highlights about the property…"
      />
    </Section>
  );
}
