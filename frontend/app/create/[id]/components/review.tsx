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
            <Pencil className="size-3" /> Edit
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
      title="Review"
      description="Check everything and finish your listing title before generating the AI copy."
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Listing title & subtype
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Objekttitel (title)</span>
              <ShadInput
                className="w-full bg-card"
                value={title}
                onChange={(event) =>
                  updateExposeData({
                    basicInformation: { ...data.basicInformation, title: event.target.value },
                  })
                }
                placeholder="e.g. Helle 3-Zimmer-Wohnung"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Unterart (subtype)</span>
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
                placeholder="e.g. Altbauwohnung"
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
                <LoaderCircle className="size-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Generate title with AI
              </>
            )}
          </Button>
        </div>

        {block(
          'Address',
          1,
          <dl className="divide-y">
            {row(
              'Street',
              [data.basicInformation.address.street, data.basicInformation.address.houseNumber]
                .filter(Boolean)
                .join(' '),
            )}
            {row(
              'Postal code / city',
              [data.basicInformation.address.postalCode, data.basicInformation.address.city]
                .filter(Boolean)
                .join(' '),
            )}
            {row('District', data.basicInformation.address.district)}
            {row('Country', data.basicInformation.address.country)}
          </dl>,
        )}
        {block(
          'Property',
          2,
          <dl className="divide-y">
            {row('Type', property.propertyType)}
            {row('Transaction', property.transactionType)}
            {row('Year built', property.constructionYear)}
          </dl>,
        )}
        {block(
          'Details & price',
          3,
          <dl className="divide-y">
            {row('Living area (m²)', property.livingArea)}
            {row('Plot size (m²)', property.plotArea)}
            {row('Rooms', property.rooms)}
            {row('Bedrooms', property.bedrooms)}
            {row('Bathrooms', property.bathrooms)}
            {row('Floor', property.floor)}
            {row('Total floors', property.totalFloors)}
            {row('Available from', property.availableFrom)}
            {row('Condition', property.condition)}
            {row('Bodenrichtwert (€/m²)', property.bodenrichtwert)}
            {sale ? (
              <>
                {row('Asking price', property.askingPrice ? money(property.askingPrice) : null)}
                {row(
                  'Purchase costs',
                  property.additionalCosts ? money(property.additionalCosts) : null,
                )}
                {row('Commission', property.commission)}
                {row('Service charge / month', property.hausgeld ? money(property.hausgeld) : null)}
              </>
            ) : (
              <>
                {row('Cold rent / month', property.coldRent ? money(property.coldRent) : null)}
                {row(
                  'Additional costs / month',
                  property.additionalCosts ? money(property.additionalCosts) : null,
                )}
                {row(
                  'Total rent / month',
                  property.askingPrice ? money(property.askingPrice) : null,
                )}
                {row('Deposit', property.deposit ? money(property.deposit) : null)}
              </>
            )}
          </dl>,
        )}
        {block(
          'Features & equipment',
          4,
          <>
            {features.length ? (
              <p className="text-sm text-foreground">{features.join(', ')}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No features selected.</p>
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
          'Energy',
          5,
          <dl className="divide-y">
            {row('Certificate type', energy.certificateType)}
            {row('Construction year', energy.yearOfConstruction)}
            {row('Primary energy source', energy.primaryEnergySource)}
            {row('Final energy demand', energy.finalEnergyDemand)}
            {row('Final energy consumption', energy.finalEnergyConsumption)}
            {row('Efficiency class', energy.efficiencyClass)}
          </dl>,
        )}
        {block(
          'Photos',
          6,
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
            <p className="text-sm text-muted-foreground">No photos uploaded yet.</p>
          ),
        )}
        {block(
          'Plans & documents',
          7,
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
            <p className="text-sm text-muted-foreground">No plans or documents uploaded yet.</p>
          ),
        )}
        {block(
          'Agent / contact',
          8,
          <dl className="divide-y">
            {row('Name', data.agent?.name)}
            {row('Company', data.agent?.company)}
            {row('Phone', data.agent?.phone)}
            {row('Email', data.agent?.email)}
            {row('Website', data.agent?.website)}
          </dl>,
        )}
        {block(
          'Your notes',
          -1,
          <div className="space-y-3 text-sm text-muted-foreground">
            {(
              ['property', 'details', 'features', 'energy', 'photos', 'plans', 'agent'] as const
            ).map((key) =>
              noteValue(key) ? (
                <p key={key}>
                  <span className="font-medium text-foreground capitalize">{key}: </span>
                  {noteValue(key)}
                </p>
              ) : null,
            )}
            <p className="text-muted-foreground">
              Notes are optional — add highlights or extra information for each section.
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
    <Section title="AI content editor" description="Review or adjust the generated exposé content.">
      <div className="space-y-5">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Title</span>
          <ShadTextarea
            className="w-full resize-y"
            value={draft.title}
            onChange={(event) => setContent({ ...draft, title: event.target.value })}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Portal title</span>
          <ShadTextarea
            className="w-full resize-y"
            value={draft.portalTitle}
            onChange={(event) => setContent({ ...draft, portalTitle: event.target.value })}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Short description</span>
          <ShadTextarea
            className="w-full resize-y"
            value={draft.shortDescription}
            onChange={(event) => setContent({ ...draft, shortDescription: event.target.value })}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Main description</span>
          <ShadTextarea
            className="w-full resize-y"
            value={draft.mainDescription}
            onChange={(event) => setContent({ ...draft, mainDescription: event.target.value })}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Location description</span>
          <ShadTextarea
            className="w-full resize-y"
            value={draft.locationDescription}
            onChange={(event) => setContent({ ...draft, locationDescription: event.target.value })}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Target audience</span>
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
          onClick={() => onGenerate('Make the copy more premium and concise.')}
        >
          {loading ? (
            <>
              <LoaderCircle className="size-4 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Sparkles className="size-4" /> Regenerate with AI
            </>
          )}
        </Button>
      </div>
    </Section>
  );
}
