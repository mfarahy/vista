'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import type { VistaGeometry } from '@/lib/geometry/models/geometry';

export const GEOMETRY_FILE_NAME = 'vista-geometry.json';

export function GeometryJsonViewer({ geometry }: { geometry: VistaGeometry }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(geometry, null, 2);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      toast.success(t('geometry.json.copied'));
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('geometry.json.copyFailed'));
    }
  }

  function handleDownload() {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = GEOMETRY_FILE_NAME;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('geometry.json.title')}
        </h2>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? t('geometry.json.copiedLabel') : t('geometry.json.copy')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
            <Download className="size-4" /> {t('geometry.json.download')}
          </Button>
        </div>
      </div>
      <pre className="max-h-[420px] overflow-auto rounded-xl border bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
        {json}
      </pre>
    </div>
  );
}
