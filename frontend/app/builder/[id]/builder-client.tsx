'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Database,
  FileDown,
  FileText,
  Image as ImageIcon,
  LayoutList,
  LoaderCircle,
  Palette,
  Save,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, downloadPdf } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { VistaLogoLink } from '@/components/vista-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import type { DocumentRecord, MarketingContent, Property } from '../../create/[id]/types';
import type {
  ExposeBranding,
  ExposeConfiguration,
  ExposeContentOverrides,
  ExposeTemplateId,
} from './expose-model';
import {
  defaultExposeConfiguration,
  defaultGalleryImageIds,
  effectiveMarketingContent,
} from './expose-model';
import type { ExposeMedia } from './expose-model';
import { getExposeTemplate } from './expose-templates';
import { useI18n } from '@/lib/i18n';
import { ExposeSidebar } from './components/expose-sidebar';
import {
  BrandingEditor,
  ContactEditor,
  ContentEditor,
  FactsEditor,
  MediaEditor,
} from './components/expose-editor';
import { TemplatePicker } from './components/template-picker';
import { cn } from '@/lib/utils';

/**
 * Exposé Builder client (Phase 5A, reorganized in Phase 11). Owns the local
 * Expose configuration state and renders the live preview. Property and
 * MarketingContent are never mutated here — all edits become Expose content
 * overrides, branding, or template selection, persisted on Save.
 */

const BUILDER_GROUPS = [
  { id: 'design', icon: Palette },
  { id: 'sections', icon: LayoutList },
  { id: 'content', icon: FileText },
  { id: 'media', icon: ImageIcon },
  { id: 'branding', icon: Building2 },
  { id: 'facts', icon: Database },
  { id: 'contact', icon: UserRound },
] as const;

type BuilderGroupId = (typeof BUILDER_GROUPS)[number]['id'];

const GROUP_KEYS: Record<BuilderGroupId, string> = {
  design: 'builder.groups.design',
  sections: 'builder.groups.sections',
  content: 'builder.groups.content',
  media: 'builder.groups.media',
  branding: 'builder.groups.branding',
  facts: 'builder.groups.objectData',
  contact: 'builder.groups.contact',
};

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
  const [activeGroup, setActiveGroup] = useState<BuilderGroupId>('design');
  const { locale, t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const dirty = JSON.stringify(configuration) !== JSON.stringify(savedSnapshot);
  const effective = effectiveMarketingContent(marketingContent, configuration.contentOverrides);
  const media: ExposeMedia = { images: property.images, documents };
  const selectedTemplate = getExposeTemplate(configuration.template);

  function update(patch: Partial<ExposeConfiguration>) {
    setConfiguration((current) => ({ ...current, ...patch }));
  }

  function setTemplate(template: ExposeTemplateId) {
    update({ template });
  }

  function setBranding(key: keyof ExposeBranding, value: string) {
    update({ branding: { ...configuration.branding, [key]: value } });
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
        toast.error(t('builder.saveFailed'));
        return;
      }
      setSavedSnapshot(configuration);
      toast.success(t('builder.saved'));
    } catch {
      toast.error(t('builder.saveFailed'));
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
          toast.error(t('builder.saveFailed'));
          return;
        }
        setSavedSnapshot(configuration);
      }
      const filename = await downloadPdf(property.id);
      if (filename === null) {
        toast.error(t('builder.pdfFailed'));
        return;
      }
      toast.success(t('builder.pdfCreated', { filename }));
    } catch {
      toast.error(t('builder.pdfFailed'));
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
              <ArrowLeft className="size-4" />{' '}
              <span className="hidden sm:inline">{t('builder.backToWizard')}</span>
            </Link>
          </Button>
          <div className="hidden min-w-0 items-center gap-3 border-l pl-4 sm:flex">
            <VistaLogoLink href="/" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{t('builder.title')}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {t('builder.subtitle', {
                  template: t(selectedTemplate.label),
                  count: configuration.sections.length,
                })}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <span className="hidden text-xs text-muted-foreground sm:block">
            {dirty ? (
              <span className="text-amber-600">{t('builder.dirty')}</span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500" /> {t('builder.savedState')}
              </span>
            )}
          </span>
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            {saving ? (
              <>
                <LoaderCircle className="size-4 animate-spin" /> {t('builder.saving')}
              </>
            ) : (
              <>
                <Save className="size-4" /> {t('builder.save')}
              </>
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={exportPdf} disabled={exporting}>
            {exporting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" /> {t('builder.generatingPdf')}
              </>
            ) : (
              <>
                <FileDown className="size-4" /> {t('builder.createPdf')}
              </>
            )}
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6">
        <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
          <div className="space-y-5">
            <nav
              aria-label={t('builder.navLabel')}
              className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1.5 shadow-sm sm:grid-cols-4 xl:grid-cols-2"
            >
              {BUILDER_GROUPS.map((group) => {
                const active = group.id === activeGroup;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setActiveGroup(group.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    <group.icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{t(GROUP_KEYS[group.id])}</span>
                  </button>
                );
              })}
            </nav>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              {activeGroup === 'design' && (
                <TemplatePicker value={configuration.template} onChange={setTemplate} />
              )}
              {activeGroup === 'sections' && (
                <ExposeSidebar
                  sections={configuration.sections}
                  onToggle={toggleSection}
                  onMove={moveSection}
                />
              )}
              {activeGroup === 'content' && (
                <ContentEditor
                  property={property}
                  effective={effective}
                  setOverride={setOverride}
                  marketingFallback={marketingContent?.highlights.value.length ? true : false}
                />
              )}
              {activeGroup === 'media' && (
                <MediaEditor
                  property={property}
                  configuration={configuration}
                  setCoverImageId={setCoverImageId}
                  toggleGalleryImage={toggleGalleryImage}
                />
              )}
              {activeGroup === 'branding' && (
                <BrandingEditor
                  property={property}
                  configuration={configuration}
                  setBranding={setBranding}
                />
              )}
              {activeGroup === 'facts' && <FactsEditor property={property} media={media} />}
              {activeGroup === 'contact' && <ContactEditor property={property} />}
            </section>

            <Button variant="outline" size="sm" className="w-full xl:hidden" asChild>
              <Link href={`/preview/${property.id}`}>
                <FileDown className="size-4" /> {t('builder.openPreviewMobile')}
              </Link>
            </Button>
          </div>

          <section className="hidden min-w-0 rounded-xl border border-border bg-muted/40 p-4 shadow-sm lg:block sm:p-8">
            <div className="mx-auto mb-5 flex max-w-[794px] items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('builder.livePreview')}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t('builder.previewNote', { template: t(selectedTemplate.label) })}
              </p>
            </div>
            <div className="max-h-[calc(100vh-220px)] overflow-y-auto rounded-lg">
              <selectedTemplate.component
                property={property}
                marketingContent={effective}
                expose={configuration}
                media={media}
                translations={{ locale, t }}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
