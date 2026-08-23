'use client';
import Link from 'next/link';
import { ArrowLeft, Download, LayoutTemplate } from 'lucide-react';
import { downloadPdf } from '@/lib/api';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { DocumentRecord, Property } from '../../create/[id]/types';
import type {
  EffectiveMarketingContent,
  ExposeConfiguration,
} from '../../builder/[id]/expose-model';
import { Button } from '@/components/ui/button';
import { VistaLogoLink } from '@/components/vista-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import ExposeDocument from '../../expose/expose-document';

export default function PreviewClient({
  id,
  title,
  property,
  marketingContent,
  expose,
  documents,
}: {
  id: string;
  title?: string;
  property: Property;
  marketingContent: EffectiveMarketingContent;
  expose: ExposeConfiguration;
  documents: DocumentRecord[];
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  async function pdf() {
    setLoading(true);
    try {
      await downloadPdf(id);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-8">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/builder/${id}`}>
              <ArrowLeft className="size-4" />{' '}
              <span className="hidden sm:inline">{t('preview.backToBuilder')}</span>
            </Link>
          </Button>
          <div className="hidden items-center gap-3 border-l pl-4 sm:flex">
            <VistaLogoLink href="/" />
            <span className="max-w-md truncate text-sm font-medium text-foreground">
              {title ?? t('preview.title')}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <LanguageSwitcher />
          <Button variant="outline" size="sm" asChild>
            <Link href={`/builder/${id}`}>
              <LayoutTemplate className="size-4" />{' '}
              <span className="hidden sm:inline">{t('preview.edit')}</span>
            </Link>
          </Button>
          <Button size="sm" onClick={pdf} disabled={loading}>
            <Download className="size-4" />{' '}
            {loading ? t('preview.generatingPdf') : t('preview.createPdf')}
          </Button>
        </div>
      </header>
      <div className="mx-auto max-w-[794px] px-0 py-6 sm:px-4">
        <div className="max-h-[calc(100vh-110px)] overflow-y-auto rounded-lg shadow-lg sm:rounded-xl">
          <ExposeDocument
            property={property}
            marketingContent={marketingContent}
            expose={expose}
            documents={documents}
          />
        </div>
      </div>
    </main>
  );
}
