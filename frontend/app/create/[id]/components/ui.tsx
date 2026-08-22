import { useRef, useState } from 'react';
import { Calendar, Check, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { apiAssetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input as ShadInput } from '@/components/ui/input';
import { Textarea as ShadTextarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
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
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="border-b border-border px-5 py-5 sm:px-7">
        <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{title}</h2>
        {description && (
          <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{description}</p>
        )}
      </header>
      <div className="px-5 py-6 sm:px-7">{children}</div>
    </section>
  );
}

/** Progressive-disclosure group card used to keep steps compact and scannable. */
export function GroupCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Labeled toggle row backed by the shadcn Switch. */
export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-card px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

/** Numeric/text input with a fixed unit suffix and a label. */
export function UnitInput({
  label,
  value,
  onChange,
  unit,
  placeholder,
  type = 'number',
  hint,
  id,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  unit: string;
  placeholder?: string;
  type?: string;
  hint?: string;
  id?: string;
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="relative">
        <ShadInput
          id={id}
          type={type}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full pr-14"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          {unit}
        </span>
      </div>
    </Field>
  );
}

/** Simple date input (native picker) bound to an ISO date string. */
export function DateInput({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  id?: string;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <ShadInput
        id={id}
        type="date"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="w-full"
      />
    </Field>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
      )}
      {children}
      {hint && (
        <p className="flex items-start gap-1 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
          {hint}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
  error,
  id,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  id?: string;
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <ShadInput
        id={id}
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className="w-full"
      />
    </Field>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  hint,
}: {
  label: string;
  value: string | undefined | null;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  placeholder?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <SelectRoot value={value || undefined} onValueChange={(v) => onChange(v)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder ?? 'Select an option'} />
        </SelectTrigger>
        <SelectContent>
          {options
            .filter(([key]) => key !== '')
            .map(([key, name]) => (
              <SelectItem key={key} value={key}>
                {name}
              </SelectItem>
            ))}
        </SelectContent>
      </SelectRoot>
    </Field>
  );
}

export function Textarea({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <ShadTextarea
        value={value ?? ''}
        placeholder={placeholder}
        rows={rows ?? 4}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y"
      />
    </Field>
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
    <div className="mt-7 rounded-lg border border-dashed bg-muted/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Your notes / highlights
      </p>
      <ShadTextarea
        className="mt-3 w-full resize-y bg-card"
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
    <Field label="Available from">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal text-foreground"
          >
            {display ? display : (placeholder ?? 'Select a date')}
            <Calendar className="size-4 text-muted-foreground" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <div className="mb-3 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setView(new Date(year, month - 1, 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm font-semibold">
              {view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setView(new Date(year, month + 1, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
            {weekdayLabels.map((label) => (
              <span key={label} className="py-1">
                {label}
              </span>
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
                  className={cn(
                    'grid size-8 place-items-center rounded-md text-xs transition-colors hover:bg-accent',
                    selectedDay && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
                    current && !selectedDay && 'font-semibold text-primary',
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <Separator className="my-3" />
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(fmt(today));
                setOpen(false);
              }}
            >
              Today
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </Field>
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
    <div className="space-y-2">
      <span className="text-sm font-medium text-foreground">Energy efficiency class</span>
      <div className="grid grid-cols-9 gap-1.5">
        {classes.map((entry) => {
          const active = value === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              title={entry.key}
              aria-pressed={active}
              onClick={() => onChange(active ? null : entry.key)}
              className={cn(
                'flex aspect-square flex-col items-center justify-center rounded-lg text-sm font-bold text-white transition-all',
                active ? 'ring-2 ring-ring ring-offset-2' : 'opacity-40 hover:opacity-75',
              )}
              style={{ backgroundColor: entry.color }}
            >
              {entry.key}
              {active && <Check className="mt-0.5 size-3" aria-hidden />}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
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
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
        >
          Upload
        </Button>
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
      {sectionImages.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {sectionImages.map((image) => (
            <div key={image.id} className="overflow-hidden rounded-lg border border-border bg-background">
              <img
                src={apiAssetUrl(image.url)}
                alt={image.caption || subcategory || 'Property photo'}
                className="h-32 w-full object-cover"
              />
              <div className="flex flex-wrap gap-1.5 p-2">
                <Button
                  type="button"
                  variant={image.isCover ? 'default' : 'outline'}
                  size="xs"
                  onClick={() => cover(image.id)}
                >
                  {image.isCover ? 'Cover ✓' : 'Cover'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeImage(image.id)}
                >
                  Delete
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Move up"
                  onClick={() => moveImage(globalIndex(image.id), -1)}
                >
                  <ChevronLeft className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Move down"
                  onClick={() => moveImage(globalIndex(image.id), 1)}
                >
                  <ChevronRight className="size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-2 text-sm text-muted-foreground">No photos in this section yet.</p>
      )}
    </div>
  );
}
