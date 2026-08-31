'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Copy, Check, LoaderCircle, Upload, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { VistaLogoLink } from '@/components/vista-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { apiFetch } from '@/lib/api';
import {
  RawFloorplanOverlay,
  computeMaxCoord,
  detectUnknownFields,
  type RawGeometry,
  type LayerVisibility,
  RAW_COLORS,
} from '@/components/raw-floorplan-overlay';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export default function DebugFloorplanRecognitionPage() {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageWidth, setImageWidth] = useState(0);
  const [imageHeight, setImageHeight] = useState(0);
  const [raw, setRaw] = useState<RawGeometry | null>(null);
  const [extraFields, setExtraFields] = useState<string[]>([]);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jsonCollapsed, setJsonCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [visibility, setVisibility] = useState<LayerVisibility>({
    wall: true,
    door: true,
    entry_door: true,
    window: true,
    kitchen: true,
    door_center_line: true,
    entry_door_center_line: true,
    window_center_line: true,
  });
  const [showIds, setShowIds] = useState(false);
  const [showImage, setShowImage] = useState(true);
  const [sideBySide, setSideBySide] = useState(false);

  const handleFile = useCallback(
    (f: File | null | undefined) => {
      if (!f) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
        setError(t('debugFloorplanRecognition.errorInvalidImage'));
        return;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        setError(t('debugFloorplanRecognition.errorTooLarge'));
        return;
      }
      setFile(f);
      setError(null);
      setRaw(null);
      setExtraFields([]);
      setDurationMs(null);
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
      // dimensions will be resolved via Image onload
      const img = new window.Image();
      img.onload = () => {
        setImageWidth(img.naturalWidth);
        setImageHeight(img.naturalHeight);
      };
      img.onerror = () => {
        setError(t('debugFloorplanRecognition.errorInvalidImage'));
      };
      img.src = url;
    },
    [t],
  );

  // cleanup object URL
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const runRecognition = async () => {
    if (!file) {
      setError(t('debugFloorplanRecognition.errorInvalidImage'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await apiFetch('/api/debug/floorplan-recognition', { method: 'POST', body: form });
      const body = (await res.json()) as { raw?: RawGeometry; durationMs?: number; error?: string };
      if (!res.ok) {
        throw new Error(body.error || t('debugFloorplanRecognition.errorRecognitionFailed'));
      }
      if (!body.raw) throw new Error(t('debugFloorplanRecognition.errorMalformedResponse'));
      setRaw(body.raw as RawGeometry);
      setExtraFields(detectUnknownFields(body.raw as unknown as Record<string, unknown>));
      setDurationMs(body.durationMs ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('debugFloorplanRecognition.errorRecognitionFailed'));
    } finally {
      setLoading(false);
    }
  };

  const loadFixture = async () => {
    setError(null);
    setLoading(true);
    try {
      // Load JSON
      const jsonRes = await fetch('/recognition-c658e915-9247-4904-8032-717dd11ecfdd.json');
      if (!jsonRes.ok) throw new Error('Fixture JSON not found');
      const fixtureJson = (await jsonRes.json()) as RawGeometry;
      setRaw(fixtureJson);
      setExtraFields(detectUnknownFields(fixtureJson as unknown as Record<string, unknown>));
      // Load image as blob to get file semantics + dimensions
      const imgRes = await fetch('/c658e915-9247-4904-8032-717dd11ecfdd.jpg');
      if (!imgRes.ok) throw new Error('Fixture image not found');
      const blob = await imgRes.blob();
      const url = URL.createObjectURL(blob);
      // revoke previous
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
      setFile(new File([blob], 'c658e915-9247-4904-8032-717dd11ecfdd.jpg', { type: blob.type || 'image/jpeg' }));
      const img = new window.Image();
      img.onload = () => {
        setImageWidth(img.naturalWidth);
        setImageHeight(img.naturalHeight);
      };
      img.src = url;
      setDurationMs(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load fixture');
    } finally {
      setLoading(false);
    }
  };

  const maxCoord = raw ? computeMaxCoord(raw) : null;
  const outOfBounds = maxCoord && imageWidth && imageHeight ? maxCoord.maxX > imageWidth || maxCoord.maxY > imageHeight : false;

  const stats = raw
    ? {
        walls: raw.wall.length,
        doors: raw.door.length,
        entryDoors: raw.entry_door.length,
        windows: raw.window.length,
        kitchen: raw.kitchen.length,
        doorCL: raw.door_center_line.length,
        entryDoorCL: raw.entry_door_center_line.length,
        windowCL: raw.window_center_line.length,
      }
    : null;

  const layerDefs: Array<{ key: keyof LayerVisibility; label: string; color: string }> = [
    { key: 'wall', label: t('debugFloorplanRecognition.layerWalls'), color: RAW_COLORS.wall },
    { key: 'door', label: t('debugFloorplanRecognition.layerDoors'), color: RAW_COLORS.door },
    { key: 'entry_door', label: t('debugFloorplanRecognition.layerEntryDoor'), color: RAW_COLORS.entry_door },
    { key: 'window', label: t('debugFloorplanRecognition.layerWindows'), color: RAW_COLORS.window },
    { key: 'kitchen', label: t('debugFloorplanRecognition.layerKitchen'), color: RAW_COLORS.kitchen },
    { key: 'door_center_line', label: t('debugFloorplanRecognition.layerDoorCenterLines'), color: RAW_COLORS.door_center_line },
    { key: 'entry_door_center_line', label: t('debugFloorplanRecognition.layerEntryDoorCenterLine'), color: RAW_COLORS.entry_door_center_line },
    { key: 'window_center_line', label: t('debugFloorplanRecognition.layerWindowCenterLines'), color: RAW_COLORS.window_center_line },
  ];

  return (
    <main className="min-h-screen bg-background pb-16">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <VistaLogoLink href="/" />
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {t('debugFloorplanRecognition.badge')}
            </span>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 pt-8 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {t('debugFloorplanRecognition.backHome')}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t('debugFloorplanRecognition.title')}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t('debugFloorplanRecognition.intro')}</p>

        {/* Upload */}
        <div className="mt-6 rounded-xl border bg-card p-5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.uploadTitle')}</Label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className={`mt-3 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-sm transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/40'}`}
          >
            {previewUrl ? (
              <div className="flex w-full flex-col items-center gap-3">
                <img
                  src={previewUrl}
                  alt={t('debugFloorplanRecognition.previewAlt')}
                  className="max-h-64 rounded-lg border object-contain"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (!imageWidth || !imageHeight) {
                      setImageWidth(img.naturalWidth);
                      setImageHeight(img.naturalHeight);
                    }
                  }}
                />
                <div className="text-xs text-muted-foreground">
                  {imageWidth && imageHeight ? t('debugFloorplanRecognition.imageDimensions', { width: String(imageWidth), height: String(imageHeight) }) : null}
                  {file ? ` · ${file.name} · ${(file.size / 1024).toFixed(0)} KB` : ''}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                  {t('debugFloorplanRecognition.replaceImage')}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <Upload className="size-6" />
                <span>{t('debugFloorplanRecognition.dropzone')}</span>
                <span className="text-xs">{t('debugFloorplanRecognition.dropzoneHint')}</span>
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" onClick={runRecognition} disabled={!file || loading}>
              {loading ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" /> {t('debugFloorplanRecognition.running')}
                </>
              ) : (
                t('debugFloorplanRecognition.runRecognition')
              )}
            </Button>
            <Button type="button" variant="outline" onClick={loadFixture} disabled={loading}>
              <ImageIcon className="size-4" /> {t('debugFloorplanRecognition.loadFixture')}
            </Button>
            <span className="text-xs text-muted-foreground">{t('debugFloorplanRecognition.loadFixtureHint')}</span>
          </div>
          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {extraFields.length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
              <AlertTriangle className="size-3.5" /> {t('debugFloorplanRecognition.unrecognizedField', { field: extraFields.join(', ') })}
            </p>
          )}
        </div>

        {/* Stats */}
        {raw && stats && imageWidth ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border bg-card p-3">
              <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.walls')}</span>
              <span className="mt-1 block text-lg font-semibold">{stats.walls}</span>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.doors')}</span>
              <span className="mt-1 block text-lg font-semibold">{stats.doors}</span>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.entryDoors')}</span>
              <span className="mt-1 block text-lg font-semibold">{stats.entryDoors}</span>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.windows')}</span>
              <span className="mt-1 block text-lg font-semibold">{stats.windows}</span>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.kitchenRegions')}</span>
              <span className="mt-1 block text-lg font-semibold">{stats.kitchen}</span>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.imageSize')}</span>
              <span className="mt-1 block text-sm font-medium">
                {t('debugFloorplanRecognition.imageDimensions', { width: String(imageWidth), height: String(imageHeight) })}
              </span>
              {maxCoord && <span className="text-xs text-muted-foreground">{t('debugFloorplanRecognition.maxCoord', { x: String(maxCoord.maxX), y: String(maxCoord.maxY) })}</span>}
              <span className={`mt-1 block text-xs ${outOfBounds ? 'text-amber-600' : 'text-green-600'}`}>
                {outOfBounds ? t('debugFloorplanRecognition.coordWarning') : t('debugFloorplanRecognition.coordOk')}
              </span>
              {durationMs !== null && <span className="text-xs text-muted-foreground">{t('debugFloorplanRecognition.duration', { ms: String(durationMs) })}</span>}
            </div>
          </div>
        ) : null}

        {/* Controls */}
        {raw && (
          <div className="mt-6 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap gap-4">
              {layerDefs.map(({ key, label, color }) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={visibility[key]}
                    onCheckedChange={(v) => setVisibility((prev) => ({ ...prev, [key]: Boolean(v) }))}
                  />
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} aria-hidden />
                  {label}
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 border-t pt-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={showIds} onCheckedChange={(v) => setShowIds(Boolean(v))} />
                {t('debugFloorplanRecognition.showIds')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={showImage} onCheckedChange={(v) => setShowImage(Boolean(v))} />
                {t('debugFloorplanRecognition.showImage')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={sideBySide} onCheckedChange={(v) => setSideBySide(Boolean(v))} />
                {t('debugFloorplanRecognition.sideBySide')}
              </label>
            </div>
          </div>
        )}

        {/* Visualization */}
        {raw && previewUrl && imageWidth ? (
          sideBySide ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.originalImage')}</h3>
                <div className="overflow-hidden rounded-xl border">
                  <img src={previewUrl} alt={t('debugFloorplanRecognition.previewAlt')} className="h-auto w-full object-contain" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t('debugFloorplanRecognition.imageDimensions', { width: String(imageWidth), height: String(imageHeight) })}</p>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.rawOverlay')}</h3>
                <RawFloorplanOverlay
                  imageUrl={previewUrl}
                  imageWidth={imageWidth}
                  imageHeight={imageHeight}
                  raw={raw}
                  visibility={visibility}
                  showIds={showIds}
                  showImage={showImage}
                />
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <RawFloorplanOverlay
                imageUrl={previewUrl}
                imageWidth={imageWidth}
                imageHeight={imageHeight}
                raw={raw}
                visibility={visibility}
                showIds={showIds}
                showImage={showImage}
              />
            </div>
          )
        ) : (
          !loading && <p className="mt-6 text-sm text-muted-foreground">{t('debugFloorplanRecognition.noResult')}</p>
        )}

        {/* Raw JSON */}
        {raw && (
          <div className="mt-6 rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-semibold">{t('debugFloorplanRecognition.rawJson')}</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(JSON.stringify(raw, null, 2));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? t('debugFloorplanRecognition.copied') : t('debugFloorplanRecognition.copyJson')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setJsonCollapsed((v) => !v)}>
                  {jsonCollapsed ? t('debugFloorplanRecognition.expand') : t('debugFloorplanRecognition.collapse')}
                </Button>
              </div>
            </div>
            {!jsonCollapsed && (
              <pre className="max-h-[600px] overflow-auto bg-muted/20 p-4 text-xs">
                <code>{JSON.stringify(raw, null, 2)}</code>
              </pre>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
