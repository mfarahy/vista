import type { PropertyImage, UploadImages } from '../types';
import { PhotoSection, Section, SectionNotes } from './ui';

export function StepPhotos({
  images,
  rooms,
  upload,
  removeImage,
  cover,
  moveImage,
  noteValue,
  setNote,
}: {
  images: PropertyImage[];
  rooms?: number | null;
  upload: UploadImages;
  removeImage: (id: string) => Promise<void>;
  cover: (id: string) => Promise<void>;
  moveImage: (index: number, direction: -1 | 1) => Promise<void>;
  noteValue: (key: string) => string;
  setNote: (key: string, value: string) => void;
}) {
  const roomCount = Math.max(Number(rooms) || 0, 0);
  const interiorSections = [
    ...Array.from({ length: roomCount }, (_, index) => ({
      key: `room_${index + 1}`,
      label: `Raum ${index + 1}`,
    })),
    { key: 'kitchen', label: 'Küche' },
    { key: 'bathroom', label: 'Bad' },
    { key: 'other', label: 'Sonstige Innenräume' },
  ];
  const exteriorSections = [
    { key: 'front', label: 'Vorderansicht / Fassade' },
    { key: 'garden', label: 'Garten' },
    { key: 'terrace', label: 'Terrasse' },
    { key: 'balcony', label: 'Balkon' },
    { key: 'entrance', label: 'Eingang' },
    { key: 'garage', label: 'Garage' },
    { key: 'parking', label: 'Stellplatz' },
    { key: 'other', label: 'Sonstige Außenbereiche' },
  ];
  return (
    <Section
      title="Fotos"
      description="Laden Sie Fotos für die einzelnen Räume und Bereiche hoch. Je nach Zimmeranzahl erhält jeder Raum einen eigenen Abschnitt."
    >
      <div className="space-y-6">
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Außenbereich
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
              />
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Innenbereich
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
              />
            ))}
          </div>
        </div>
        <SectionNotes
          value={noteValue('photos')}
          onChange={(value) => setNote('photos', value)}
          placeholder="Anmerkungen zu den Fotos notieren…"
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
  const planTypes: Array<{
    key: string;
    label: string;
    category: 'floor_plan' | 'document';
    subcategory: string;
  }> = [
    { key: 'floor_plan', label: 'Grundriss', category: 'floor_plan', subcategory: 'ground_floor' },
    { key: 'site_plan', label: 'Lageplan', category: 'floor_plan', subcategory: 'site_plan' },
    {
      key: 'energy_certificate',
      label: 'Energieausweis',
      category: 'document',
      subcategory: 'energy_certificate',
    },
    { key: 'other', label: 'Sonstiges Dokument', category: 'document', subcategory: 'other' },
  ];
  return (
    <Section
      title="Pläne & Dokumente"
      description="Laden Sie für jeden Dokumenttyp eine eigene Datei hoch."
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
        placeholder="Anmerkungen zu Plänen und Dokumenten notieren…"
      />
    </Section>
  );
}
