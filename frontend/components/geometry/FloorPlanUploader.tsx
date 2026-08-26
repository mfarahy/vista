'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg'];

export type FloorPlanImageUpload = {
  url: string;
  file: File;
  width: number;
  height: number;
};

async function readImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('load-failed'));
    img.src = url;
  });
}

export function FloorPlanUploader({
  onUpload,
}: {
  onUpload: (upload: FloorPlanImageUpload) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined | null) {
    setError(null);
    if (!file) {
      setError(t('geometry.upload.noFile'));
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(t('geometry.upload.unsupported'));
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      setBusy(true);
      const { width, height } = await readImageDimensions(url);
      onUpload({ url, file, width, height });
    } catch {
      URL.revokeObjectURL(url);
      setError(t('geometry.upload.loadFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        disabled={busy}
        className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
      >
        <Upload className="size-5" />
        <span>
          {t('geometry.upload.dropzone')}
          <span className="block text-xs text-muted-foreground">
            {t('geometry.upload.dropzoneHint')}
          </span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {error && (
        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
