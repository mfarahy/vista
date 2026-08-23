import { AlertTriangle, Check, Info, LoaderCircle, Pencil, Sparkles } from 'lucide-react';
import { apiAssetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input as ShadInput } from '@/components/ui/input';
import { Textarea as ShadTextarea } from '@/components/ui/textarea';
import type { ExposeContent, ExposeData, PropertyImage, PropertyPayload } from '../types';
import {
  money,
  pretty,
  PROPERTY_SUBTYPES,
  PROPERTY_TYPES,
  PROPERTY_USAGE_TYPES,
  BUILDING_STATUSES,
  ENERGY_CERTIFICATE_TYPES,
  ENERGY_SOURCES,
  FEATURE_OPTIONS,
  RENOVATION_STATUSES,
  conditionLabel,
  subtypeLabel,
} from '../types';
import { REVIEW_CATEGORIES, reviewCategoryStatuses, type ReviewIssue } from '../review-checklist';
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
  const statuses = reviewCategoryStatuses(issues);
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">Prüfhinweise</span>
        {!issues.length && <Check className="size-4 text-emerald-600" aria-hidden />}
      </div>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Status der Prüfbereiche">
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
              {category}
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
                <Pencil className="size-3" /> Bearbeiten
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Keine offenen Hinweise — Ihre Angaben sind bereit für das Exposé.
        </p>
      )}
    </div>
  );
}

/** Renders the subtype only when it belongs to the chosen property type. */
function subtypeDisplay(propertyType: string, value?: string | null): string | undefined {
  if (!value) return undefined;
  const options = PROPERTY_SUBTYPES[propertyType] ?? [];
  return options.some(([key, label]) => key === value || label === value)
    ? subtypeLabel(propertyType, value)
    : undefined;
}

function enumLabel(
  options: ReadonlyArray<readonly [string, string]>,
  value?: string | null,
): string | undefined {
  const option = options.find(([key, label]) => key === value || label === value);
  return option ? option[1] : undefined;
}

/** German label for the persisted commission payer ("buyer" → "Käufer"). */
function commissionPayerLabel(value?: string | null): string | undefined {
  const labels: Record<string, string> = { buyer: 'Käufer', seller: 'Verkäufer', both: 'Beide' };
  return value ? labels[value] : undefined;
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
            <Pencil className="size-3" /> Bearbeiten
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
        <dd className="text-right font-medium text-foreground sm:text-left">{pretty(dd)}</dd>
      </div>
    ) : null;
  const features = [
    ...property.selectedFeatures.map(
      (feature) => FEATURE_OPTIONS.find(([key]) => key === feature)?.[1] ?? feature,
    ),
    ...(property.additionalFeatures ? [property.additionalFeatures] : []),
  ];
  const energy = data.energy ?? {};
  const plans = images.filter(
    (image) => image.category === 'floor_plan' || image.category === 'document',
  );
  return (
    <Section
      title="Prüfung"
      description="Prüfen Sie alles und vervollständigen Sie den Objekttitel, bevor Sie die KI-Texte erzeugen."
    >
      <div className="space-y-5">
        <ReviewAttention issues={issues} onEdit={onEdit} />
        <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Objekttitel & Untertitel
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Objekttitel (Titel)</span>
              <ShadInput
                className="w-full bg-card"
                value={title}
                onChange={(event) =>
                  updateExposeData({
                    basicInformation: { ...data.basicInformation, title: event.target.value },
                  })
                }
                placeholder="z. B. Helle 3-Zimmer-Wohnung"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">
                Objektunterart (Untertitel)
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
                placeholder="z. B. Altbauwohnung"
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
                <LoaderCircle className="size-4 animate-spin" /> Wird erzeugt…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Titel mit KI erzeugen
              </>
            )}
          </Button>
        </div>

        {block(
          'Adresse',
          1,
          <dl className="divide-y">
            {row(
              'Straße',
              [data.basicInformation.address.street, data.basicInformation.address.houseNumber]
                .filter(Boolean)
                .join(' '),
            )}
            {row(
              'PLZ / Ort',
              [data.basicInformation.address.postalCode, data.basicInformation.address.city]
                .filter(Boolean)
                .join(' '),
            )}
            {row('Stadtteil', data.basicInformation.address.district)}
            {row('Land', data.basicInformation.address.country)}
          </dl>,
        )}
        {block(
          'Objekt',
          1,
          <dl className="divide-y">
            {row('Objektart', enumLabel(PROPERTY_TYPES, property.propertyType))}
            {row(
              'Unterart',
              subtypeDisplay(property.propertyType, data.basicInformation.propertySubtype),
            )}
            {row('Verwendungszweck', enumLabel(PROPERTY_USAGE_TYPES, data.basicInformation.usageType))}
            {row('Kauf / Miete', property.transactionType === 'rent' ? 'Mieten' : 'Kaufen')}
            {row('Wohnfläche (m²)', data.propertyDetails.livingArea ?? property.livingArea)}
            {row('Nutzfläche (m²)', data.propertyDetails.usableArea)}
            {row('Grundstücksfläche (m²)', data.propertyDetails.plotArea ?? property.plotArea)}
            {row('Zimmer', data.propertyDetails.rooms ?? property.rooms)}
            {row('Schlafzimmer', property.bedrooms)}
            {row('Badezimmer', data.propertyDetails.bathrooms ?? property.bathrooms)}
            {row('Gäste-WCs', data.propertyDetails.guestToilets)}
          </dl>,
        )}
        {block(
          'Gebäude',
          2,
          <dl className="divide-y">
            {row('Baujahr', data.propertyDetails.yearBuilt ?? property.constructionYear)}
            {row(
              'Objektstatus',
              enumLabel(BUILDING_STATUSES, data.propertyDetails.buildingStatus),
            )}
            {row('Zustand', conditionLabel(property.condition))}
            {row('Sanierungsstatus', enumLabel(RENOVATION_STATUSES, data.propertyDetails.renovationStatus))}
            {row('Letzte Modernisierung', data.propertyDetails.lastModernizationYear)}
            {row('Etagen', data.propertyDetails.numberOfFloors ?? property.totalFloors)}
            {row('Keller', property.selectedFeatures.includes('basement') ? 'Ja' : null)}
            {row('Dachgeschoss', property.selectedFeatures.includes('attic') ? 'Ja' : null)}
          </dl>,
        )}
        {block(
          'Ausstattung',
          3,
          <>
            {features.length ? (
              <p className="text-sm text-foreground">{features.join(', ')}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Keine Ausstattung gewählt.</p>
            )}
            {data.equipment.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5 text-sm text-muted-foreground">
                {data.equipment.map((item) => (
                  <span key={item.name} className="rounded-md bg-muted px-2 py-1 text-xs">
                    {item.category}: {item.name}
                  </span>
                ))}
              </div>
            ) : null}
          </>,
        )}
        {block(
          'Energie',
          4,
          <dl className="divide-y">
            {row('Ausweistyp', enumLabel(ENERGY_CERTIFICATE_TYPES, energy.certificateType))}
            {row('Ausgestellt am', energy.certificateDate)}
            {row('Gültig bis', energy.certificateValidUntil)}
            {row('Baujahr laut Ausweis', energy.yearOfConstruction)}
            {row('Heizungsart', energy.heatingType)}
            {row('Energieträger', enumLabel(ENERGY_SOURCES, energy.primaryEnergySource))}
            {row('Endenergiebedarf', energy.finalEnergyDemand)}
            {row('Endenergieverbrauch', energy.finalEnergyConsumption)}
            {row('Effizienzklasse', energy.efficiencyClass)}
            {row('Warmwasser enthalten', energy.hotWaterIncluded ? 'Ja' : null)}
          </dl>,
        )}
        {block(
          'Finanzen',
          5,
          <dl className="divide-y">
            {sale ? (
              <>
                {row(
                  'Kaufpreis',
                  property.askingPrice ? money(property.askingPrice) : null,
                )}
                {row('Kaufpreis / m²', data.pricing.pricePerM2 ? money(data.pricing.pricePerM2) : null)}
                {row('Provision (%)', data.pricing.commissionRate)}
                {row('Provisionszahler', commissionPayerLabel(data.pricing.commissionPayer))}
                {row('Nebenkosten', property.additionalCosts ? money(property.additionalCosts) : null)}
              </>
            ) : (
              <>
                {row('Kaltmiete / Monat', property.coldRent ? money(property.coldRent) : null)}
                {row(
                  'Nebenkosten / Monat',
                  property.additionalCosts ? money(property.additionalCosts) : null,
                )}
                {row('Kaution', property.deposit ? money(property.deposit) : null)}
              </>
            )}
            {row('Vermietet', data.rental?.isRented ? 'Ja' : null)}
            {row('Möbliert', data.rental?.furnished ? 'Ja' : null)}
            {row('Jahresmiete', data.rental?.annualRent ? money(data.rental.annualRent) : null)}
            {row('Bruttorendite (Soll)', data.investment?.grossYieldTargetPercent)}
            {row('Bruttorendite (Ist)', data.investment?.grossYieldActualPercent)}
          </dl>,
        )}
        {block(
          'Recht & Zusätzliches',
          6,
          <dl className="divide-y">
            {row('Nießbrauch', data.additionalInformation.legalFlags?.usufruct ? 'Ja' : null)}
            {row('Erbbaurecht', data.additionalInformation.legalFlags?.leasehold ? 'Ja' : null)}
            {row(
              'Zwangsversteigerung',
              data.additionalInformation.legalFlags?.foreclosure ? 'Ja' : null,
            )}
            {row(
              'Denkmalschutz',
              data.additionalInformation.legalFlags?.heritageProtection ? 'Ja' : null,
            )}
            {row('Rechtliche Notizen', data.additionalInformation.legalNotes)}
          </dl>,
        )}
        {block(
          'Lage',
          7,
          <dl className="divide-y">
            {row('Stadtteil', data.location.district)}
            {row('Öffentlicher Nahverkehr', property.surroundings.transport)}
            {row('Schulen', property.surroundings.schools)}
            {row('Kindergärten', property.surroundings.childcare)}
            {row('Einkaufen', property.surroundings.shopping)}
            {row('Medizin', property.surroundings.medical)}
            {row('Freizeit', property.surroundings.parks || property.surroundings.restaurants)}
          </dl>,
        )}
        {block(
          'Ihre Angaben',
          8,
          <div className="space-y-3 text-sm text-muted-foreground">
            {[
              ['sellerDescription', 'Was die Immobilie besonders macht'],
              ['specialNotes', 'Was Interessenten wissen sollten'],
              ['targetAudience', 'Geeignet für'],
            ].map(([key, label]) =>
              property[key as keyof PropertyPayload] ? (
                <p key={key}>
                  <span className="font-medium text-foreground">{label}: </span>
                  {String(property[key as keyof PropertyPayload])}
                </p>
              ) : null,
            )}
            {noteValue('yourInfo') ? (
              <p>
                <span className="font-medium text-foreground">Interne Notizen: </span>
                {noteValue('yourInfo')}
              </p>
            ) : null}
          </div>,
        )}
        {block(
          'Fotos',
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
            <p className="text-sm text-muted-foreground">Noch keine Fotos hochgeladen.</p>
          ),
        )}
        {block(
          'Pläne & Dokumente',
          10,
          plans.length ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {plans.slice(0, 6).map((image) => (
                <img
                  key={image.id}
                  src={apiAssetUrl(image.url)}
                  alt={image.subcategory || 'document'}
                  className="h-24 w-full rounded-lg object-cover"
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Noch keine Pläne oder Dokumente hochgeladen.
            </p>
          ),
        )}
        {block(
          'Agent / Kontakt',
          11,
          <dl className="divide-y">
            {row('Name', data.agent?.name)}
            {row('Unternehmen', data.agent?.company)}
            {row('Telefon', data.agent?.phone)}
            {row('E-Mail', data.agent?.email)}
            {row('Website', data.agent?.website)}
          </dl>,
        )}
        {block(
          'Ihre Notizen',
          -1,
          <div className="space-y-3 text-sm text-muted-foreground">
            {(
              [
                ['features', 'Ausstattung'],
                ['energy', 'Energie'],
                ['legal', 'Recht & Zusätzliches'],
                ['photos', 'Fotos'],
                ['plans', 'Pläne & Dokumente'],
                ['agent', 'Agent'],
              ] as const
            ).map(([key, label]) =>
              noteValue(key) ? (
                <p key={key}>
                  <span className="font-medium text-foreground">{label}: </span>
                  {noteValue(key)}
                </p>
              ) : null,
            )}
            <p className="text-muted-foreground">
              Notizen sind optional — Highlights und Zusatzinformationen je Abschnitt.
            </p>
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
  return (
    <Section title="KI-Inhaltseditor" description="Erzeugte Exposé-Inhalte prüfen oder anpassen.">
      <div className="space-y-5">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Titel</span>
          <ShadTextarea
            className="w-full resize-y"
            value={draft.title}
            onChange={(event) => setContent({ ...draft, title: event.target.value })}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Portal-Titel</span>
          <ShadTextarea
            className="w-full resize-y"
            value={draft.portalTitle}
            onChange={(event) => setContent({ ...draft, portalTitle: event.target.value })}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Kurzbeschreibung</span>
          <ShadTextarea
            className="w-full resize-y"
            value={draft.shortDescription}
            onChange={(event) => setContent({ ...draft, shortDescription: event.target.value })}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Hauptbeschreibung</span>
          <ShadTextarea
            className="w-full resize-y"
            value={draft.mainDescription}
            onChange={(event) => setContent({ ...draft, mainDescription: event.target.value })}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Lagebeschreibung</span>
          <ShadTextarea
            className="w-full resize-y"
            value={draft.locationDescription}
            onChange={(event) => setContent({ ...draft, locationDescription: event.target.value })}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Zielgruppe</span>
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
          onClick={() => onGenerate('Mach den Text hochwertiger und prägnanter.')}
        >
          {loading ? (
            <>
              <LoaderCircle className="size-4 animate-spin" /> Wird erzeugt…
            </>
          ) : (
            <>
              <Sparkles className="size-4" /> Mit KI neu erzeugen
            </>
          )}
        </Button>
      </div>
    </Section>
  );
}