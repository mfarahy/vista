import { LoaderCircle } from 'lucide-react';
import { defaultLocale, translate, useI18n, type Locale } from '@/lib/i18n';
import type { BorisEnrichment, ExposeData, PropertyPayload, SetProperty } from '../types';
import { LEGAL_FLAG_LABELS, additionalInfoLabel } from '../types';
import type { AdditionalInfoCandidate, WizardFieldCandidate } from '../document-prefill';
import { wizardCurrentValues } from '../document-prefill';
import { shouldShowInvestment } from '../wizard-steps';
import {
  GroupCard,
  DateInput,
  Input,
  Section,
  SectionNotes,
  Select,
  Textarea,
  Toggle,
  UnitInput,
} from './ui';
import { DocumentSources } from './document-sources';
import { AddressIntelligencePanel } from './debug';

function formatEuro(value?: number | null, locale: Locale = defaultLocale): string {
  if (value == null) return '';
  return translate(locale, 'finance.formatEuro', {
    value: new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US', {
      maximumFractionDigits: 0,
    }).format(value),
  });
}

function hasWegData(weg: ExposeData['weg'] | undefined): boolean {
  return Boolean(
    weg?.hausgeldEur != null || weg?.maintenanceReserveEur != null || weg?.coOwnershipShare != null,
  );
}

export function StepFinancial({
  property,
  set,
  exposeData,
  updateExposeData,
  sources,
  boris,
  borisLoading,
}: {
  property: PropertyPayload;
  set: SetProperty;
  exposeData: ExposeData;
  updateExposeData: (patch: Partial<ExposeData>) => void;
  sources?: Record<string, WizardFieldCandidate[]>;
  boris?: BorisEnrichment | null;
  borisLoading?: boolean;
}) {
  const pricing = exposeData.pricing;
  const sale = property.transactionType === 'sale';
  const showInvestment = shouldShowInvestment(
    exposeData.basicInformation.usageType,
    property.transactionType,
  );
  const setPricing = (patch: Partial<ExposeData['pricing']>) =>
    updateExposeData({ pricing: { ...pricing, ...patch } });
  const setRental = (patch: Partial<ExposeData['rental']>) =>
    updateExposeData({ rental: { ...(exposeData.rental ?? {}), ...patch } });
  const setWeg = (patch: Partial<ExposeData['weg']>) =>
    updateExposeData({ weg: { ...(exposeData.weg ?? {}), ...patch } });
  const setInvestment = (patch: Partial<ExposeData['investment']>) =>
    updateExposeData({ investment: { ...(exposeData.investment ?? {}), ...patch } });
  // WEG information is primarily relevant for an Eigentumswohnung. For other
  // property types it only appears when the documents actually produced data.
  const showWeg = property.propertyType === 'apartment' || hasWegData(exposeData.weg);
  const currentValues = wizardCurrentValues(property);
  const { locale, t } = useI18n();

  return (
    <Section
      title={t('steps.financial.sectionTitle')}
      description={t('steps.financial.sectionDescription')}
    >
      <div className="space-y-6">
        {sale ? (
          <GroupCard title={t('steps.financial.groupPurchasePrice')}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <UnitInput
                  label={t('fields.purchasePrice')}
                  unit={t('expose.units.euro')}
                  type="number"
                  value={pricing.purchasePrice ?? property.askingPrice}
                  onChange={(value) => set('askingPrice', value ? Number(value) : null)}
                  placeholder={t('steps.financial.purchasePlaceholder')}
                />
                <DocumentSources
                  sources={sources?.askingPrice}
                  currentValue={currentValues.askingPrice}
                />
              </div>
              <div>
                <UnitInput
                  label={t('fields.pricePerM2')}
                  unit={t('expose.units.euroPerSqm')}
                  type="number"
                  value={pricing.pricePerM2}
                  onChange={(value) => setPricing({ pricePerM2: value ? Number(value) : null })}
                  placeholder={t('steps.financial.onlyIfGiven')}
                />
                <DocumentSources
                  sources={sources?.pricePerM2}
                  currentValue={currentValues.pricePerM2}
                />
              </div>
              <div>
                <UnitInput
                  label={t('fields.landValue')}
                  unit={t('expose.units.euroPerSqm')}
                  type="number"
                  value={property.bodenrichtwert}
                  onChange={(value) => set('bodenrichtwert', value ? Number(value) : null)}
                  placeholder={
                    boris?.bodenrichtwert?.value != null
                      ? String(boris.bodenrichtwert.value)
                      : t('common.optional')
                  }
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {pricing.purchasePrice
                ? formatEuro(pricing.purchasePrice, locale)
                : t('steps.financial.noPrice')}{' '}
              ·{' '}
              {pricing.pricePerM2
                ? t('steps.financial.pricePerM2Value', {
                    value: formatEuro(pricing.pricePerM2, locale),
                  })
                : t('steps.financial.pricePerM2NotGiven')}
            </p>
          </GroupCard>
        ) : (
          <GroupCard title={t('steps.financial.groupRent')}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <UnitInput
                  label={t('steps.financial.coldRentLabel')}
                  unit={t('expose.units.euro')}
                  type="number"
                  value={property.coldRent}
                  onChange={(value) => set('coldRent', value ? Number(value) : null)}
                  placeholder={t('steps.financial.demandPlaceholder')}
                />
                <DocumentSources
                  sources={sources?.monthlyRent}
                  currentValue={currentValues.monthlyRent}
                />
              </div>
              <div>
                <UnitInput
                  label={t('steps.financial.additionalCostsLabel')}
                  unit={t('expose.units.euro')}
                  type="number"
                  value={pricing.additionalCosts ?? property.additionalCosts}
                  onChange={(value) => set('additionalCosts', value ? Number(value) : null)}
                  placeholder={t('steps.financial.additionalCostsPlaceholder')}
                />
                <DocumentSources
                  sources={sources?.additionalCosts}
                  currentValue={currentValues.additionalCosts}
                />
              </div>
              <div>
                <UnitInput
                  label={t('fields.deposit')}
                  unit={t('expose.units.euro')}
                  type="number"
                  value={property.deposit}
                  onChange={(value) => set('deposit', value ? Number(value) : null)}
                  placeholder={t('common.optional')}
                />
                <DocumentSources sources={sources?.deposit} currentValue={currentValues.deposit} />
              </div>
              <div>
                <DateInput
                  label={t('fields.availableFrom')}
                  value={property.availableFrom}
                  onChange={(value) => set('availableFrom', value)}
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {property.coldRent
                ? t('steps.financial.coldRentValue', {
                    value: formatEuro(property.coldRent, locale),
                  })
                : t('steps.financial.noRent')}
            </p>
          </GroupCard>
        )}

        {borisLoading && (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />{' '}
            {t('steps.financial.landValueChecking')}
          </p>
        )}

        {boris?.available && boris.bodenrichtwert?.value != null && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <p className="font-semibold">
              {t('steps.financial.landValueResult', { value: boris.bodenrichtwert.value })}
            </p>
            <p className="mt-0.5 text-amber-700">
              {t('steps.financial.source', { source: boris.source ?? '' })}
              {boris.referenceDate
                ? t('steps.financial.referenceDate', {
                    date: new Date(boris.referenceDate).toLocaleDateString(locale),
                  })
                : ''}
            </p>
            <p className="mt-1 text-amber-600">{t('steps.financial.landValueHint')}</p>
          </div>
        )}

        {sale && (
          <GroupCard title={t('steps.financial.groupCommission')}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <UnitInput
                  label={t('fields.commissionRate')}
                  unit={t('expose.units.percent')}
                  type="number"
                  value={pricing.commissionRate}
                  onChange={(value) => setPricing({ commissionRate: value ? Number(value) : null })}
                  placeholder={t('steps.financial.commissionPlaceholder')}
                />
                <DocumentSources
                  sources={sources?.commissionRate}
                  currentValue={currentValues.commissionRate}
                />
              </div>
              <div>
                <Select
                  label={t('fields.commissionPayer')}
                  value={pricing.commissionPayer ?? ''}
                  onChange={(value) =>
                    setPricing({
                      commissionPayer: (value || null) as ExposeData['pricing']['commissionPayer'],
                    })
                  }
                  placeholder={t('common.select')}
                  options={[
                    ['buyer', t('finance.buyer')],
                    ['seller', t('finance.seller')],
                    ['both', t('finance.both')],
                  ]}
                />
                <DocumentSources
                  sources={sources?.commissionPayer}
                  currentValue={currentValues.commissionPayer}
                />
              </div>
              <div className="flex items-end pb-1">
                <Toggle
                  label={t('steps.financial.vatIncluded')}
                  checked={pricing.commissionVatIncluded === true}
                  onChange={(checked) => setPricing({ commissionVatIncluded: checked || null })}
                />
              </div>
            </div>
          </GroupCard>
        )}

        {showWeg && (
          <GroupCard
            title={t('steps.financial.groupWeg')}
            description={t('steps.financial.groupWegDescription')}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <UnitInput
                  label={t('steps.financial.hausgeldLabel')}
                  unit={t('expose.units.euro')}
                  type="number"
                  value={exposeData.weg?.hausgeldEur}
                  onChange={(value) => setWeg({ hausgeldEur: value ? Number(value) : null })}
                  placeholder={t('steps.financial.hausgeldPlaceholder')}
                />
                <DocumentSources
                  sources={sources?.hausgeld}
                  currentValue={currentValues.hausgeld}
                />
              </div>
              <div>
                <UnitInput
                  label={t('fields.maintenanceReserve')}
                  unit={t('expose.units.euro')}
                  type="number"
                  value={exposeData.weg?.maintenanceReserveEur}
                  onChange={(value) =>
                    setWeg({ maintenanceReserveEur: value ? Number(value) : null })
                  }
                  placeholder={t('steps.financial.onlyIfGiven')}
                />
                <DocumentSources
                  sources={sources?.maintenanceReserve}
                  currentValue={currentValues.maintenanceReserve}
                />
              </div>
              <div>
                <Input
                  label={t('fields.coOwnershipShare')}
                  value={exposeData.weg?.coOwnershipShare ?? ''}
                  onChange={(value) => setWeg({ coOwnershipShare: value || null })}
                  placeholder={t('steps.financial.coOwnershipPlaceholder')}
                />
                <DocumentSources
                  sources={sources?.coOwnershipShare}
                  currentValue={currentValues.coOwnershipShare}
                />
              </div>
            </div>
          </GroupCard>
        )}

        {showInvestment && (
          <GroupCard
            title={t('steps.financial.groupRentYield')}
            description={t('steps.financial.groupRentYieldDescription')}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Toggle
                label={t('steps.financial.rented')}
                checked={exposeData.rental?.isRented === true}
                onChange={(checked) => setRental({ isRented: checked || null })}
              />
              <Toggle
                label={t('steps.financial.furnished')}
                checked={exposeData.rental?.furnished === true}
                onChange={(checked) => setRental({ furnished: checked || null })}
              />
              <div>
                <UnitInput
                  label={t('steps.financial.monthlyRentLabel')}
                  unit={t('expose.units.euro')}
                  type="number"
                  value={property.coldRent}
                  onChange={(value) => set('coldRent', value ? Number(value) : null)}
                  placeholder={t('common.optional')}
                />
              </div>
              <div>
                <UnitInput
                  label={t('fields.annualRent')}
                  unit={t('expose.units.euro')}
                  type="number"
                  value={exposeData.rental?.annualRent}
                  onChange={(value) => setRental({ annualRent: value ? Number(value) : null })}
                  placeholder={t('common.optional')}
                />
                <DocumentSources
                  sources={sources?.annualRent}
                  currentValue={currentValues.annualRent}
                />
              </div>
              <div>
                <UnitInput
                  label={t('steps.financial.additionalCostsMonthly')}
                  unit={t('expose.units.euro')}
                  type="number"
                  value={pricing.additionalCosts ?? property.additionalCosts}
                  onChange={(value) => set('additionalCosts', value ? Number(value) : null)}
                  placeholder={t('common.optional')}
                />
              </div>
              <div>
                <UnitInput
                  label={t('fields.deposit')}
                  unit={t('expose.units.euro')}
                  type="number"
                  value={property.deposit}
                  onChange={(value) => set('deposit', value ? Number(value) : null)}
                  placeholder={t('common.optional')}
                />
                <DocumentSources sources={sources?.deposit} currentValue={currentValues.deposit} />
              </div>
              <div>
                <DateInput
                  label={t('fields.availableFrom')}
                  value={property.availableFrom}
                  onChange={(value) => set('availableFrom', value)}
                />
              </div>
              <div>
                <UnitInput
                  label={t('fields.grossYieldTarget')}
                  unit={t('expose.units.percent')}
                  type="number"
                  value={exposeData.investment?.grossYieldTargetPercent}
                  onChange={(value) =>
                    setInvestment({
                      grossYieldTargetPercent: value ? Number(value) : null,
                    })
                  }
                  placeholder={t('common.optional')}
                />
                <DocumentSources
                  sources={sources?.grossYieldTarget}
                  currentValue={currentValues.grossYieldTarget}
                />
              </div>
              <div>
                <UnitInput
                  label={t('fields.grossYieldActual')}
                  unit={t('expose.units.percent')}
                  type="number"
                  value={exposeData.investment?.grossYieldActualPercent}
                  onChange={(value) =>
                    setInvestment({
                      grossYieldActualPercent: value ? Number(value) : null,
                    })
                  }
                  placeholder={t('common.optional')}
                />
                <DocumentSources
                  sources={sources?.grossYieldActual}
                  currentValue={currentValues.grossYieldActual}
                />
              </div>
            </div>
          </GroupCard>
        )}
      </div>
    </Section>
  );
}

export function StepLegal({
  exposeData,
  updateExposeData,
  sources,
  additionalInfo,
  noteValue,
  setNote,
}: {
  exposeData: ExposeData;
  updateExposeData: (patch: Partial<ExposeData>) => void;
  sources?: Record<string, WizardFieldCandidate[]>;
  additionalInfo: Record<string, AdditionalInfoCandidate[]>;
  noteValue: (key: string) => string;
  setNote: (key: string, value: string) => void;
}) {
  const flags = exposeData.additionalInformation.legalFlags ?? {};
  const setFlag = (key: keyof typeof flags, value: boolean) =>
    updateExposeData({
      additionalInformation: {
        ...exposeData.additionalInformation,
        legalFlags: { ...flags, [key]: value || null },
      },
    });
  const flagGroups = Object.entries(flags);
  const { locale, t } = useI18n();

  return (
    <Section
      title={t('steps.legal.sectionTitle')}
      description={t('steps.legal.sectionDescription')}
    >
      <div className="space-y-6">
        <GroupCard title={t('steps.legal.groupLegal')}>
          <div className="grid gap-2 sm:grid-cols-2">
            {flagGroups.map(([key, value]) => (
              <Toggle
                key={key}
                label={t(LEGAL_FLAG_LABELS[key] ?? key)}
                checked={value === true}
                onChange={(checked) => setFlag(key as keyof typeof flags, checked)}
              />
            ))}
            {flagGroups.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('steps.legal.noLegalFlags')}</p>
            )}
          </div>
          <div className="mt-4">
            <DocumentSources sources={sources?.usufruct} currentValue={flags.usufruct} />
            <DocumentSources sources={sources?.leasehold} currentValue={flags.leasehold} />
            <DocumentSources sources={sources?.foreclosure} currentValue={flags.foreclosure} />
            <DocumentSources
              sources={sources?.heritageProtection}
              currentValue={flags.heritageProtection}
            />
          </div>
        </GroupCard>

        <GroupCard
          title={t('steps.legal.groupAdditional')}
          description={t('steps.legal.groupAdditionalDescription')}
        >
          {Object.keys(additionalInfo).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('steps.legal.noAdditionalInfo')}</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(additionalInfo).map(([key, candidates]) => (
                <div key={key} className="rounded-lg border bg-card p-3.5">
                  <p className="text-sm font-semibold text-foreground">
                    {t(additionalInfoLabel(key))}
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {candidates.map((candidate, index) => (
                      <div
                        key={`${candidate.sourceDocumentId}-${index}`}
                        className="flex items-start justify-between gap-3 text-xs"
                      >
                        <span className="min-w-0 text-foreground">
                          {formatAdditionalValue(candidate.value, locale)}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {candidate.sourceFilename}
                        </span>
                      </div>
                    ))}
                  </div>
                  {candidates.some((candidate) => candidate.evidence) && (
                    <ul className="mt-2 space-y-1">
                      {candidates
                        .filter((candidate) => candidate.evidence)
                        .map((candidate, index) => (
                          <li key={`evidence-${index}`} className="text-xs text-muted-foreground">
                            {t('steps.legal.evidence', { evidence: candidate.evidence ?? '' })}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </GroupCard>

        <Textarea
          label={t('steps.legal.legalNotes')}
          value={exposeData.additionalInformation.legalNotes}
          onChange={(value) =>
            updateExposeData({
              additionalInformation: {
                ...exposeData.additionalInformation,
                legalNotes: value || null,
              },
            })
          }
          placeholder={t('steps.legal.legalNotesPlaceholder')}
        />

        <SectionNotes
          value={noteValue('legal')}
          onChange={(value) => setNote('legal', value)}
          placeholder={t('steps.legal.notesPlaceholder')}
        />
      </div>
    </Section>
  );
}

function formatAdditionalValue(
  value: string | number | boolean | null,
  locale: Locale = defaultLocale,
): string {
  if (value === null || value === undefined || value === '') {
    return translate(locale, 'steps.legal.emptyValue');
  }
  return String(value);
}

export function StepLocation({
  property,
  set,
  exposeData,
  updateExposeData,
  sources,
  propertyId,
  address,
  addressSelected,
  onData,
}: {
  property: PropertyPayload;
  set: SetProperty;
  exposeData: ExposeData;
  updateExposeData: (patch: Partial<ExposeData>) => void;
  sources?: Record<string, WizardFieldCandidate[]>;
  propertyId: string;
  address: ExposeData['basicInformation']['address'];
  addressSelected: boolean;
  onData?: (results: Record<string, unknown>) => void;
}) {
  const surroundings = property.surroundings ?? {};
  const currentValues = wizardCurrentValues(property);
  const { t } = useI18n();
  const setSurrounding = (key: string, value: string) =>
    set('surroundings', { ...surroundings, [key]: value });
  const rows: Array<[string, string, string]> = [
    [
      'transport',
      t('steps.location.surroundings.public_transport'),
      t('steps.location.surroundingsPlaceholders.public_transport'),
    ],
    [
      'schools',
      t('steps.location.surroundings.schools'),
      t('steps.location.surroundingsPlaceholders.schools'),
    ],
    [
      'childcare',
      t('steps.location.surroundings.kindergartens'),
      t('steps.location.surroundingsPlaceholders.kindergartens'),
    ],
    [
      'shopping',
      t('steps.location.surroundings.shopping'),
      t('steps.location.surroundingsPlaceholders.shopping'),
    ],
    [
      'medical',
      t('steps.location.surroundings.medical_care'),
      t('steps.location.surroundingsPlaceholders.medical_care'),
    ],
    [
      'parks',
      t('steps.location.surroundings.leisure'),
      t('steps.location.surroundingsPlaceholders.leisure'),
    ],
  ];

  return (
    <Section
      title={t('steps.location.sectionTitle')}
      description={t('steps.location.sectionDescription')}
    >
      <div className="space-y-6">
        <GroupCard title={t('steps.location.groupSurroundings')}>
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Input
                label={t('fields.district')}
                value={exposeData.location.district ?? property.district ?? ''}
                onChange={(value) => {
                  updateExposeData({
                    location: { ...exposeData.location, district: value || null },
                    basicInformation: {
                      ...exposeData.basicInformation,
                      address: {
                        ...exposeData.basicInformation.address,
                        district: value || null,
                      },
                    },
                  });
                  set('district', value || null);
                }}
                placeholder={t('steps.location.districtPlaceholder')}
              />
              <DocumentSources sources={sources?.district} currentValue={currentValues.district} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {rows.map(([key, label, placeholder]) => (
              <div key={key}>
                <Input
                  label={label}
                  value={surroundings[key] ?? ''}
                  onChange={(value) => setSurrounding(key, value)}
                  placeholder={placeholder}
                />
              </div>
            ))}
          </div>
        </GroupCard>

        {addressSelected && (
          <AddressIntelligencePanel
            propertyId={propertyId}
            property={property}
            address={address}
            onData={onData}
          />
        )}

        <Textarea
          label={t('steps.location.locationDescriptionLabel')}
          value={exposeData.location.description ?? property.locationNote ?? ''}
          onChange={(value) => {
            updateExposeData({
              location: { ...exposeData.location, description: value || null },
            });
            set('locationNote', value || null);
          }}
          placeholder={t('steps.location.locationDescriptionPlaceholder')}
          rows={3}
        />
      </div>
    </Section>
  );
}

export function StepYourInformation({
  property,
  set,
  exposeData,
  updateExposeData,
  setNote,
  noteValue,
}: {
  property: PropertyPayload;
  set: SetProperty;
  exposeData: ExposeData;
  updateExposeData: (patch: Partial<ExposeData>) => void;
  setNote: (key: string, value: string) => void;
  noteValue: (key: string) => string;
}) {
  const { t } = useI18n();
  return (
    <Section
      title={t('steps.yourDetails.sectionTitle')}
      description={t('steps.yourDetails.sectionDescription')}
    >
      <div className="space-y-5">
        <Textarea
          label={t('steps.yourDetails.specialLabel')}
          value={property.sellerDescription ?? ''}
          onChange={(value) => set('sellerDescription', value)}
          placeholder={t('steps.yourDetails.specialPlaceholder')}
        />
        <Textarea
          label={t('steps.yourDetails.impressionsLabel')}
          value={exposeData.additionalInformation.sellerNotes ?? ''}
          onChange={(value) =>
            updateExposeData({
              additionalInformation: {
                ...exposeData.additionalInformation,
                sellerNotes: value || null,
              },
            })
          }
          placeholder={t('steps.yourDetails.impressionsPlaceholder')}
        />
        <Textarea
          label={t('steps.yourDetails.mustKnowLabel')}
          value={property.specialNotes ?? ''}
          onChange={(value) => set('specialNotes', value)}
          placeholder={t('steps.yourDetails.mustKnowPlaceholder')}
        />
        <Textarea
          label={t('steps.yourDetails.suitedForLabel')}
          value={property.targetAudience ?? ''}
          onChange={(value) => set('targetAudience', value)}
          placeholder={t('steps.yourDetails.suitedForPlaceholder')}
        />
        <Textarea
          label={t('steps.yourDetails.notesLabel')}
          value={exposeData.additionalInformation.additionalInformation ?? ''}
          onChange={(value) =>
            updateExposeData({
              additionalInformation: {
                ...exposeData.additionalInformation,
                additionalInformation: value || null,
              },
            })
          }
          placeholder={t('steps.yourDetails.notesPlaceholder')}
        />
        <div className="rounded-lg border border-dashed bg-muted/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('steps.yourDetails.notesBoxHeading')}
          </p>
          <textarea
            className="mt-3 w-full resize-y rounded-md border bg-card p-2 text-sm"
            value={noteValue('yourInfo')}
            onChange={(event) => setNote('yourInfo', event.target.value)}
            placeholder={t('steps.yourDetails.internalNotesPlaceholder')}
          />
        </div>
      </div>
    </Section>
  );
}
