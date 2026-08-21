import { useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiAssetUrl } from '@/lib/api';
import type { ImageCategory, PropertyImage, UploadImages } from '../types';

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card bg-white p-5 sm:p-8">
      <h2 className="serif text-2xl sm:text-3xl">{title}</h2>
      {description && <p className="mt-2 text-sm leading-6 text-[#78847c]">{description}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}

export function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <input
        className="field"
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | undefined | null;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <select
        className="field"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Textarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <textarea
        className="field min-h-28 resize-y"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function SectionNotes({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-[#c8d9cb] bg-[#f6faf6] p-4">
      <p className="text-xs font-bold uppercase tracking-[.14em] text-[#607b68]">
        Your notes / highlights
      </p>
      <textarea
        className="field mt-3 min-h-20 resize-y"
        value={value ?? ''}
        placeholder={placeholder ?? 'Add any extra information or highlights for this section…'}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function DatePicker({
  value,
  onChange,
  placeholder,
}: {
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const parse = (iso: string | null | undefined) => {
    if (!iso) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  };
  const [view, setView] = useState(() => parse(value) ?? new Date());
  const selected = parse(value);
  const year = view.getFullYear();
  const month = view.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = new Date();
  const fmt = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const isSame = (a: Date, b: Date | null) =>
    !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const display = selected
    ? selected.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  return (
    <label className="relative block">
      <span className="label">Available from</span>
      <div className="flex items-center gap-2">
        <input
          className="field"
          value={display}
          placeholder={placeholder ?? 'Select a date'}
          readOnly
          onClick={() => setOpen((current) => !current)}
        />
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="btn btn-secondary px-3 py-2 text-xs"
        >
          <Calendar size={14} />
        </button>
      </div>
      {open && (
        <div className="absolute z-20 mt-2 w-72 rounded-xl border border-[#dce4dc] bg-white p-3 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setView(new Date(year, month - 1, 1))}
              className="rounded-lg p-1 hover:bg-[#eef3ee]"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-bold text-[#33463a]">
              {view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => setView(new Date(year, month + 1, 1))}
              className="rounded-lg p-1 hover:bg-[#eef3ee]"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-[#7a877e]">
            {weekdayLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }, (_, index) => (
              <span key={`empty-${index}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1;
              const date = new Date(year, month, day);
              const current = isSame(date, today);
              const selectedDay = isSame(date, selected);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    onChange(fmt(date));
                    setOpen(false);
                  }}
                  className={`rounded-lg py-1.5 text-xs transition ${selectedDay ? 'bg-[#26352b] font-bold text-white' : current ? 'font-bold text-[#45614d]' : 'text-[#59675f] hover:bg-[#eef3ee]'}`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[#edf1ed] pt-2">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="text-xs text-[#6d7b6f] underline"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(fmt(today));
                setOpen(false);
              }}
              className="text-xs font-bold text-[#45614d] underline"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </label>
  );
}

export function EnergyClassPicker({
  value,
  onChange,
}: {
  value: string | undefined | null;
  onChange: (value: string | null) => void;
}) {
  const classes: Array<{ key: string; color: string }> = [
    { key: 'A+', color: '#0f7a3d' },
    { key: 'A', color: '#28a05b' },
    { key: 'B', color: '#57b84b' },
    { key: 'C', color: '#b6c93c' },
    { key: 'D', color: '#e8c838' },
    { key: 'E', color: '#ef9b35' },
    { key: 'F', color: '#ee6a35' },
    { key: 'G', color: '#dd3c3c' },
    { key: 'H', color: '#9c1f1f' },
  ];
  return (
    <div>
      <span className="label">Energy efficiency class</span>
      <div className="mt-2 flex gap-1.5">
        {classes.map((entry) => {
          const active = value === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              title={entry.key}
              onClick={() => onChange(active ? null : entry.key)}
              className="flex h-20 flex-1 flex-col items-center justify-center gap-1 rounded-xl font-bold text-white transition"
              style={{
                backgroundColor: entry.color,
                opacity: active ? 1 : 0.35,
                outline: active ? '3px solid #202522' : 'none',
                outlineOffset: 2,
              }}
            >
              <span className="text-sm">{entry.key}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-[#718078]">
        {value ? `Selected class: ${value}` : 'Select an energy efficiency class'}
      </p>
    </div>
  );
}

export function PhotoSection({
  title,
  category,
  subcategory,
  images,
  upload,
  removeImage,
  cover,
  moveImage,
}: {
  title: string;
  category: ImageCategory;
  subcategory: string;
  images: PropertyImage[];
  upload: UploadImages;
  removeImage: (id: string) => Promise<void>;
  cover: (id: string) => Promise<void>;
  moveImage: (index: number, direction: -1 | 1) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const sectionImages = images.filter(
    (image) => image.category === category && (image.subcategory ?? '') === subcategory,
  );
  const globalIndex = (id: string) => images.findIndex((image) => image.id === id);
  return (
    <div className="rounded-2xl border border-[#e5e9e5] bg-[#fafcfb] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold text-[#415743]">{title}</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn btn-secondary px-3 py-2 text-xs"
          >
            Upload
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(event) => {
              upload(event.target.files, { category, subcategory });
              event.target.value = '';
            }}
          />
        </div>
      </div>
      {sectionImages.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {sectionImages.map((image) => (
            <div key={image.id} className="rounded-xl border border-[#e2e8e2] bg-white p-2">
              <img
                src={apiAssetUrl(image.url)}
                alt={image.caption || subcategory || 'Property photo'}
                className="h-32 w-full rounded-lg object-cover"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => cover(image.id)}
                  className="btn btn-secondary px-2 py-1.5 text-[11px]"
                >
                  Cover
                </button>
                <button
                  type="button"
                  onClick={() => removeImage(image.id)}
                  className="btn btn-secondary px-2 py-1.5 text-[11px]"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => moveImage(globalIndex(image.id), -1)}
                  className="btn btn-secondary px-2 py-1.5 text-[11px]"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveImage(globalIndex(image.id), 1)}
                  className="btn btn-secondary px-2 py-1.5 text-[11px]"
                >
                  ↓
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[#aab4ac]">No photos in this section yet.</p>
      )}
    </div>
  );
}
