import { LoaderCircle, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MarketingContent } from '../types';
import { GroupCard, Section, Input, Textarea } from './ui';

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
  if (!content) {
    return (
      <Section
        title="Exposé-Inhalt"
        description="Professionelle deutsche Marketing-Texte aus Ihren geprüften Objektdaten erzeugen."
      >
        <div className="mx-auto max-w-xl py-8 text-center">
          <p className="text-sm font-medium text-foreground">
            Ihr Exposé-Inhalt wurde noch nicht erzeugt.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Vista kann einen ersten Entwurf aus den eingegebenen Objektdaten erstellen.
          </p>
          <Button type="button" className="mt-6" disabled={generating} onClick={() => onGenerate()}>
            {generating ? (
              <>
                <LoaderCircle className="size-4 animate-spin" /> Ihr Exposé wird erzeugt…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Inhalt erzeugen
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
      title="Exposé-Inhalt"
      description="Prüfen und bearbeiten Sie die erzeugten Texte. Ihre Änderungen werden beim Speichern übernommen und nicht von der KI überschrieben."
    >
      <div className="space-y-5">
        <GroupCard title="Titel & Untertitel">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Titel"
              value={content.title.value}
              onChange={editText('title')}
              placeholder="z. B. Gepflegtes Einfamilienhaus mit Garten und Garage"
            />
            <Input
              label="Untertitel"
              value={content.subtitle.value}
              onChange={editText('subtitle')}
              placeholder="z. B. Reiheneckhaus in Berlin-Buckow"
            />
          </div>
        </GroupCard>

        <GroupCard
          title="Highlights"
          description="Jeder Stichpunkt entspricht einem geprüften Objektmerkmal."
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
                  placeholder={`Highlight ${index + 1}`}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Highlight ${index + 1} entfernen`}
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
            <Plus className="size-4" /> Highlight hinzufügen
          </Button>
        </GroupCard>

        <GroupCard title="Objektbeschreibung">
          <Textarea
            label="Objektbeschreibung"
            value={content.propertyDescription.value}
            onChange={editText('propertyDescription')}
            rows={6}
          />
        </GroupCard>

        <GroupCard title="Ausstattung">
          <Textarea
            label="Ausstattungsbeschreibung"
            value={content.equipmentDescription.value}
            onChange={editText('equipmentDescription')}
            rows={5}
            hint="Beschreibt nur die tatsächlich vorhandenen Merkmale."
          />
        </GroupCard>

        <GroupCard title="Lage">
          <Textarea
            label="Lagebeschreibung"
            value={content.locationDescription?.value ?? ''}
            onChange={editText('locationDescription')}
            rows={5}
            placeholder={
              content.locationDescription
                ? undefined
                : 'Keine Lageinformationen vorhanden — bei Bedarf selbst ergänzen.'
            }
          />
        </GroupCard>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <p className="text-xs text-muted-foreground">
            „Neu erzeugen“ ersetzt nur KI-Entwürfe. Felder, die Sie bearbeitet haben, bleiben
            erhalten.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={generating}
            onClick={() => onGenerate()}
          >
            {generating ? (
              <>
                <LoaderCircle className="size-4 animate-spin" /> Ihr Exposé wird erzeugt…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Neu erzeugen
              </>
            )}
          </Button>
        </div>
      </div>
    </Section>
  );
}
