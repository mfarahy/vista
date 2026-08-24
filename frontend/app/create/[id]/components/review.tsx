import { AlertTriangle, Check, Info, LoaderCircle, Pencil, Sparkles } from 'lucide-react';
import { apiAssetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { defaultLocale, translate, useI18n, type Locale, type TranslationKey } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input as ShadInput } from '@/components/ui/input';
import { Textarea as ShadTextarea } from '@/components/ui/textarea';
import type { ExposeContent, ExposeData, PropertyImage, PropertyPayload } from '../types';
import {
  money,
  pretty,
  PROPERTY_TYPES,
  PROPERTY_USAGE_TYPES,
  BUILDING_STATUSES,
  ENERGY_CERTIFICATE_TYPES,
  ENERGY_SOURCES,
  FEATURE_OPTIONS,
  RENOVATION_STATUSES,
  conditionLabel,
  equipmentCategoryLabel,
  photoSectionLabel,
  propertySubtypeOptions,
  subtypeKey,
} from '../types';
import {
  REVIEW_CATEGORIES,
  REVIEW_CATEGORY_KEYS,
  reviewCategoryStatuses,
  type ReviewIssue,
} from '../review-checklist';
import { Section } from './ui';

/**
 * Compact attention list for the Prüfung step (Phase 10). Shows only
 * information that deserves attention — missing important facts, document
 * conflicts and analysis state — with a "Bearbeiten" action that navigates to
 * the relevant wizard step. Nothing here blocks Exposé generation.
 */
function ReviewAttention({
  issues,
  onEdit,
}: {
  issues: ReviewIssue[];
  onEdit: (step: number) => void;
}) {
  const { t } = useI18n();
  const statuses = reviewCategoryStatuses(issues);
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          {t('steps.review.hintsHeading')}
        </span>
        {!issues.length && <Check className="size-4 text-emerald-600" aria-hidden />}
      </div>
      <div className="mt-3 flex flex-wrap gap-2" aria-label={t('steps.review.statusLabel')}>
        {REVIEW_CATEGORIES.map((category) => {
          const attention = statuses[category] === 'attention';
          return (
            <span
              key={category}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium',
                attention
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700',
              )}
            >
              {attention ? (
                <AlertTriangle className="size-3" aria-hidden />
              ) : (
                <Check className="size-3" aria-hidden />
              )}
              {t(REVIEW_CATEGORY_KEYS[category])}
            </span>
          );
        })}
      </div>
      {issues.length ? (
        <ul className="mt-4 space-y-2.5">
          {issues.map((issue) => (
            <li
              key={issue.id}
              className="flex items-start justify-between gap-3 rounded-lg border bg-background/60 p-3.5"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                {issue.type === 'warning' ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                ) : (
                  <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{issue.title}</p>
                  {issue.detail && (
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{issue.detail}</p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => onEdit(issue.editStep)}
              >
                <Pencil className="size-3" /> {t('common.edit')}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{t('steps.review.noOpenIssues')}</p>
      )}
    </div>
  );
}

/** Renders the subtype only when it belongs to the chosen property type. */
function subtypeDisplay(
  propertyType: string,
  value?: string | null,
  locale: Locale = defaultLocale,
): string | undefined {
  if (!value) return undefined;
  const key = subtypeKey(propertyType, value);
  const entry = propertySubtypeOptions(propertyType).find(([optionKey]) => optionKey === key);
  return entry ? translate(locale, entry[1]) : value;
}

function enumLabel(
  options: ReadonlyArray<readonly [string, TranslationKey]>,
  value?: string | null,
  locale: Locale = defaultLocale,
): string | undefined {
  const option = options.find(([key, label]) => key === value || label === value);
  return option ? translate(locale, option[1]) : undefined;
}

/** Label for the persisted commission payer ("buyer" → "Käufer"). */
function commissionPayerLabel(
  value?: string | null,
  locale: Locale = defaultLocale,
): string | undefined {
  if (!value) return undefined;
  const keys: Record<string, TranslationKey> = {
    buyer: 'finance.buyer',
    seller: 'finance.seller',
    both: 'finance.both',
  };
  const key = keys[value];
  return key ? translate(locale, key) : undefined;
}

export function Review({
  property,
  images,
  onEdit,
  generateMetadata,
  metadataLoading,
  updateExposeData,
  noteValue,
  issues,
}: {
  property: PropertyPayload;
  images: PropertyImage[];
  onEdit: (step: number) => void;
  generateMetadata: () => Promise<void>;
  metadataLoading: boolean;
  updateExposeData: (patch: Partial<ExposeData>) => void;
  noteValue: (key: string) => string;
  issues: ReviewIssue[];
}) {
  const data = property.exposeData!;
  const { t, locale } = useI18n();
  const title = data.basicInformation.title ?? '';
  const subtitle = data.basicInformation.propertySubtype ?? '';
  const sale = property.transactionType === 'sale';
  const block = (label: string, editStep: number, children: React.ReactNode) => (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {editStep >= 0 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => onEdit(editStep)}
          >
            <Pencil className="size-3" /> {t('common.edit')}
          </Button>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
  const row = (dt: string, dd: string | number | null | undefined) =>
    dd != null && dd !== '' ? (
      <div className="flex justify-between gap-4 py-1 text-sm sm:grid sm:grid-cols-[180px_1fr]">
        <dt className="text-muted-foreground">{dt}</dt>
        <dd className="text-right font-medium text-foreground sm:text-left">
          {pretty(dd, locale)}
        </dd>
      </div>
    ) : null;
  const features = [
    ...property.selectedFeatures.map((feature) =>
      t(FEATURE_OPTIONS.find(([key]) => key === feature)?.[1] ?? feature),
    ),
    ...(property.additionalFeatures ? [property.additionalFeatures] : []),
  ];
  const energy = data.energy ?? {};
  const plans = images.filter(
    (image) => image.category === 'floor_plan' || image.category === 'document',
  );
  return (
    <Section
      title={t('steps.review.sectionTitle')}
      description={t('steps.review.sectionDescription')}
    >
      <div className="space-y-5">
        <ReviewAttention issues={issues} onEdit={onEdit} />
        <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {t('steps.review.titleBlock')}
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">
                {t('steps.review.titleLabel')}
              </span>
              <ShadInput
                className="w-full bg-card"
                value={title}
                onChange={(event) =>
                  updateExposeData({
                    basicInformation: { ...data.basicInformation, title: event.target.value },
                  })
                }
                placeholder={t('steps.review.titlePlaceholder')}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">
                {t('steps.review.subtitleLabel')}
              </span>
              <ShadInput
                className="w-full bg-card"
                value={subtitle}
                onChange={(event) =>
                  updateExposeData({
                    basicInformation: {
                      ...data.basicInformation,
                      propertySubtype: event.target.value,
                    },
                  })
                }
                placeholder={t('steps.review.subtitlePlaceholder')}
              />
            </label>
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            disabled={metadataLoading}
            onClick={generateMetadata}
          >
            {metadataLoading ? (
              <>
                <LoaderCircle className="size-4 animate-spin" /> {t('steps.review.generating')}
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> {t('steps.review.generateTitleWithAi')}
              </>
            )}
          </Button>
        </div>

        {block(
          t('steps.review.blockAddress'),
          1,
          <dl className="divide-y">
            {row(
              t('fields.street'),
              [data.basicInformation.address.street, data.basicInformation.address.houseNumber]
                .filter(Boolean)
                .join(' '),
            )}
            {row(
              `${t('fields.postalCode')} / ${t('fields.city')}`,
              [data.basicInformation.address.postalCode, data.basicInformation.address.city]
                .filter(Boolean)
                .join(' '),
            )}
            {row(t('fields.district'), data.basicInformation.address.district)}
            {row(t('fields.country'), data.basicInformation.address.country)}
          </dl>,
        )}
        {block(
          t('steps.review.blockProperty'),
          1,
          <dl className="divide-y">
            {row(
              t('fields.propertyType'),
              enumLabel(PROPERTY_TYPES, property.propertyType, locale),
            )}
            {row(
              t('fields.propertySubtype'),
              subtypeDisplay(property.propertyType, data.basicInformation.propertySubtype, locale),
            )}
            {row(
              t('fields.usageType'),
              enumLabel(PROPERTY_USAGE_TYPES, data.basicInformation.usageType, locale),
            )}
            {row(
              t('steps.review.transactionType'),
              property.transactionType === 'rent'
                ? t('steps.review.transactionRent')
                : t('steps.review.transactionSale'),
            )}
            {row(
              `${t('fields.livingArea')} (${t('expose.units.sqm')})`,
              data.propertyDetails.livingArea ?? property.livingArea,
            )}
            {row(
              `${t('fields.usableArea')} (${t('expose.units.sqm')})`,
              data.propertyDetails.usableArea,
            )}
            {row(
              `${t('fields.plotArea')} (${t('expose.units.sqm')})`,
              data.propertyDetails.plotArea ?? property.plotArea,
            )}
            {row(t('fields.rooms'), data.propertyDetails.rooms ?? property.rooms)}
            {row(t('fields.bedrooms'), property.bedrooms)}
            {row(t('fields.bathrooms'), data.propertyDetails.bathrooms ?? property.bathrooms)}
            {row(t('fields.guestToilets'), data.propertyDetails.guestToilets)}
          </dl>,
        )}
        {block(
          t('steps.review.blockBuilding'),
          2,
          <dl className="divide-y">
            {row(
              t('fields.constructionYear'),
              data.propertyDetails.yearBuilt ?? property.constructionYear,
            )}
            {row(
              t('fields.objectStatus'),
              enumLabel(BUILDING_STATUSES, data.propertyDetails.buildingStatus, locale),
            )}
            {row(t('fields.condition'), t(conditionLabel(property.condition)))}
            {row(
              t('fields.renovationStatus'),
              enumLabel(RENOVATION_STATUSES, data.propertyDetails.renovationStatus, locale),
            )}
            {row(t('fields.lastModernization'), data.propertyDetails.lastModernizationYear)}
            {row(t('fields.floors'), data.propertyDetails.numberOfFloors ?? property.totalFloors)}
            {row(
              t('fields.basement'),
              property.selectedFeatures.includes('basement') ? t('common.yes') : null,
            )}
            {row(
              t('fields.attic'),
              property.selectedFeatures.includes('attic') ? t('common.yes') : null,
            )}
          </dl>,
        )}
        {block(
          t('steps.review.blockFeatures'),
          3,
          <>
            {features.length ? (
              <p className="text-sm text-foreground">{features.join(', ')}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{t('steps.review.noFeatures')}</p>
            )}
            {data.equipment.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5 text-sm text-muted-foreground">
                {data.equipment.map((item) => (
                  <span key={item.name} className="rounded-md bg-muted px-2 py-1 text-xs">
                    {t(equipmentCategoryLabel(item.category))}: {item.name}
                  </span>
                ))}
              </div>
            ) : null}
          </>,
        )}
        {block(
          t('steps.review.blockEnergy'),
          4,
          <dl className="divide-y">
            {row(
              t('fields.certificateType'),
              enumLabel(ENERGY_CERTIFICATE_TYPES, energy.certificateType, locale),
            )}
            {row(t('fields.certificateDate'), energy.certificateDate)}
            {row(t('fields.certificateValidUntil'), energy.certificateValidUntil)}
            {row(t('fields.yearBuiltPerCertificate'), energy.yearOfConstruction)}
            {row(t('fields.heatingType'), energy.heatingType)}
            {row(
              t('fields.energySource'),
              enumLabel(ENERGY_SOURCES, energy.primaryEnergySource, locale),
            )}
            {row(t('fields.energyDemand'), energy.finalEnergyDemand)}
            {row(t('fields.energyConsumption'), energy.finalEnergyConsumption)}
            {row(t('fields.efficiencyClass'), energy.efficiencyClass)}
            {row(t('fields.hotWaterIncluded'), energy.hotWaterIncluded ? t('common.yes') : null)}
          </dl>,
        )}
        {block(
          t('steps.review.blockFinancials'),
          5,
          <dl className="divide-y">
            {sale ? (
              <>
                {row(
                  t('fields.purchasePrice'),
                  property.askingPrice ? money(property.askingPrice, locale) : null,
                )}
                {row(
                  t('fields.pricePerM2'),
                  data.pricing.pricePerM2 ? money(data.pricing.pricePerM2, locale) : null,
                )}
                {row(`${t('fields.commission')} (%)`, data.pricing.commissionRate)}
                {row(
                  t('fields.commissionPayer'),
                  commissionPayerLabel(data.pricing.commissionPayer, locale),
                )}
                {row(
                  t('fields.additionalCosts'),
                  property.additionalCosts ? money(property.additionalCosts, locale) : null,
                )}
              </>
            ) : (
              <>
                {row(
                  t('steps.financial.coldRentLabel'),
                  property.coldRent ? money(property.coldRent, locale) : null,
                )}
                {row(
                  t('steps.financial.additionalCostsLabel'),
                  property.additionalCosts ? money(property.additionalCosts, locale) : null,
                )}
                {row(
                  t('fields.deposit'),
                  property.deposit ? money(property.deposit, locale) : null,
                )}
              </>
            )}
            {row(t('fields.rented'), data.rental?.isRented ? t('common.yes') : null)}
            {row(t('fields.furnished'), data.rental?.furnished ? t('common.yes') : null)}
            {row(
              t('fields.annualRent'),
              data.rental?.annualRent ? money(data.rental.annualRent, locale) : null,
            )}
            {row(t('fields.grossYieldTarget'), data.investment?.grossYieldTargetPercent)}
            {row(t('fields.grossYieldActual'), data.investment?.grossYieldActualPercent)}
          </dl>,
        )}
        {block(
          t('steps.review.blockLegal'),
          6,
          <dl className="divide-y">
            {row(
              t('legalFlag.usufruct'),
              data.additionalInformation.legalFlags?.usufruct ? t('common.yes') : null,
            )}
            {row(
              t('legalFlag.leasehold'),
              data.additionalInformation.legalFlags?.leasehold ? t('common.yes') : null,
            )}
            {row(
              t('legalFlag.foreclosure'),
              data.additionalInformation.legalFlags?.foreclosure ? t('common.yes') : null,
            )}
            {row(
              t('legalFlag.heritageProtection'),
              data.additionalInformation.legalFlags?.heritageProtection ? t('common.yes') : null,
            )}
            {row(t('steps.legal.legalNotes'), data.additionalInformation.legalNotes)}
          </dl>,
        )}
        {block(
          t('steps.review.blockLocation'),
          7,
          <dl className="divide-y">
            {row(t('fields.district'), data.location.district)}
            {row(
              t('steps.location.surroundings.public_transport'),
              property.surroundings.transport,
            )}
            {row(t('steps.location.surroundings.schools'), property.surroundings.schools)}
            {row(t('steps.location.surroundings.kindergartens'), property.surroundings.childcare)}
            {row(t('steps.location.surroundings.shopping'), property.surroundings.shopping)}
            {row(t('steps.location.surroundings.medical_care'), property.surroundings.medical)}
            {row(
              t('steps.location.surroundings.leisure'),
              property.surroundings.parks || property.surroundings.restaurants,
            )}
          </dl>,
        )}
        {block(
          t('steps.review.blockYourDetails'),
          8,
          <div className="space-y-3 text-sm text-muted-foreground">
            {[
              ['sellerDescription', 'steps.review.specialLabel'],
              ['specialNotes', 'steps.review.mustKnowLabel'],
              ['targetAudience', 'steps.review.suitedForLabel'],
            ].map(([key, labelKey]) =>
              property[key as keyof PropertyPayload] ? (
                <p key={key}>
                  <span className="font-medium text-foreground">{t(labelKey)}: </span>
                  {String(property[key as keyof PropertyPayload])}
                </p>
              ) : null,
            )}
            {noteValue('yourInfo') ? (
              <p>
                <span className="font-medium text-foreground">
                  {t('steps.review.internalNotes')}
                </span>
                {noteValue('yourInfo')}
              </p>
            ) : null}
          </div>,
        )}
        {block(
          t('steps.review.blockPhotos'),
          9,
          images.length ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {images.slice(0, 6).map((image) => (
                <img
                  key={image.id}
                  src={apiAssetUrl(image.url)}
                  alt={image.fileName}
                  className="h-24 w-full rounded-lg object-cover"
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('steps.review.noPhotos')}</p>
          ),
        )}
        {block(
          t('steps.review.blockPlans'),
          10,
          plans.length ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {plans.slice(0, 6).map((image) => (
                <img
                  key={image.id}
                  src={apiAssetUrl(image.url)}
                  alt={t(photoSectionLabel(image.subcategory))}
                  className="h-24 w-full rounded-lg object-cover"
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('steps.review.noPlans')}</p>
          ),
        )}
        {block(
          t('steps.review.blockAgent'),
          11,
          <dl className="divide-y">
            {row(t('fields.name'), data.agent?.name)}
            {row(t('fields.company'), data.agent?.company)}
            {row(t('fields.phone'), data.agent?.phone)}
            {row(t('fields.email'), data.agent?.email)}
            {row(t('fields.website'), data.agent?.website)}
          </dl>,
        )}
        {block(
          t('steps.review.blockYourNotes'),
          -1,
          <div className="space-y-3 text-sm text-muted-foreground">
            {(
              [
                ['features', 'steps.review.notesSectionFeatures'],
                ['energy', 'steps.review.notesSectionEnergy'],
                ['legal', 'steps.review.notesSectionLegal'],
                ['photos', 'steps.review.notesSectionPhotos'],
                ['plans', 'steps.review.notesSectionPlans'],
                ['agent', 'steps.review.notesSectionAgent'],
              ] as const
            ).map(([key, labelKey]) =>
              noteValue(key) ? (
                <p key={key}>
                  <span className="font-medium text-foreground">{t(labelKey)}: </span>
                  {noteValue(key)}
                </p>
              ) : null,
            )}
            <p className="text-muted-foreground">{t('steps.review.notesFootnote')}</p>
          </div>,
        )}
      </div>
    </Section>
  );
}

export function ContentEditor({
  content,
  setContent,
  onGenerate,
  loading,
  saving,
}: {
  content: ExposeContent | null;
  setContent: (value: ExposeContent) => void;
  onGenerate: (action?: string) => Promise<void>;
  loading: boolean;
  saving: boolean;
}) {
  const draft = content ?? {
    title: '',
    portalTitle: '',
    shortDescription: '',
    mainDescription: '',
    highlights: [],
    roomDescriptions: [],
    locationDescription: '',
    targetAudience: '',
    factualSnapshot: [],
  };
  const { t } = useI18n();
  return (
    <Section
      title={t('steps.review.blockAiEditor')}
      description={t('steps.review.aiEditorDescription')}
    >
      <div className="space-y-5">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('steps.review.titleField')}
          </span>
          <ShadTextarea
            className="w-full resize-y"
            value={draft.title}
            onChange={(event) => setContent({ ...draft, title: event.target.value })}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('steps.review.portalTitle')}
          </span>
          <ShadTextarea
            className="w-full resize-y"
            value={draft.portalTitle}
            onChange={(event) => setContent({ ...draft, portalTitle: event.target.value })}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('steps.review.shortDescription')}
          </span>
          <ShadTextarea
            className="w-full resize-y"
            value={draft.shortDescription}
            onChange={(event) => setContent({ ...draft, shortDescription: event.target.value })}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('steps.review.mainDescription')}
          </span>
          <ShadTextarea
            className="w-full resize-y"
            value={draft.mainDescription}
            onChange={(event) => setContent({ ...draft, mainDescription: event.target.value })}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('steps.review.locationDescription')}
          </span>
          <ShadTextarea
            className="w-full resize-y"
            value={draft.locationDescription}
            onChange={(event) => setContent({ ...draft, locationDescription: event.target.value })}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('steps.review.targetAudience')}
          </span>
          <ShadTextarea
            className="w-full resize-y"
            value={draft.targetAudience}
            onChange={(event) => setContent({ ...draft, targetAudience: event.target.value })}
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          disabled={loading || saving}
          onClick={() => onGenerate(t('steps.review.improvePrompt'))}
        >
          {loading ? (
            <>
              <LoaderCircle className="size-4 animate-spin" /> {t('steps.review.generating')}
            </>
          ) : (
            <>
              <Sparkles className="size-4" /> {t('steps.review.regenerate')}
            </>
          )}
        </Button>
      </div>
    </Section>
  );
}
