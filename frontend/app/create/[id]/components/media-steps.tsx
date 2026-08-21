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
      label: `Room ${index + 1}`,
    })),
    { key: 'kitchen', label: 'Kitchen' },
    { key: 'bathroom', label: 'Bathroom' },
    { key: 'other', label: 'Other interior' },
  ];
  const exteriorSections = [
    { key: 'front', label: 'Front / facade' },
    { key: 'garden', label: 'Garden' },
    { key: 'terrace', label: 'Terrace' },
    { key: 'balcony', label: 'Balcony' },
    { key: 'entrance', label: 'Entrance' },
    { key: 'garage', label: 'Garage' },
    { key: 'parking', label: 'Parking' },
    { key: 'other', label: 'Other exterior' },
  ];
  return (
    <Section
      title="Photos"
      description="Upload photos for each room and area. Based on the number of rooms, every room has its own section."
    >
      <div className="space-y-6">
        <div>
          <h3 className="mb-3 font-bold text-[#33463a]">Exterior</h3>
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
          <h3 className="mb-3 font-bold text-[#33463a]">Interior</h3>
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
          placeholder="Add notes about the photos…"
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
    { key: 'floor_plan', label: 'Floor plan', category: 'floor_plan', subcategory: 'ground_floor' },
    { key: 'site_plan', label: 'Site plan', category: 'floor_plan', subcategory: 'site_plan' },
    {
      key: 'energy_certificate',
      label: 'Energy certificate',
      category: 'document',
      subcategory: 'energy_certificate',
    },
    { key: 'other', label: 'Other document', category: 'document', subcategory: 'other' },
  ];
  return (
    <Section
      title="Plans & documents"
      description="Upload a dedicated file for each type of document."
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
        placeholder="Add notes about the plans or documents…"
      />
    </Section>
  );
}
