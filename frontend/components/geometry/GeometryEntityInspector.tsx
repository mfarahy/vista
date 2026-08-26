'use client';

import { Box, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import type { InspectedEntity } from './geometry-debug';

const STATUS_TONE_CLASS: Record<'valid' | 'uncertain' | 'invalid', string> = {
  valid: 'bg-emerald-500/15 text-emerald-700',
  uncertain: 'bg-amber-500/15 text-amber-700',
  invalid: 'bg-destructive/15 text-destructive',
};

function formatConfidence(confidence: number | undefined): string | null {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Reads the reason code list from an opening candidate's "Reason" row when the
 * entity was invalid/uncertain, so each code can be localized individually.
 */
function splitReasonCodes(entity: InspectedEntity): string[] {
  const reasonRow = entity.rows.find((r) => r.labelKey === 'geometry.inspector.reason');
  if (!reasonRow?.value) return [];
  return reasonRow.value.split(', ').map((s) => s.trim()).filter(Boolean);
}

export function GeometryEntityInspector({
  entity,
  onClose,
}: {
  entity: InspectedEntity | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  if (!entity) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 px-4 py-8 text-xs text-muted-foreground">
        <Box className="size-4" aria-hidden />
        <span>{t('geometry.debug.inspectorEmpty')}</span>
      </div>
    );
  }

  const status = entity.status;
  const toneClass = status
    ? STATUS_TONE_CLASS[status.tone]
    : 'bg-muted text-muted-foreground';
  const reasonCodes = splitReasonCodes(entity);

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(entity.typeKey)}
            {' · '}
            {t(entity.sourceKey)}
          </p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">{entity.id}</p>
        </div>
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {status && (
          <Badge variant="secondary" className={toneClass}>
            {t(status.statusKey)}
          </Badge>
        )}
        {reasonCodes.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {reasonCodes.map((code) => (
              <Badge key={code} variant="outline">
                {t(`geometry.debug.reasons.${code}`)}
              </Badge>
            ))}
          </span>
        )}
      </div>

      {typeof entity.confidence === 'number' && (
        <dl className="space-y-1.5">
          <InspectorRow label={t('geometry.inspector.confidence')} value={formatConfidence(entity.confidence) ?? '—'} />
        </dl>
      )}

      {entity.rows.length > 0 && (
        <dl className="space-y-1.5">
          {entity.rows.map((r) => {
            const value = r.valueKey ? t(r.valueKey) : r.value ?? '—';
            return <InspectorRow key={r.labelKey} label={t(r.labelKey)} value={value} />;
          })}
        </dl>
      )}

      <p className="text-[11px] leading-4 text-muted-foreground">
        {t('geometry.debug.inspectorHint')}
      </p>
    </div>
  );
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right font-mono text-xs text-foreground">{value}</dd>
    </div>
  );
}