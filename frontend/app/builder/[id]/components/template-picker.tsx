'use client';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { EXPOSE_TEMPLATES } from '../expose-templates';
import type { ExposeTemplateId } from '../expose-model';

/**
 * Template selector (Phase 11). Simple radio-card list with a small static
 * visual hint per template — no marketplace, no mini PDF rendering.
 */
export function TemplatePicker({
  value,
  onChange,
}: {
  value: ExposeTemplateId;
  onChange: (template: ExposeTemplateId) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-2" role="radiogroup" aria-label={t('builder.picker.ariaLabel')}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('builder.picker.heading')}
      </p>
      <p className="pb-1 text-xs text-muted-foreground">{t('builder.picker.note')}</p>
      <div className="grid gap-3">
        {EXPOSE_TEMPLATES.map((template) => {
          const selected = template.id === value;
          return (
            <button
              key={template.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(template.id)}
              className={cn(
                'group flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors',
                selected
                  ? 'border-primary bg-primary/[0.06] ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/40 hover:bg-card',
              )}
            >
              <TemplateThumbnail templateId={template.id} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'block text-sm font-semibold',
                      selected ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {t(template.label)}
                  </span>
                  {selected && <Check className="size-3.5 text-primary" aria-hidden />}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {t(template.description)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Tiny static preview used in the selector — intentionally not a real render. */
function TemplateThumbnail({ templateId }: { templateId: ExposeTemplateId }) {
  if (templateId === 'classic') {
    return (
      <span
        aria-hidden
        className="flex h-16 w-12 shrink-0 flex-col overflow-hidden rounded border border-border bg-white"
      >
        <span className="flex h-3 items-center justify-between border-b border-zinc-200 px-1">
          <span className="h-1 w-4 rounded-sm bg-emerald-900/70" />
          <span className="h-0.5 w-2 rounded-sm bg-zinc-300" />
        </span>
        <span className="mx-1 mt-1 h-4 rounded-sm bg-zinc-200" />
        <span className="mx-1 mt-0.5 h-1 w-7 rounded-sm bg-zinc-300" />
        <span className="mx-1 mt-0.5 h-1 w-9 rounded-sm bg-zinc-300" />
        <span className="mx-1 mt-1 h-2.5 rounded-sm border border-emerald-900/30 bg-emerald-50" />
      </span>
    );
  }
  if (templateId === 'elegant') {
    return (
      <span
        aria-hidden
        className="flex h-16 w-12 shrink-0 flex-col overflow-hidden rounded border border-border bg-[#fcfbf7]"
      >
        <span className="relative h-6 bg-zinc-300">
          <span className="absolute left-0.5 top-0.5 h-1 w-4 rounded-sm bg-white/70" />
          <span className="absolute bottom-0.5 right-0.5 h-0.5 w-0.5 rounded-full bg-zinc-400" />
        </span>
        <span className="mx-1 mt-1 h-0.5 w-3 rounded-sm bg-amber-600/70" />
        <span className="mx-1 mt-0.5 h-1.5 w-8 rounded-sm bg-zinc-700" />
        <span className="mx-1 mt-0.5 h-1 w-9 rounded-sm bg-zinc-300" />
        <span className="mx-1 mt-auto mb-1 flex gap-0.5">
          <span className="h-1.5 w-3 rounded-sm bg-zinc-200" />
          <span className="h-1.5 w-3 rounded-sm bg-zinc-200" />
        </span>
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-16 w-12 shrink-0 flex-col overflow-hidden rounded border border-border bg-zinc-900"
    >
      <span className="relative h-5 bg-zinc-600">
        <span className="absolute left-0.5 top-0.5 h-0.5 w-4 rounded-sm bg-white/80" />
      </span>
      <span className="mx-1 mt-1 h-0.5 w-0.5 rounded-full bg-zinc-500" />
      <span className="mx-1 mt-0.5 h-1.5 w-7 rounded-sm bg-zinc-100/90" />
      <span className="mx-1 mt-0.5 h-1 w-9 rounded-sm bg-zinc-400/70" />
      <span className="mx-1 mt-auto mb-1 flex gap-0.5">
        <span className="h-1.5 w-3 rounded-sm bg-zinc-600" />
        <span className="h-1.5 w-3 rounded-sm bg-zinc-600" />
      </span>
    </span>
  );
}
