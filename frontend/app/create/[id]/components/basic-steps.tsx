import { Check, LoaderCircle, MapPin, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input as ShadInput } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import type { ExposeData, PropertyPayload, SetProperty, StructuredAddress } from '../types';
import {
  BUILDING_STATUSES,
  PROPERTY_CONDITIONS,
  PROPERTY_TYPES,
  PROPERTY_USAGE_TYPES,
  RENOVATION_STATUSES,
  normalizeCondition,
  propertySubtypeOptions,
  subtypeKey,
} from '../types';
import type { WizardFieldCandidate } from '../document-prefill';
import { wizardCurrentValues } from '../document-prefill';
import { GroupCard, Input, Select, Section, Toggle, UnitInput } from './ui';
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
        <DocumentSources key={key} sources={sources?.[key]} currentValue={currentValues[key]} />
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
  const { query, suggestions, loading, lookupError, selected, address, onQueryChange, onSelect } =
    addressState;
  const { t } = useI18n();
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
              placeholder={t('address.searchPlaceholder')}
              aria-autocomplete="list"
              aria-expanded={showSuggestions}
            />
          </div>
          {loading && (
            <p className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> {t('address.searching')}
            </p>
          )}
          {lookupError && <p className="mt-2 text-sm text-destructive">{lookupError}</p>}
          {!loading &&
            query.trim().length >= 3 &&
            !suggestions.length &&
            !selected &&
            !lookupError && (
              <p className="mt-2 text-sm text-muted-foreground">{t('address.noResults')}</p>
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
                      {[
                        suggestion.postalCode,
                        suggestion.city,
                        suggestion.state,
                        suggestion.country,
                      ]
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
              <p className="text-sm font-semibold text-foreground">{t('address.selected')}</p>
            </div>
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
            >
              {t('address.change')}
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
          <p className="mt-2 text-xs text-muted-foreground">{t('address.hint')}</p>
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
  const { t } = useI18n();
  const setType = (type: string) => {
    const currentKey = subtypeKey(
      property.propertyType,
      exposeData.basicInformation.propertySubtype,
    );
    const subtypeStillValid = propertySubtypeOptions(type).some(([value]) => value === currentKey);
    set('propertyType', type);
    updateExposeData({
      basicInformation: {
        ...exposeData.basicInformation,
        propertyType: type,
        propertySubtype: subtypeStillValid ? exposeData.basicInformation.propertySubtype : null,
      },
    });
  };
  const setSubtype = (value: string) => {
    updateExposeData({
      basicInformation: { ...exposeData.basicInformation, propertySubtype: value || null },
    });
  };
  const setDetails = (patch: Partial<ExposeData['propertyDetails']>) =>
    updateExposeData({ propertyDetails: { ...details, ...patch } });

  const currentValues = wizardCurrentValues(property);
  const hasDocumentSources = sources && Object.keys(sources).length > 0;

  return (
    <Section
      title={t('steps.object.sectionTitle')}
      description={
        hasDocumentSources
          ? t('steps.object.sectionDescriptionWithDocs')
          : t('steps.object.sectionDescription')
      }
    >
      <div className="space-y-6">
        <GroupCard title={t('steps.object.groupObjectType')}>
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
                  {t(name)}
                </button>
              );
            })}
          </div>
          <DocumentSources
            sources={sources?.propertyType}
            currentValue={currentValues.propertyType}
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Select
                label={t('fields.propertySubtype')}
                value={
                  subtypeKey(property.propertyType, exposeData.basicInformation.propertySubtype) ??
                  ''
                }
                onChange={setSubtype}
                placeholder={t('steps.object.subtypePlaceholder')}
                options={propertySubtypeOptions(property.propertyType).map(
                  ([value, label]): [string, string] => [value, t(label)],
                )}
              />
              <DocumentSources
                sources={sources?.propertySubtype}
                currentValue={currentValues.propertySubtype}
              />
            </div>
            <div>
              <Select
                label={t('fields.usageType')}
                value={exposeData.basicInformation.usageType ?? ''}
                onChange={(value) =>
                  updateExposeData({
                    basicInformation: {
                      ...exposeData.basicInformation,
                      usageType: value || null,
                    },
                  })
                }
                placeholder={t('common.select')}
                options={PROPERTY_USAGE_TYPES.map(([value, label]): [string, string] => [
                  value,
                  t(label),
                ])}
              />
              <DocumentSources
                sources={sources?.usageType}
                currentValue={currentValues.usageType}
              />
            </div>
          </div>
        </GroupCard>

        <GroupCard title={t('steps.object.groupTransaction')}>
          <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
            {(
              [
                ['sale', 'steps.object.buy'],
                ['rent', 'steps.object.rent'],
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
                  {t(label)}
                </button>
              );
            })}
          </div>
          <DocumentSources
            sources={sources?.transactionType}
            currentValue={currentValues.transactionType}
          />
        </GroupCard>

        <GroupCard
          title={t('steps.object.groupAddress')}
          description={t('steps.object.groupAddressDescription')}
        >
          <AddressSection
            addressState={addressState}
            sources={sources}
            currentValues={currentValues}
          />
        </GroupCard>

        <GroupCard title={t('steps.object.groupAreasRooms')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <UnitInput
                label={t('fields.livingArea')}
                unit={t('expose.units.sqm')}
                value={details.livingArea ?? property.livingArea}
                onChange={(value) => set('livingArea', value ? Number(value) : null)}
                placeholder={t('steps.object.livingAreaExample')}
              />
              <DocumentSources
                sources={sources?.livingArea}
                currentValue={currentValues.livingArea}
              />
            </div>
            <div>
              <UnitInput
                label={t('fields.usableArea')}
                unit={t('expose.units.sqm')}
                value={details.usableArea}
                onChange={(value) => setDetails({ usableArea: value ? Number(value) : null })}
                placeholder={t('common.optional')}
              />
              <DocumentSources
                sources={sources?.usableArea}
                currentValue={currentValues.usableArea}
              />
            </div>
            <div>
              <UnitInput
                label={t('fields.plotArea')}
                unit={t('expose.units.sqm')}
                value={details.plotArea ?? property.plotArea}
                onChange={(value) => set('plotArea', value ? Number(value) : null)}
                placeholder={t('common.optional')}
              />
              <DocumentSources sources={sources?.plotArea} currentValue={currentValues.plotArea} />
            </div>
            <div>
              <UnitInput
                label={t('fields.rooms')}
                unit={t('expose.units.rooms')}
                type="number"
                value={details.rooms ?? property.rooms}
                onChange={(value) => set('rooms', value ? Number(value) : null)}
                placeholder={t('steps.object.roomsExample')}
              />
              <DocumentSources sources={sources?.rooms} currentValue={currentValues.rooms} />
            </div>
            <div>
              <UnitInput
                label={t('fields.bedrooms')}
                unit={t('expose.units.rooms')}
                type="number"
                value={property.bedrooms}
                onChange={(value) => set('bedrooms', value ? Number(value) : null)}
                placeholder={t('steps.object.bedroomsExample')}
              />
              <DocumentSources sources={sources?.bedrooms} currentValue={currentValues.bedrooms} />
            </div>
            <div>
              <UnitInput
                label={t('fields.bathrooms')}
                unit={t('expose.units.bathrooms')}
                type="number"
                value={details.bathrooms ?? property.bathrooms}
                onChange={(value) => set('bathrooms', value ? Number(value) : null)}
                placeholder={t('steps.object.bathroomsExample')}
              />
              <DocumentSources
                sources={sources?.bathrooms}
                currentValue={currentValues.bathrooms}
              />
            </div>
            <div>
              <UnitInput
                label={t('fields.guestToilets')}
                unit={t('expose.units.wc')}
                type="number"
                value={details.guestToilets}
                onChange={(value) => setDetails({ guestToilets: value ? Number(value) : null })}
                placeholder={t('common.optional')}
              />
              <DocumentSources
                sources={sources?.guestToilets}
                currentValue={currentValues.guestToilets}
              />
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
  const showShell = ['house', 'villa', 'semi-detached', 'terraced'].includes(property.propertyType);
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
  const { t } = useI18n();

  return (
    <Section
      title={t('steps.building.sectionTitle')}
      description={t('steps.building.sectionDescription')}
    >
      <div className="space-y-6">
        <GroupCard title={t('steps.building.groupBuildingMethod')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Input
                label={t('fields.constructionYear')}
                type="number"
                value={details.yearBuilt ?? property.constructionYear}
                onChange={(value) => set('constructionYear', value ? Number(value) : null)}
                placeholder={t('steps.building.yearBuiltExample')}
              />
              <DocumentSources
                sources={sources?.yearBuilt}
                currentValue={currentValues.yearBuilt}
              />
            </div>
            <div>
              <Select
                label={t('fields.objectStatus')}
                value={details.buildingStatus ?? ''}
                onChange={(value) =>
                  setDetails({ buildingStatus: (value || null) as 'new' | 'existing' | null })
                }
                placeholder={t('common.select')}
                options={BUILDING_STATUSES.map(([value, label]): [string, string] => [
                  value,
                  t(label),
                ])}
              />
              <DocumentSources
                sources={sources?.buildingStatus}
                currentValue={currentValues.buildingStatus}
              />
            </div>
            <div>
              <Select
                label={t('fields.condition')}
                value={condition}
                onChange={(value) => set('condition', value || null)}
                placeholder={t('common.select')}
                options={PROPERTY_CONDITIONS.map(([value, label]): [string, string] => [
                  value,
                  t(label),
                ])}
              />
              <DocumentSources
                sources={sources?.condition}
                currentValue={currentValues.condition}
              />
            </div>
          </div>
        </GroupCard>

        <GroupCard
          title={t('steps.building.groupRenovation')}
          description={t('steps.building.groupRenovationDescription')}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Select
                label={t('fields.renovationStatus')}
                value={details.renovationStatus ?? ''}
                onChange={(value) => setDetails({ renovationStatus: value || null })}
                placeholder={t('common.select')}
                options={RENOVATION_STATUSES.map(([value, label]): [string, string] => [
                  value,
                  t(label),
                ])}
              />
              <DocumentSources
                sources={sources?.renovationStatus}
                currentValue={currentValues.renovationStatus}
              />
            </div>
            <div>
              <Input
                label={t('fields.lastModernization')}
                type="number"
                value={details.lastModernizationYear}
                onChange={(value) =>
                  setDetails({ lastModernizationYear: value ? Number(value) : null })
                }
                placeholder={t('steps.building.lastModernizationExample')}
              />
              <DocumentSources
                sources={sources?.lastModernizationYear}
                currentValue={currentValues.lastModernizationYear}
              />
            </div>
          </div>
        </GroupCard>

        {showShell && (
          <GroupCard
            title={t('steps.building.groupFloorsBasement')}
            description={t('steps.building.groupFloorsBasementDescription')}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <UnitInput
                  label={t('fields.floors')}
                  unit={t('expose.units.floors')}
                  type="number"
                  value={details.numberOfFloors ?? property.totalFloors}
                  onChange={(value) => set('totalFloors', value ? Number(value) : null)}
                  placeholder={t('steps.building.floorsExample')}
                />
                <DocumentSources
                  sources={sources?.numberOfFloors}
                  currentValue={currentValues.numberOfFloors}
                />
              </div>
              <Toggle
                label={t('fields.basement')}
                checked={property.selectedFeatures.includes('basement')}
                onChange={() => toggleFeature('basement')}
              />
              <Toggle
                label={t('fields.attic')}
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
