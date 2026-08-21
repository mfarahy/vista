'use client';
import { useRef, useState } from 'react';
import {
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Upload,
  Building2,
} from 'lucide-react';
import { apiAssetUrl, apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { VistaLogoLink } from '@/components/vista-logo';
import { EmptyState } from '@/components/empty-state';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

function ZoomableImage({
  src,
  alt,
  imageClassName = '',
}: {
  src: string;
  alt: string;
  imageClassName?: string;
}) {
  const [scale, setScale] = useState(1);
  const clamp = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

  return (
    <div className="relative flex w-full flex-col items-center">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-sm">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Zoom out"
          disabled={scale <= ZOOM_MIN}
          onClick={() => setScale((value) => clamp(+(value - ZOOM_STEP).toFixed(2)))}
        >
          <Minus />
        </Button>
        <span className="w-10 text-center text-[11px] font-semibold text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Zoom in"
          disabled={scale >= ZOOM_MAX}
          onClick={() => setScale((value) => clamp(+(value + ZOOM_STEP).toFixed(2)))}
        >
          <Plus />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Reset zoom"
          onClick={() => setScale(1)}
        >
          <RotateCcw />
        </Button>
      </div>
      <div className="flex w-full justify-center overflow-hidden">
        <img
          src={src}
          alt={alt}
          className={`transition-transform duration-200 ${imageClassName}`}
          style={{ transform: `scale(${scale})` }}
        />
      </div>
    </div>
  );
}

const DEFAULT_SYSTEM_PROMPT =
  'The input image is a 2D architectural floor plan. Preserve the EXACT room layout: the position and proportions of every wall, door, window, and each room must stay unchanged. Do NOT add, remove, merge, or resize any rooms. Do NOT change the architecture or the overall outline of the building.';

const DEFAULT_USER_PROMPT =
  'Transform the 2D floor plan into a realistic 3D interior/exterior visualization. Add realistic furniture appropriate to each room (sofas, beds, kitchen counters, tables, chairs, etc.). Use realistic materials (wood flooring, tiles, brick, glass, concrete, drywall) and realistic natural lighting with soft shadows. Render as a professional architectural 3D visualization with a slightly elevated isometric view so the full layout is visible. Warm inviting color palette, high detail, photorealistic.';

const IMAGE_SIZES = [
  ['landscape_4_3', 'Landscape 4:3'],
  ['landscape_16_9', 'Landscape 16:9'],
  ['square', 'Square'],
  ['square_hd', 'Square HD'],
  ['portrait_4_3', 'Portrait 4:3'],
  ['portrait_16_9', 'Portrait 16:9'],
] as const;

type Result = { url: string; falUrl: string; seed: number };

export default function FloorplanPage() {
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [userPrompt, setUserPrompt] = useState(DEFAULT_USER_PROMPT);
  const [imageSize, setImageSize] = useState('landscape_4_3');
  const [guidanceScale, setGuidanceScale] = useState('3.5');
  const [numInferenceSteps, setNumInferenceSteps] = useState('28');
  const [seed, setSeed] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | undefined | null) {
    if (!file) return;
    setImage(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setError(null);
  }

  async function handleGenerate() {
    if (!image) {
      setError('Please upload a 2D floor plan image first.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('image', image);
      form.append('systemPrompt', systemPrompt);
      form.append('userPrompt', userPrompt);
      form.append('imageSize', imageSize);
      form.append('guidanceScale', guidanceScale);
      form.append('numInferenceSteps', numInferenceSteps);
      if (seed.trim()) form.append('seed', seed.trim());

      const response = await apiFetch('/api/floorplan/to3d', {
        method: 'POST',
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || `Request failed (${response.status})`);
      setResult(body as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-20">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <VistaLogoLink href="/" />
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Building2 className="size-3.5" /> Floorplan · 3D test
          </span>
        </div>
      </header>

      <header className="mx-auto max-w-6xl px-5 pt-10 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Proof of concept · fal.ai flux 2
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          2D floor plan → <span className="text-primary">3D render</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Upload a floor plan image, tune the system and user prompts, and get a 3D
          interior/exterior visualization back. Nothing is persisted.
        </p>
      </header>

      <section className="mx-auto mt-8 grid max-w-6xl gap-6 px-5 sm:px-8 lg:grid-cols-2">
        <div className="flex flex-col gap-5 rounded-xl border bg-card p-6">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Input image
            </Label>
            {previewUrl ? (
              <div className="flex flex-col gap-2">
                <div className="rounded-xl border bg-muted/30 px-3 py-3">
                  <ZoomableImage
                    src={previewUrl}
                    alt="Floor plan preview"
                    imageClassName="max-h-48 rounded-lg object-contain"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => inputRef.current?.click()}
                >
                  <RefreshCw className="size-4" /> Replace image
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-10 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <Upload className="size-5" />
                <span>
                  Click or drop a floor plan image
                  <span className="block text-xs text-muted-foreground">
                    JPG · PNG · WEBP, up to 15 MB
                  </span>
                </span>
              </button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              System prompt
            </Label>
            <Textarea
              className="w-full resize-y"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              placeholder="Rules the model must follow"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              User prompt
            </Label>
            <Textarea
              className="w-full resize-y"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              rows={5}
              placeholder="What to generate"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Image size
              </Label>
              <SelectRoot value={imageSize} onValueChange={setImageSize}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_SIZES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectRoot>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Guidance scale
              </Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={guidanceScale}
                onChange={(e) => setGuidanceScale(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Steps
              </Label>
              <Input
                type="number"
                min="1"
                max="50"
                value={numInferenceSteps}
                onChange={(e) => setNumInferenceSteps(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Seed (optional)
              </Label>
              <Input
                type="number"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="random"
              />
            </div>
          </div>

          <Button type="button" onClick={handleGenerate} disabled={loading}>
            {loading ? (
              <>
                <LoaderCircle className="size-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Generate 3D render
              </>
            )}
          </Button>

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Output</Label>
            {result && (
              <Button variant="outline" size="sm" asChild>
                <a href={apiAssetUrl(result.url)} target="_blank" rel="noreferrer">
                  Open full size
                </a>
              </Button>
            )}
          </div>
          <div className="grid flex-1 place-items-center overflow-hidden rounded-xl border bg-muted/30">
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
                <LoaderCircle className="size-6 animate-spin text-primary" />
                Rendering 3D visualization…
              </div>
            ) : result ? (
              <div className="w-full px-3 py-3">
                <ZoomableImage
                  src={apiAssetUrl(result.url)}
                  alt="Generated 3D render"
                  imageClassName="max-h-[520px] w-full object-contain"
                />
              </div>
            ) : (
              <EmptyState
                icon={RefreshCw}
                title="No render yet"
                description="Upload a floor plan and generate a 3D visualization."
                className="border-0 bg-transparent"
              />
            )}
          </div>
          {result && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                Seed: <span className="font-semibold text-foreground">{result.seed}</span> · Served
                from{' '}
                <code className="rounded bg-muted px-1.5 py-0.5">{result.url}</code>
              </p>
              <p className="truncate">
                fal.ai URL:{' '}
                <a
                  href={result.falUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  {result.falUrl}
                </a>
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
