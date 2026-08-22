import { LoaderCircle, Pencil, Sparkles } from 'lucide-react';
import { apiAssetUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input as ShadInput } from '@/components/ui/input';
import { Textarea as ShadTextarea } from '@/components/ui/textarea';
import type { ExposeContent, ExposeData, PropertyImage, PropertyPayload } from '../types';
import { money, pretty } from '../types';
import { Section } from './ui';

export function Review({
  property,
  images,
  onEdit,
  generateMetadata,
  metadataLoading,
  updateExposeData,
  noteValue,
}: {
  property: PropertyPayload;
  images: PropertyImage[];
  onEdit: (step: number) => void;
  generateMetadata: () => Promise<void>;
  metadataLoading: boolean;
  updateExposeData: (patch: Partial<ExposeData>) => void;
  noteValue: (key: string) => string;
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
    ...property.selectedFeatures,
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
            {row('Objektart', property.propertyType)}
            {row('Unterart', data.basicInformation.propertySubtype)}
            {row('Verwendungszweck', data.basicInformation.usageType)}
            {row('Kauf / Miete', property.transactionType)}
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
            {row('Objektstatus', data.propertyDetails.buildingStatus)}
            {row('Zustand', property.condition)}
            {row('Sanierungsstatus', data.propertyDetails.renovationStatus)}
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
            {row('Ausweistyp', energy.certificateType)}
            {row('Ausgestellt am', energy.certificateDate)}
            {row('Gültig bis', energy.certificateValidUntil)}
            {row('Baujahr laut Ausweis', energy.yearOfConstruction)}
            {row('Heizungsart', energy.heatingType)}
            {row('Energieträger', energy.primaryEnergySource)}
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
                {row('Provisionszahler', data.pricing.commissionPayer)}
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
            {(['features', 'energy', 'legal', 'photos', 'plans', 'agent'] as const).map((key) =>
              noteValue(key) ? (
                <p key={key}>
                  <span className="font-medium text-foreground capitalize">{key}: </span>
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