'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { VistaLogoLink } from '@/components/vista-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function FloorplanDebugIndexPage() {
  const { t } = useI18n();
  const [jobId, setJobId] = useState('');

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4 sm:px-8">
          <VistaLogoLink href="/" />
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {t('floorplanDebug.badge')}
            </span>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 pt-12 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> {t('floorplanDebug.backHome')}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t('floorplanDebug.title')}</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {t('floorplanDebug.intro')}
        </p>

        <form
          className="mt-8 flex max-w-xl items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const id = jobId.trim();
            if (id) window.location.href = `/debug/floorplan/${encodeURIComponent(id)}`;
          }}
        >
          <Input
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder={t('floorplanDebug.jobIdPlaceholder')}
            aria-label={t('floorplanDebug.jobIdPlaceholder')}
            className="font-mono"
          />
          <Button type="submit" disabled={!jobId.trim()}>
            <Search className="size-4" aria-hidden /> {t('floorplanDebug.open')}
          </Button>
        </form>

        <p className="mt-6 text-xs text-muted-foreground">
          {t('floorplanDebug.hintJobId')}
        </p>
      </div>
    </main>
  );
}