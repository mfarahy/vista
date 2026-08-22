'use client';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExposeSection } from '../expose-model';
import { SECTION_DESCRIPTIONS, SECTION_LABELS } from '../expose-model';

/**
 * Section control list of the Exposé Builder: visibility, order (up/down —
 * no drag-and-drop in the MVP) and selection for the editor pane.
 */
export function ExposeSidebar({
  sections,
  selectedId,
  onSelect,
  onToggle,
  onMove,
}: {
  sections: ExposeSection[];
  selectedId: string;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Abschnitte
      </p>
      {sections.map((section, index) => {
        const selected = section.id === selectedId;
        return (
          <div
            key={section.id}
            className={cn(
              'group flex items-center gap-1 rounded-lg border px-2 py-1.5 transition-colors',
              selected
                ? 'border-primary/40 bg-primary/[0.06]'
                : 'border-transparent hover:border-border hover:bg-card',
              !section.visible && 'opacity-60',
            )}
          >
            <div className="flex flex-col">
              <button
                type="button"
                aria-label={`${SECTION_LABELS[section.type]} nach oben`}
                disabled={index === 0}
                onClick={() => onMove(section.id, -1)}
                className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
              >
                <ChevronUp className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`${SECTION_LABELS[section.type]} nach unten`}
                disabled={index === sections.length - 1}
                onClick={() => onMove(section.id, 1)}
                className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
              >
                <ChevronDown className="size-3.5" aria-hidden />
              </button>
            </div>
            <button
              type="button"
              onClick={() => onSelect(section.id)}
              className="min-w-0 flex-1 px-1 text-left"
              aria-current={selected ? 'true' : undefined}
            >
              <span
                className={cn(
                  'block truncate text-sm',
                  selected ? 'font-semibold text-primary' : 'font-medium text-foreground',
                )}
              >
                {SECTION_LABELS[section.type]}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {SECTION_DESCRIPTIONS[section.type]}
              </span>
            </button>
            <label
              className="flex shrink-0 cursor-pointer items-center gap-1.5 pr-1"
              title={section.visible ? 'Im Exposé anzeigen' : 'Im Exposé ausblenden'}
            >
              <input
                type="checkbox"
                checked={section.visible}
                onChange={() => onToggle(section.id)}
                className="size-4 rounded border-border accent-primary"
                aria-label={`${SECTION_LABELS[section.type]} anzeigen`}
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}