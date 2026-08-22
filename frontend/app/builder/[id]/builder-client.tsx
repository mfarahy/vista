'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, FileDown, LoaderCircle, Save } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, downloadPdf } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { VistaLogoLink } from '@/components/vista-logo';
import type { DocumentRecord, MarketingContent, Property } from '../../create/[id]/types';
import type { ExposeConfiguration, ExposeContentOverrides } from './expose-model';
import {
  SECTION_LABELS,
  defaultExposeConfiguration,
  defaultGalleryImageIds,
  effectiveMarketingContent,
} from './expose-model';
import { ExposeSidebar } from './components/expose-sidebar';
import { ExposeEditor } from './components/expose-editor';
import { ModernExposeTemplate, type ExposeMedia } from './components/modern-expose-template';

/**
 * Exposé Builder client (Phase 5A). Owns the local Expose configuration state
 * and renders the live preview. Property and MarketingContent are never
 * mutated here — all edits become Expose content overrides, persisted on Save.
 */
export default function ExposeBuilderClient({
  property,
  marketingContent,
  initialConfiguration,
  documents,
}: {
  property: Property;
  marketingContent: MarketingContent | null;
  initialConfiguration: ExposeConfiguration | null;
  documents: DocumentRecord[];
}) {
  const [configuration, setConfiguration] = useState<ExposeConfiguration>(
    () => initialConfiguration ?? defaultExposeConfiguration(),
  );
  const [savedSnapshot, setSavedSnapshot] = useState<ExposeConfiguration | null>(
    initialConfiguration,
  );
  const [selectedId, setSelectedId] = useState<string>(
    () => initialConfiguration?.sections[0]?.id ?? 'cover',
  );
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const dirty = JSON.stringify(configuration) !== JSON.stringify(savedSnapshot);
  const effective = effectiveMarketingContent(marketingContent, configuration.contentOverrides);
  const media: ExposeMedia = { images: property.images, documents };

  const selectedSection =
    configuration.sections.find((section) => section.id === selectedId) ??
    configuration.sections[0];
  const selectedType = selectedSection?.type ?? 'cover';

  function update(patch: Partial<ExposeConfiguration>) {
    setConfiguration((current) => ({ ...current, ...patch }));
  }

  function toggleSection(id: string) {
    setConfiguration((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === id ? { ...section, visible: !section.visible } : section,
      ),
    }));
  }

  function moveSection(id: string, direction: -1 | 1) {
    setConfiguration((current) => {
      const sections = [...current.sections];
      const index = sections.findIndex((section) => section.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= sections.length) return current;
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...current, sections };
    });
  }

  function setOverride(key: keyof ExposeContentOverrides, value: string | string[]) {
    update({ contentOverrides: { ...configuration.contentOverrides, [key]: value } });
  }

  function setCoverImageId(id: string) {
    update({ selectedCoverImageId: id });
  }

  function toggleGalleryImage(id: string) {
    setConfiguration((current) => {
      const currentIds = current.galleryImageIds ?? defaultGalleryImageIds(property);
      const next = currentIds.includes(id)
        ? currentIds.filter((imageId) => imageId !== id)
        : [...currentIds, id];
      return { ...current, galleryImageIds: next };
    });
  }

  async function save() {
    setSaving(true);
    try {
      const response = await apiFetch(`/api/properties/${property.id}/expose/configuration`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configuration),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(result?.error || 'Die Exposé-Konfiguration konnte nicht gespeichert werden.');
        return;
      }
      setSavedSnapshot(configuration);
      toast.success('Exposé-Konfiguration gespeichert');
    } catch {
      toast.error('Die Exposé-Konfiguration konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  async function exportPdf() {
    setExporting(true);
    try {
      if (dirty) {
        const response = await apiFetch(`/api/properties/${property.id}/expose/configuration`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(configuration),
        });
        if (!response.ok) {
          toast.error('Die Exposé-Konfiguration konnte nicht gespeichert werden.');
          return;
        }
        setSavedSnapshot(configuration);
      }
      const filename = await downloadPdf(property.id);
      if (filename === null) {
        toast.error('Das PDF konnte nicht erstellt werden. Bitte versuchen Sie es erneut.');
        return;
      }
      toast.success(`PDF erstellt: ${filename}`);
    } catch {
      toast.error('Das PDF konnte nicht erstellt werden. Bitte versuchen Sie es erneut.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-card/95 px-5 py-3 backdrop-blur sm:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/create/${property.id}`}>
              <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Assistent</span>
            </Link>
          </Button>
          <div className="hidden min-w-0 items-center gap-3 border-l pl-4 sm:flex">
            <VistaLogoLink href="/" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">Exposé Builder</p>
              <p className="truncate text-[11px] text-muted-foreground">
                Vorlage: Modern · {configuration.sections.length} Abschnitte
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:block">
            {dirty ? (
              <span className="text-amber-600">Ungespeicherte Änderungen</span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500" /> Gespeichert
              </span>
            )}
          </span>
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            {saving ? (
              <>
                <LoaderCircle className="size-4 animate-spin" /> Wird gespeichert…
              </>
            ) : (
              <>
                <Save className="size-4" /> Speichern
              </>
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={exportPdf} disabled={exporting}>
            {exporting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" /> PDF wird erstellt…
              </>
            ) : (
              <>
                <FileDown className="size-4" /> PDF erstellen
              </>
            )}
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6">
        <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
          <div className="space-y-5">
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <ExposeSidebar
                sections={configuration.sections}
                selectedId={selectedSection?.id ?? ''}
                onSelect={setSelectedId}
                onToggle={toggleSection}
                onMove={moveSection}
              />
            </section>
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {SECTION_LABELS[selectedType]} bearbeiten
              </p>
              {selectedSection ? (
                <ExposeEditor
                  section={selectedSection}
                  property={property}
                  marketingContent={marketingContent}
                  effective={effective}
                  configuration={configuration}
                  media={media}
                  setOverride={setOverride}
                  setCoverImageId={setCoverImageId}
                  toggleGalleryImage={toggleGalleryImage}
                />
              ) : null}
            </section>
          </div>

          <section className="min-w-0 rounded-xl border border-border bg-muted/40 p-4 shadow-sm sm:p-8">
            <div className="mx-auto mb-5 flex max-w-[794px] items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Live-Vorschau
              </p>
              <p className="text-[11px] text-muted-foreground">
                Aktualisiert sich während der Bearbeitung
              </p>
            </div>
            <div className="max-h-[calc(100vh-220px)] overflow-y-auto rounded-lg">
              <ModernExposeTemplate
                property={property}
                marketingContent={effective}
                expose={configuration}
                media={media}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
