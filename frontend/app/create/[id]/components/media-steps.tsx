import type { PhotoUnderstanding, PropertyImage, UploadImages } from '../types';
import { PhotoSection, Section, SectionNotes } from './ui';
import { useI18n } from '@/lib/i18n';

export function StepPhotos({
  images,
  rooms,
  upload,
  removeImage,
  cover,
  moveImage,
  noteValue,
  setNote,
  coverSuggestions,
  photoMetadata,
}: {
  images: PropertyImage[];
  rooms?: number | null;
  upload: UploadImages;
  removeImage: (id: string) => Promise<void>;
  cover: (id: string) => Promise<void>;
  moveImage: (index: number, direction: -1 | 1) => Promise<void>;
  noteValue: (key: string) => string;
  setNote: (key: string, value: string) => void;
  /**
   * AI cover suggestions keyed by photo filename (Phase 9). Only a subtle
   * hint is shown; the cover is never selected automatically.
   */
  coverSuggestions?: Map<string, PhotoUnderstanding>;
  /**
   * AI photo understanding keyed by filename (Phase 10). Shown as subtle
   * "KI-Erkennung" hints that stay visually distinct from Property facts.
   */
  photoMetadata?: Map<string, PhotoUnderstanding>;
}) {
  const { t } = useI18n();
  const roomCount = Math.max(Number(rooms) || 0, 0);
  const interiorSections = [
    ...Array.from({ length: roomCount }, (_, index) => ({
      key: `room_${index + 1}`,
      label: t('steps.photos.roomLabel', { number: index + 1 }),
    })),
    { key: 'kitchen', label: t('steps.photos.kitchen') },
    { key: 'bathroom', label: t('steps.photos.bathroom') },
    { key: 'other', label: t('steps.photos.otherInterior') },
  ];
  const exteriorSections = [
    { key: 'front', label: t('steps.photos.exteriorViews') },
    { key: 'garden', label: t('steps.photos.garden') },
    { key: 'terrace', label: t('steps.photos.terrace') },
    { key: 'balcony', label: t('steps.photos.balcony') },
    { key: 'entrance', label: t('steps.photos.entrance') },
    { key: 'garage', label: t('steps.photos.garage') },
    { key: 'parking', label: t('steps.photos.parking') },
    { key: 'other', label: t('steps.photos.otherExterior') },
  ];
  return (
    <Section
      title={t('steps.photos.sectionTitle')}
      description={t('steps.photos.sectionDescription')}
    >
      <div className="space-y-6">
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('steps.photos.exteriorHeading')}
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {exteriorSections.map((section) => (
              <PhotoSection
                key={section.key}
                title={section.label}
                category="exterior"
                subcategory={section.key}
                images={images}
                upload={upload}
                removeImage={removeImage}
                cover={cover}
                moveImage={moveImage}
                coverSuggestions={coverSuggestions}
                photoMetadata={photoMetadata}
              />
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('steps.photos.interiorHeading')}
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {interiorSections.map((section) => (
              <PhotoSection
                key={section.key}
                title={section.label}
                category="interior"
                subcategory={section.key}
                images={images}
                upload={upload}
                removeImage={removeImage}
                cover={cover}
                moveImage={moveImage}
                coverSuggestions={coverSuggestions}
                photoMetadata={photoMetadata}
              />
            ))}
          </div>
        </div>
        <SectionNotes
          value={noteValue('photos')}
          onChange={(value) => setNote('photos', value)}
          placeholder={t('steps.photos.notesPlaceholder')}
        />
      </div>
    </Section>
  );
}

export function StepPlans({
  images,
  upload,
  removeImage,
  cover,
  moveImage,
  noteValue,
  setNote,
}: {
  images: PropertyImage[];
  upload: UploadImages;
  removeImage: (id: string) => Promise<void>;
  cover: (id: string) => Promise<void>;
  moveImage: (index: number, direction: -1 | 1) => Promise<void>;
  noteValue: (key: string) => string;
  setNote: (key: string, value: string) => void;
}) {
  const { t } = useI18n();
  const planTypes: Array<{
    key: string;
    label: string;
    category: 'floor_plan' | 'document';
    subcategory: string;
  }> = [
    {
      key: 'floor_plan',
      label: t('media.planTypes.grundriss'),
      category: 'floor_plan',
      subcategory: 'ground_floor',
    },
    {
      key: 'site_plan',
      label: t('media.planTypes.lageplan'),
      category: 'floor_plan',
      subcategory: 'site_plan',
    },
    {
      key: 'energy_certificate',
      label: t('media.planTypes.energieausweis'),
      category: 'document',
      subcategory: 'energy_certificate',
    },
    { key: 'other', label: t('media.planTypes.other'), category: 'document', subcategory: 'other' },
  ];
  return (
    <Section
      title={t('steps.plans.sectionTitle')}
      description={t('steps.plans.sectionDescription')}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {planTypes.map((doc) => (
          <PhotoSection
            key={doc.key}
            title={doc.label}
            category={doc.category}
            subcategory={doc.subcategory}
            images={images}
            upload={upload}
            removeImage={removeImage}
            cover={cover}
            moveImage={moveImage}
          />
        ))}
      </div>
      <SectionNotes
        value={noteValue('plans')}
        onChange={(value) => setNote('plans', value)}
        placeholder={t('steps.plans.notesPlaceholder')}
      />
    </Section>
  );
}
