import { LoaderCircle, Sparkles } from 'lucide-react';
import { apiAssetUrl } from '@/lib/api';
import type { ExposeContent, ExposeData, PropertyImage, PropertyPayload } from '../types';
import { money, pretty } from '../types';
import { Section, Textarea } from './ui';

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
    <div className="rounded-2xl border border-[#e1e7e1] bg-[#fafcfb] p-4">
      <div className="flex items-center justify-between">
        <p className="font-bold text-[#415743]">{label}</p>
        {editStep >= 0 && (
          <button type="button" onClick={() => onEdit(editStep)} className="text-sm text-[#607b68]">
            Edit
          </button>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
  const row = (dt: string, dd: string | number | null | undefined) =>
    dd != null && dd !== '' ? (
      <div className="sm:grid sm:grid-cols-[170px_1fr] sm:gap-2 text-sm text-[#59675f]">
        <dt className="font-bold text-[#3b4b40]">{dt}</dt>
        <dd>{pretty(dd)}</dd>
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
        <div className="rounded-2xl border border-[#d5e0d7] bg-[#eef5ef] p-4">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#607b68]">
            Listing title & subtype
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="label">Objekttitel (title)</span>
              <input
                className="field"
                value={title}
                onChange={(event) =>
                  updateExposeData({
                    basicInformation: { ...data.basicInformation, title: event.target.value },
                  })
                }
                placeholder="e.g. Helle 3-Zimmer-Wohnung"
              />
            </label>
            <label>
              <span className="label">Unterart (subtype)</span>
              <input
                className="field"
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
          <button
            type="button"
            onClick={generateMetadata}
            disabled={metadataLoading}
            className="btn btn-secondary mt-4 px-3 py-2 text-xs"
          >
            {metadataLoading ? (
              <span className="inline-flex items-center gap-1.5">
                <LoaderCircle size={14} className="animate-spin" /> Generating…
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Sparkles size={14} /> Generate title with AI
              </span>
            )}
          </button>
        </div>

        {block(
          'Address',
          0,
          <dl>
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
          1,
          <dl>
            {row('Type', property.propertyType)}
            {row('Transaction', property.transactionType)}
            {row('Year built', property.constructionYear)}
          </dl>,
        )}
        {block(
          'Details & price',
          2,
          <dl>
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
          3,
          <>
            {features.length ? (
              <p className="text-sm text-[#59675f]">{features.join(', ')}</p>
            ) : (
              <p className="text-sm text-[#78847c]">No features selected.</p>
            )}
            {data.equipment.length ? (
              <div className="mt-2 text-sm text-[#59675f]">
                {data.equipment.map((item) => (
                  <span key={item.name} className="mr-2">
                    {item.category}: {item.name}
                  </span>
                ))}
              </div>
            ) : null}
          </>,
        )}
        {block(
          'Energy',
          4,
          <dl>
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
          5,
          images.length ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {images.slice(0, 6).map((image) => (
                <img
                  key={image.id}
                  src={apiAssetUrl(image.url)}
                  alt={image.fileName}
                  className="h-24 w-full rounded-xl object-cover"
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#78847c]">No photos uploaded yet.</p>
          ),
        )}
        {block(
          'Plans & documents',
          6,
          plans.length ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {plans.slice(0, 6).map((image) => (
                <img
                  key={image.id}
                  src={apiAssetUrl(image.url)}
                  alt={image.subcategory || 'document'}
                  className="h-24 w-full rounded-xl object-cover"
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#78847c]">No plans or documents uploaded yet.</p>
          ),
        )}
        {block(
          'Agent / contact',
          7,
          <dl>
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
          <div className="space-y-3 text-sm text-[#59675f]">
            {(
              ['property', 'details', 'features', 'energy', 'photos', 'plans', 'agent'] as const
            ).map((key) =>
              noteValue(key) ? (
                <p key={key}>
                  <span className="font-bold text-[#3b4b40] capitalize">{key}: </span>
                  {noteValue(key)}
                </p>
              ) : null,
            )}
            <p className="text-[#78847c]">
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
        <Textarea
          label="Title"
          value={draft.title}
          onChange={(value) => setContent({ ...draft, title: value })}
        />
        <Textarea
          label="Portal title"
          value={draft.portalTitle}
          onChange={(value) => setContent({ ...draft, portalTitle: value })}
        />
        <Textarea
          label="Short description"
          value={draft.shortDescription}
          onChange={(value) => setContent({ ...draft, shortDescription: value })}
        />
        <Textarea
          label="Main description"
          value={draft.mainDescription}
          onChange={(value) => setContent({ ...draft, mainDescription: value })}
        />
        <Textarea
          label="Location description"
          value={draft.locationDescription}
          onChange={(value) => setContent({ ...draft, locationDescription: value })}
        />
        <Textarea
          label="Target audience"
          value={draft.targetAudience}
          onChange={(value) => setContent({ ...draft, targetAudience: value })}
        />
        <button
          type="button"
          onClick={() => onGenerate('Make the copy more premium and concise.')}
          className="btn btn-secondary"
          disabled={loading || saving}
        >
          {loading ? 'Generating…' : 'Regenerate with AI'}
        </button>
      </div>
    </Section>
  );
}
