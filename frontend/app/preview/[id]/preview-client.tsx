'use client';
import Link from 'next/link';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { downloadPdf } from '@/lib/api';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { VistaLogoLink } from '@/components/vista-logo';

export default function PreviewClient({
  id,
  title,
  html,
}: {
  id: string;
  title: string;
  html: string;
}) {
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
            <Link href={`/create/${id}`}>
              <ArrowLeft className="size-4" />{' '}
              <span className="hidden sm:inline">Back to editor</span>
            </Link>
          </Button>
          <div className="hidden items-center gap-3 border-l pl-4 sm:flex">
            <VistaLogoLink href="/" />
            <span className="max-w-md truncate text-sm font-medium text-foreground">{title}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="hidden sm:flex"
          >
            <Printer className="size-4" /> Print
          </Button>
          <Button size="sm" onClick={pdf} disabled={loading}>
            <Download className="size-4" /> {loading ? 'Creating PDF…' : 'Create PDF'}
          </Button>
        </div>
      </header>
      <iframe
        title="Exposé preview"
        srcDoc={html}
        className="mx-auto block h-[calc(100vh-56px)] w-full border-0"
      />
    </main>
  );
}
