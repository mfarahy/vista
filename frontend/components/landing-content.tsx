'use client';

import Link from 'next/link';
import {
  ArrowRight,
  FileText,
  Image as ImageIcon,
  Building2,
  FileUp,
  Sparkles,
  FileDown,
  LayoutTemplate,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SiteHeader } from '@/components/site-header';
import { EmptyState } from '@/components/empty-state';
import { useI18n } from '@/lib/i18n';

export type LandingProperty = {
  id: string;
  city?: string | null;
  livingArea?: number | null;
  images: Array<{ id: string }>;
};

export function LandingContent({ properties }: { properties: LandingProperty[] }) {
  const { t } = useI18n();

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" /> {t('landing.badge')}
          </span>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
            {t('landing.heroTitleStart')}{' '}
            <span className="text-primary">{t('landing.heroTitleHighlight')}</span>.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
            {t('landing.intro')}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/create">
                {t('landing.createExpose')} <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/demo">{t('landing.viewDemo')}</Link>
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">{t('landing.noDesignSkills')}</p>
        </div>

        <div className="hidden rounded-2xl border bg-card p-6 shadow-sm lg:block">
          <div className="space-y-3">
            {[
              {
                icon: FileUp,
                title: t('landing.cardUploadTitle'),
                text: t('landing.cardUploadText'),
              },
              { icon: Sparkles, title: t('landing.cardAiTitle'), text: t('landing.cardAiText') },
              { icon: FileDown, title: t('landing.cardPdfTitle'), text: t('landing.cardPdfText') },
            ].map((step) => (
              <div key={step.title} className="flex gap-4 rounded-xl border bg-background p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <step.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{step.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{step.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t bg-card/50">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {t('landing.draftsKicker')}
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                {t('landing.recentlyEdited')}
              </h2>
            </div>
            <Link href="/create" className="text-sm font-medium text-primary hover:underline">
              {t('landing.newExpose')} →
            </Link>
          </div>
          {properties.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {properties.slice(0, 3).map((property) => (
                <div
                  key={property.id}
                  className="group rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      <FileText className="size-3" /> {t('landing.draft')}
                    </span>
                    <Building2 className="size-4 text-muted-foreground" aria-hidden />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    <Link href={`/create/${property.id}`} className="hover:text-primary">
                      {property.city || t('landing.newProperty')}
                    </Link>
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {property.livingArea
                      ? `${property.livingArea} ${t('expose.units.sqm')} · `
                      : ''}
                    {t(
                      property.images.length === 1 ? 'landing.photoCountOne' : 'landing.photoCount',
                      { count: property.images.length },
                    )}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/create/${property.id}`}>{t('landing.edit')}</Link>
                    </Button>
                    <Button size="sm" asChild>
                      <Link href={`/builder/${property.id}`}>
                        <LayoutTemplate className="size-4" /> {t('landing.builder')}
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ImageIcon}
              title={t('landing.emptyTitle')}
              description={t('landing.emptyDescription')}
              actionLabel={t('landing.createExpose')}
              href="/create"
            />
          )}
        </div>
      </section>
    </main>
  );
}
