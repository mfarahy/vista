import { LoaderCircle, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import type { MarketingContent } from '../types';
import { GroupCard, Section, Input, Textarea } from './ui';
import { marketingProvenanceLabel } from '../field-provenance';

/**
 * Subtle provenance label for a marketing-content field: "Von KI erstellt ·
 * bearbeitbar" for AI drafts, "Von Ihnen bearbeitet" after an edit. The
 * internal source record ("ai" | "user") is never shown.
 */
function ProvenanceLabel({ source }: { source: 'ai' | 'user' }) {
  const { t } = useI18n();
  const user = source === 'user';
  return (
    <p
      className={
        user ? 'mt-1.5 text-xs font-medium text-foreground' : 'mt-1.5 text-xs text-muted-foreground'
      }
    >
      {t(marketingProvenanceLabel(source))}
    </p>
  );
}

/**
 * Marketing-content review step ("Exposé-Inhalt"). A lightweight content
 * editor, NOT an Exposé builder: plain inputs and textareas only.
 *
 * Every edit marks the field as user-provided (source "user") so a later
 * regeneration never silently overwrites it.
 */
export function StepMarketingContent({
  content,
  setContent,
  onGenerate,
  generating,
}: {
  content: MarketingContent | null;
  setContent: (content: MarketingContent) => void;
  onGenerate: () => Promise<void>;
  generating: boolean;
}) {
  const { t } = useI18n();
  if (!content) {
    return (
      <Section
        title={t('steps.marketing.emptySectionTitle')}
        description={t('steps.marketing.emptySectionDescription')}
      >
        <div className="mx-auto max-w-xl py-8 text-center">
          <p className="text-sm font-medium text-foreground">{t('steps.marketing.emptyTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('steps.marketing.emptyText')}</p>
          <Button type="button" className="mt-6" disabled={generating} onClick={() => onGenerate()}>
            {generating ? (
              <>
                <LoaderCircle className="size-4 animate-spin" /> {t('steps.marketing.generating')}
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> {t('steps.marketing.generate')}
              </>
            )}
          </Button>
        </div>
      </Section>
    );
  }

  const editText =
    (
      key:
        | 'title'
        | 'subtitle'
        | 'propertyDescription'
        | 'equipmentDescription'
        | 'locationDescription',
    ) =>
    (value: string) =>
      setContent({
        ...content,
        [key]: { value, source: 'user' },
      });
  const editHighlights = (value: string[]) =>
    setContent({ ...content, highlights: { value, source: 'user' } });

  return (
    <Section
      title={t('steps.marketing.sectionTitle')}
      description={t('steps.marketing.sectionDescription')}
    >
      <div className="space-y-5">
        <GroupCard title={t('steps.marketing.groupTitleSubtitle')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Input
                label={t('steps.marketing.titleLabel')}
                value={content.title.value}
                onChange={editText('title')}
                placeholder={t('steps.marketing.titlePlaceholder')}
              />
              <ProvenanceLabel source={content.title.source} />
            </div>
            <div>
              <Input
                label={t('steps.marketing.subtitleLabel')}
                value={content.subtitle.value}
                onChange={editText('subtitle')}
                placeholder={t('steps.marketing.subtitlePlaceholder')}
              />
              <ProvenanceLabel source={content.subtitle.source} />
            </div>
          </div>
        </GroupCard>

        <GroupCard
          title={t('steps.marketing.groupHighlights')}
          description={t('steps.marketing.groupHighlightsDescription')}
        >
          <div className="space-y-2">
            {content.highlights.value.map((highlight, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
                  {index + 1}
                </div>
                <input
                  type="text"
                  value={highlight}
                  onChange={(event) => {
                    const next = [...content.highlights.value];
                    next[index] = event.target.value;
                    editHighlights(next);
                  }}
                  placeholder={t('steps.marketing.highlightPlaceholder', { number: index + 1 })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('steps.marketing.removeHighlight', { number: index + 1 })}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    editHighlights(content.highlights.value.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => editHighlights([...content.highlights.value, ''])}
          >
            <Plus className="size-4" /> {t('steps.marketing.addHighlight')}
          </Button>
          <ProvenanceLabel source={content.highlights.source} />
        </GroupCard>

        <GroupCard title={t('steps.marketing.groupDescription')}>
          <Textarea
            label={t('steps.marketing.descriptionLabel')}
            value={content.propertyDescription.value}
            onChange={editText('propertyDescription')}
            rows={6}
          />
          <ProvenanceLabel source={content.propertyDescription.source} />
        </GroupCard>

        <GroupCard title={t('steps.marketing.groupEquipment')}>
          <Textarea
            label={t('steps.marketing.equipmentLabel')}
            value={content.equipmentDescription.value}
            onChange={editText('equipmentDescription')}
            rows={5}
            hint={t('steps.marketing.equipmentHint')}
          />
          <ProvenanceLabel source={content.equipmentDescription.source} />
        </GroupCard>

        <GroupCard title={t('steps.marketing.groupLocation')}>
          <Textarea
            label={t('steps.marketing.locationLabel')}
            value={content.locationDescription?.value ?? ''}
            onChange={editText('locationDescription')}
            rows={5}
            placeholder={
              content.locationDescription ? undefined : t('steps.marketing.locationPlaceholder')
            }
          />
          {content.locationDescription && (
            <ProvenanceLabel source={content.locationDescription.source} />
          )}
        </GroupCard>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <p className="text-xs text-muted-foreground">{t('steps.marketing.regenerateNote')}</p>
          <Button
            type="button"
            variant="secondary"
            disabled={generating}
            onClick={() => onGenerate()}
          >
            {generating ? (
              <>
                <LoaderCircle className="size-4 animate-spin" /> {t('steps.marketing.generating')}
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> {t('steps.marketing.regenerate')}
              </>
            )}
          </Button>
        </div>
      </div>
    </Section>
  );
}
