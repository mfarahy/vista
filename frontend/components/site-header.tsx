'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VistaLogoLink } from '@/components/vista-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useI18n } from '@/lib/i18n';

export function SiteHeader() {
  const { t } = useI18n();

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <VistaLogoLink href="/" />
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/floorplan">{t('landing.floorplan3d')}</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/broker-profile">{t('landing.brokerProfile')}</Link>
          </Button>
          <LanguageSwitcher />
          <Button asChild>
            <Link href="/create">
              {t('landing.newExpose')} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
