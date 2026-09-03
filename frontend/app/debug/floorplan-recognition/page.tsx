'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Copy, Check, LoaderCircle, Upload, Image as ImageIcon, AlertTriangle, Brain, Download, Sparkles, Grid2x2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { VistaLogoLink } from '@/components/vista-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { apiFetch } from '@/lib/api';
import {
  computeMaxCoord,
  detectUnknownFields,
  type RawGeometry,
  type LayerVisibility,
  RAW_COLORS,
} from '@/components/raw-floorplan-overlay';
import {
  VlmFloorplanOverlay,
  type VlmAnalysis,
  type VlmVisibility,
  type TopologySummary,
  type ObjectClassification,
  type GeometryConstraint,
  type GeometryConstraintsVisibility,
  type GeometryRelationship,
  sortGeometryRelationshipsByConfidence,
  geometryRelationshipKey,
  VLM_COLORS,
  GEOMETRY_CONSTRAINT_COLORS,
  geometryConstraintLabel,
  defaultConstraintsVisibility,
  constraintKey,
  sortConstraintsByConfidence,
  summarizeConstraints,
  isLowConfidenceConstraint,
} from '@/components/vlm-floorplan-overlay';
import { generateAnnotatedImageDataUrl, dataUrlToBlob } from '@/lib/annotated-recognition-image';
import { extractGeometryPrimitives } from '@/lib/geometry-primitives';
import {
  GeometryPrimitivesOverlay,
  PRIMITIVE_COLORS,
} from '@/components/geometry-primitives-overlay';

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

  // VLM state
  const [vlmAnalysis, setVlmAnalysis] = useState<VlmAnalysis | null>(null);
  const [vlmModel, setVlmModel] = useState<string | null>(null);
  const [vlmDurationMs, setVlmDurationMs] = useState<number | null>(null);
  const [vlmWarnings, setVlmWarnings] = useState<string[]>([]);
  const [vlmLoading, setVlmLoading] = useState(false);
  const [vlmError, setVlmError] = useState<string | null>(null);
  const [vlmRawResponse, setVlmRawResponse] = useState<unknown>(null);
  const [vlmJsonCollapsed, setVlmJsonCollapsed] = useState(false);
  const [vlmFindingsCollapsed, setVlmFindingsCollapsed] = useState(false);
  const [vlmCopied, setVlmCopied] = useState(false);
  const [vlmVisibility, setVlmVisibility] = useState<VlmVisibility>({
    wallRelationships: true,
    openingAssociations: true,
    objectClassifications: true,
    rooms: true,
  });
  const [showVlmIds, setShowVlmIds] = useState(true);
  const [showConfidence, setShowConfidence] = useState(true);
  const [vlmMode, setVlmMode] = useState<'raw+vlm' | 'topology-only' | 'geometry-only' | 'raw+vlm+constraints'>('raw+vlm');
  const [topologyHighlightIds, setTopologyHighlightIds] = useState<string[]>([]);
  const [showConstraints, setShowConstraints] = useState(true);
  const [constraintsVisibility, setConstraintsVisibility] = useState<GeometryConstraintsVisibility>({
    ...defaultConstraintsVisibility,
  });
  const [selectedConstraintId, setSelectedConstraintId] = useState<string | null>(null);

  // Interactive inspector
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  // Geometry primitives state
  const [primitiveMode, setPrimitiveMode] = useState<'raw' | 'raw+primitives' | 'primitives-only'>('raw+primitives');
  const [showPrimitivesLayer, setShowPrimitivesLayer] = useState(true);
  const [showPrimitiveLabels, setShowPrimitiveLabels] = useState(false);
  const [showPrimitiveMeasurements, setShowPrimitiveMeasurements] = useState(false);
  const [showSourcePolygons, setShowSourcePolygons] = useState(true);
  const [selectedPrimitiveId, setSelectedPrimitiveId] = useState<string | null>(null);
  const [primitivesJsonCollapsed, setPrimitivesJsonCollapsed] = useState(false);
  const [primitivesCopied, setPrimitivesCopied] = useState(false);

  // Annotated recognition image state
  const [annotatedDataUrl, setAnnotatedDataUrl] = useState<string | null>(null);
  const [annotatedGenerating, setAnnotatedGenerating] = useState(false);
  const [annotatedError, setAnnotatedError] = useState<string | null>(null);
  const [annotatedCollapsed, setAnnotatedCollapsed] = useState(false);

  // Derive recognition/VLM status for explicit workflow
  const recognitionStatus: 'not_run' | 'running' | 'complete' | 'error' = loading
    ? 'running'
    : error
      ? 'error'
      : raw
        ? 'complete'
        : 'not_run';
  const vlmStatusKey: 'not_analyzed' | 'analyzing' | 'complete' | 'error' = vlmLoading
    ? 'analyzing'
    : vlmError
      ? 'error'
      : vlmAnalysis
        ? 'complete'
        : 'not_analyzed';

  const resetVlm = useCallback(() => {
    setVlmAnalysis(null);
    setVlmModel(null);
    setVlmDurationMs(null);
    setVlmWarnings([]);
    setVlmError(null);
    setVlmRawResponse(null);
    setTopologyHighlightIds([]);
    setSelectedObjectId(null);
    setSelectedConstraintId(null);
  }, []);

  // Generate annotated image whenever raw or original image changes
  useEffect(() => {
    if (!raw || !previewUrl || !imageWidth || !imageHeight) {
      setAnnotatedDataUrl(null);
      setAnnotatedError(null);
      return;
    }
    let cancelled = false;
    setAnnotatedGenerating(true);
    setAnnotatedError(null);
    generateAnnotatedImageDataUrl({
      imageUrl: previewUrl,
      raw,
      imageWidth,
      imageHeight,
    })
      .then((url) => {
        if (!cancelled) setAnnotatedDataUrl(url);
      })
      .catch((e) => {
        if (!cancelled) setAnnotatedError(e instanceof Error ? e.message : 'Failed to generate annotated image');
      })
      .finally(() => {
        if (!cancelled) setAnnotatedGenerating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [raw, previewUrl, imageWidth, imageHeight]);

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
      resetVlm();
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
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
    [t, resetVlm],
  );

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
    resetVlm();
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await apiFetch('/api/debug/floorplan-recognition', { method: 'POST', body: form });
      const body = (await res.json().catch(() => ({}))) as { raw?: RawGeometry; durationMs?: number; error?: string };
      if (!res.ok) {
        if (res.status === 503) {
          // Backend already returns a detailed 503 message (includes hint).
          // Prefer it verbatim to avoid translation duplication; fallback to i18n only if empty.
          throw new Error(
            body.error || `${t('debugFloorplanRecognition.errorServiceUnavailable')} ${t('debugFloorplanRecognition.errorServiceUnavailableHint')}`,
          );
        }
        if (res.status === 504) {
          throw new Error(body.error || t('debugFloorplanRecognition.errorProviderTimeout'));
        }
        throw new Error(body.error || t('debugFloorplanRecognition.errorRecognitionStatus', { status: String(res.status) }));
      }
      if (!body.raw) throw new Error(t('debugFloorplanRecognition.errorMalformedResponse'));
      setRaw(body.raw as RawGeometry);
      setExtraFields(detectUnknownFields(body.raw as unknown as Record<string, unknown>));
      setDurationMs(body.durationMs ?? null);
      setSelectedPrimitiveId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('debugFloorplanRecognition.errorRecognitionFailed');
      // Network-level fetch failure (expose-service not reachable) — show localized hint once
      if (/fetch failed|Failed to fetch|NetworkError|ECONNREFUSED/i.test(msg)) {
        const alreadyLocalized = msg.includes(t('debugFloorplanRecognition.errorServiceUnavailable'));
        const alreadyHasHint = msg.includes('docker compose --profile floorplan');
        if (alreadyLocalized || alreadyHasHint) {
          setError(msg);
        } else {
          setError(`${t('debugFloorplanRecognition.errorServiceUnavailable')} — ${msg} ${t('debugFloorplanRecognition.errorServiceUnavailableHint')}`);
        }
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadFixtureFor = async (jsonPath: string, imgPath: string, fileName: string) => {
    setError(null);
    setLoading(true);
    resetVlm();
    try {
      const jsonRes = await fetch(jsonPath);
      if (!jsonRes.ok) throw new Error('Fixture JSON not found');
      const fixtureJson = (await jsonRes.json()) as RawGeometry;
      setRaw(fixtureJson);
      setExtraFields(detectUnknownFields(fixtureJson as unknown as Record<string, unknown>));
      const imgRes = await fetch(imgPath);
      if (!imgRes.ok) throw new Error('Fixture image not found');
      const blob = await imgRes.blob();
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
      setFile(new File([blob], fileName, { type: blob.type || 'image/jpeg' }));
      const img = new window.Image();
      img.onload = () => {
        setImageWidth(img.naturalWidth);
        setImageHeight(img.naturalHeight);
      };
      img.src = url;
      setDurationMs(null);
      setSelectedPrimitiveId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load fixture');
    } finally {
      setLoading(false);
    }
  };

  const loadFixture = () => loadFixtureFor('/recognition-c658e915-9247-4904-8032-717dd11ecfdd.json', '/c658e915-9247-4904-8032-717dd11ecfdd.jpg', 'c658e915-9247-4904-8032-717dd11ecfdd.jpg');
  const loadFixtureLarge = () => loadFixtureFor('/recognition-b8ea2db6-4d0a-4c87-9570-d7cd2970de98.json', '/b8ea2db6-4d0a-4c87-9570-d7cd2970de98.jpg', 'b8ea2db6-4d0a-4c87-9570-d7cd2970de98.jpg');

  const runVlmAnalysis = async () => {
    if (!file || !raw) {
      setVlmError(t('debugFloorplanRecognition.vlmNeedRaw'));
      return;
    }
    if (!annotatedDataUrl && raw) {
      setVlmError(t('debugFloorplanRecognition.vlmNeedAnnotated'));
      return;
    }
    setVlmLoading(true);
    setVlmError(null);
    setVlmRawResponse(null);
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('raw', JSON.stringify(raw));
      // Geometry primitives (VLM geometry-interpretation POC input): the VLM
      // reasons about these existing primitives and returns relationships
      // between them — it never calculates geometry. The backend falls back
      // to server-side extraction when this field is absent.
      if (primitivesResult) {
        const runs = primitivesResult.primitives.filter((p) => p.kind === 'run');
        form.append(
          'primitives',
          JSON.stringify(
            runs.map((p) => ({
              primitiveId: p.primitiveId,
              sourceObjectId: p.sourceObjectId,
              type: 'run',
              start: { x: p.from.x, y: p.from.y },
              end: { x: p.to.x, y: p.to.y },
              lengthPx: p.lengthPx,
              angleDeg: p.angleDeg,
              orientation: p.orientation,
              thicknessPx: p.estimatedThicknessPx,
              sourceVertexIndices: p.sourceVertexIndices,
            })),
          ),
        );
      }
      // Attach annotated image as second image if available
      if (annotatedDataUrl) {
        try {
          const blob = await dataUrlToBlob(annotatedDataUrl);
          form.append('annotatedImage', blob, 'annotated.png');
        } catch {
          // fallback: send dataUrl as field
          form.append('annotatedImageDataUrl', annotatedDataUrl);
        }
      }
      const res = await apiFetch('/api/debug/floorplan-recognition/vlm-analysis', { method: 'POST', body: form });
      const body = (await res.json()) as {
        analysis?: VlmAnalysis;
        model?: string;
        durationMs?: number;
        warnings?: string[];
        error?: string;
        rawResponse?: unknown;
        rawContent?: string;
      };
      if (!res.ok) {
        // Check for rawContent debug case
        if (body.rawContent) {
          setVlmRawResponse(body.rawContent);
        } else if (body.rawResponse) {
          setVlmRawResponse(body.rawResponse);
        }
        throw new Error(body.error || t('debugFloorplanRecognition.vlmError'));
      }
      if (!body.analysis) throw new Error(t('debugFloorplanRecognition.vlmParseError'));
      setVlmAnalysis(body.analysis);
      setVlmModel(body.model ?? null);
      setVlmDurationMs(body.durationMs ?? null);
      setVlmWarnings(body.warnings ?? []);
      setVlmRawResponse(body.rawResponse ?? null);
      setTopologyHighlightIds([]);
      setSelectedConstraintId(null);
      // enable all VLM layers + constraints by default after analysis
      setVlmVisibility({ wallRelationships: true, openingAssociations: true, objectClassifications: true, rooms: true });
      setShowVlmIds(true);
      setShowConfidence(true);
      setShowConstraints(true);
      setConstraintsVisibility({ ...defaultConstraintsVisibility });
      // Raw + VLM + Constraints is the default view once analysis is complete
      setVlmMode('raw+vlm+constraints');
    } catch (e) {
      setVlmError(e instanceof Error ? e.message : t('debugFloorplanRecognition.vlmError'));
    } finally {
      setVlmLoading(false);
    }
  };

  const exportVlm = () => {
    if (!vlmAnalysis) return;
    const blob = new Blob([JSON.stringify(vlmAnalysis, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vlm-analysis-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportPrimitives = () => {
    if (!primitivesResult) return;
    const payload = {
      generatedAt: new Date().toISOString(),
      imageSize: { width: imageWidth, height: imageHeight },
      thresholds: primitivesResult.thresholds,
      summary: primitivesResult.summary,
      primitives: primitivesResult.primitives,
      relationships: primitivesResult.relationships,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geometry-primitives-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const maxCoord = raw ? computeMaxCoord(raw) : null;
  const outOfBounds = maxCoord && imageWidth && imageHeight ? maxCoord.maxX > imageWidth || maxCoord.maxY > imageHeight : false;

  // Geometry primitives — derived deterministically from the RAW result on the client.
  const primitivesResult = useMemo(() => (raw ? extractGeometryPrimitives(raw) : null), [raw]);

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

  const vlmLayerDefs: Array<{ key: keyof VlmVisibility; label: string; color: string }> = [
    { key: 'wallRelationships', label: t('debugFloorplanRecognition.vlmLayerWallRelationships'), color: VLM_COLORS.same_continuous_wall },
    { key: 'openingAssociations', label: t('debugFloorplanRecognition.vlmLayerOpeningAssociations'), color: VLM_COLORS.opening },
    { key: 'objectClassifications', label: t('debugFloorplanRecognition.vlmLayerObjectClassifications'), color: VLM_COLORS.classification_suspicious },
    { key: 'rooms', label: t('debugFloorplanRecognition.vlmLayerRooms'), color: VLM_COLORS.room },
  ];

  const vlmStatus = vlmLoading ? t('debugFloorplanRecognition.vlmStatusAnalyzing') : vlmAnalysis ? t('debugFloorplanRecognition.vlmStatusComplete') : vlmError ? t('debugFloorplanRecognition.vlmStatusError') : t('debugFloorplanRecognition.vlmNotAnalyzed');

  // Derived architectural topology (from VLM topologySummary + objectClassifications)
  const emptySummary: TopologySummary = { continuousWalls: [], corners: [], tJunctions: [], falsePositives: [] };
  const topology = vlmAnalysis?.topologySummary ?? emptySummary;
  const classifications = (vlmAnalysis?.objectClassifications ?? []) as ObjectClassification[];
  const suspiciousObjects = classifications.filter((c) => c.classification === 'suspicious');
  const falsePositiveObjects = classifications.filter((c) => c.classification === 'likely_false_positive');
  const uncertainObjects = classifications.filter((c) => c.classification === 'uncertain');
  const validObjects = classifications.filter((c) => c.classification === 'valid');
  const summaryFalsePositives = topology.falsePositives;
  const hasTopology =
    topology.continuousWalls.length > 0 ||
    topology.corners.length > 0 ||
    topology.tJunctions.length > 0 ||
    topology.falsePositives.length > 0 ||
    classifications.length > 0;

  const toggleHighlight = (ids: string[]) => {
    setTopologyHighlightIds((prev) => {
      const same = prev.length === ids.length && ids.every((id) => prev.includes(id));
      return same ? [] : ids;
    });
  };

  const topologyItem = (ids: string[]) => (
    <button
      type="button"
      onClick={() => toggleHighlight(ids)}
      title={t('debugFloorplanRecognition.topologyClickHint')}
      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:border-amber-400 hover:bg-amber-50 ${
        topologyHighlightIds.length > 0 && ids.every((id) => topologyHighlightIds.includes(id)) && topologyHighlightIds.length === ids.length
          ? 'border-amber-400 bg-amber-100'
          : 'border-muted-foreground/20 bg-muted/30'
      }`}
    >
      {ids.join(' + ')}
    </button>
  );

  const topologyIdChip = (id: string) => (
    <button
      type="button"
      onClick={() => toggleHighlight([id])}
      title={t('debugFloorplanRecognition.topologyClickHint')}
      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:border-amber-400 hover:bg-amber-50 ${
        topologyHighlightIds.length === 1 && topologyHighlightIds.includes(id) ? 'border-amber-400 bg-amber-100' : 'border-muted-foreground/20 bg-muted/30'
      }`}
    >
      {id}
    </button>
  );

  // Overlay stack: RAW + VLM (existing) combined with the Geometry Primitives
  // layer in the SAME coordinate system. Mode controls what is rendered.
  const renderOverlayStack = () => {
    if (!raw) return null;
    if (primitiveMode === 'primitives-only') {
      return showPrimitivesLayer && primitivesResult ? (
        <GeometryPrimitivesOverlay
          imageUrl={previewUrl}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
          result={primitivesResult}
          raw={raw.wall}
          showLabels={showPrimitiveLabels}
          showMeasurements={showPrimitiveMeasurements}
          showSourcePolygons={showSourcePolygons}
          showImage={showImage}
          selectedId={selectedPrimitiveId}
          onSelect={setSelectedPrimitiveId}
        />
      ) : (
        <div className="rounded-xl border bg-white p-5 text-sm text-muted-foreground">
          <img src={previewUrl ?? undefined} alt={t('debugFloorplanRecognition.previewAlt')} className="h-auto w-full rounded object-contain" />
          <p className="mt-2">{t('geometryPrimitives.noData')}</p>
        </div>
      );
    }
    return (
      <div className="relative">
        <VlmFloorplanOverlay
          imageUrl={previewUrl}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
          raw={raw}
          visibility={visibility}
          showIds={showIds}
          showImage={showImage}
          vlmAnalysis={vlmAnalysis}
          vlmVisibility={vlmVisibility}
          showVlmIds={showVlmIds}
          showConfidence={showConfidence}
          hideRaw={vlmMode === 'topology-only'}
          topologyOnly={vlmMode === 'topology-only'}
          highlightedIds={topologyHighlightIds}
          onSelectObject={setSelectedObjectId}
          selectedId={selectedObjectId}
          constraintsVisibility={constraintsVisibility}
          showConstraints={showConstraints && (vlmMode === 'raw+vlm+constraints' || vlmMode === 'geometry-only')}
          geometryOnlyMode={vlmMode === 'geometry-only'}
          onSelectConstraint={setSelectedConstraintId}
          selectedConstraintId={selectedConstraintId}
        />
        {showPrimitivesLayer && primitiveMode === 'raw+primitives' && primitivesResult && (
          <GeometryPrimitivesOverlay
            overlaid
            imageUrl={null}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            result={primitivesResult}
            raw={raw.wall}
            showLabels={showPrimitiveLabels}
            showMeasurements={showPrimitiveMeasurements}
            showSourcePolygons={showSourcePolygons}
            showImage={false}
            selectedId={selectedPrimitiveId}
            onSelect={setSelectedPrimitiveId}
          />
        )}
      </div>
    );
  };

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

        {/* Test a floor plan — Custom image + Fixture — visually distinct two-workflow */}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {/* Custom image */}
          <div className="rounded-xl border bg-card p-5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.customImageLabel')}</Label>
            <h2 className="mt-1 text-sm font-semibold">{t('debugFloorplanRecognition.customImageTitle')}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.customImageHint')}</p>
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
              className={`mt-3 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-sm transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/40'}`}
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
              <Button type="button" variant="outline" onClick={runVlmAnalysis} disabled={!raw || !file || vlmLoading || loading || annotatedGenerating || !annotatedDataUrl}>
                {vlmLoading ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" /> {t('debugFloorplanRecognition.analyzing')}
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" /> {t('debugFloorplanRecognition.analyzeWithVlm')}
                  </>
                )}
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${recognitionStatus === 'complete' ? 'bg-green-50 text-green-700' : recognitionStatus === 'running' ? 'bg-amber-50 text-amber-700' : recognitionStatus === 'error' ? 'bg-red-50 text-red-700' : 'bg-muted text-muted-foreground'}`}>
                <span className={`h-2 w-2 rounded-full ${recognitionStatus === 'complete' ? 'bg-green-500' : recognitionStatus === 'running' ? 'bg-amber-500 animate-pulse' : recognitionStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'}`} aria-hidden />
                {t('debugFloorplanRecognition.recognitionStatusLabel')}: {recognitionStatus === 'running' ? t('debugFloorplanRecognition.recognitionRunning') : recognitionStatus === 'complete' ? t('debugFloorplanRecognition.recognitionComplete') : recognitionStatus === 'error' ? t('debugFloorplanRecognition.recognitionError') : t('debugFloorplanRecognition.recognitionNotRun')}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${vlmStatusKey === 'complete' ? 'bg-green-50 text-green-700' : vlmStatusKey === 'analyzing' ? 'bg-amber-50 text-amber-700' : vlmStatusKey === 'error' ? 'bg-red-50 text-red-700' : 'bg-muted text-muted-foreground'}`}>
                <span className={`h-2 w-2 rounded-full ${vlmStatusKey === 'complete' ? 'bg-green-500' : vlmStatusKey === 'analyzing' ? 'bg-amber-500 animate-pulse' : vlmStatusKey === 'error' ? 'bg-red-500' : 'bg-gray-400'}`} aria-hidden />
                {t('debugFloorplanRecognition.vlmStatusLabel')}: {vlmStatusKey === 'analyzing' ? t('debugFloorplanRecognition.vlmStatusAnalyzing') : vlmStatusKey === 'complete' ? t('debugFloorplanRecognition.vlmStatusComplete') : vlmStatusKey === 'error' ? t('debugFloorplanRecognition.vlmStatusError') : t('debugFloorplanRecognition.vlmNotAnalyzed')}
              </span>
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

          {/* Fixture */}
          <div className="rounded-xl border bg-card p-5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.fixtureLabel')}</Label>
            <h2 className="mt-1 text-sm font-semibold">{t('debugFloorplanRecognition.fixtureTitle')}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.fixtureHint')}</p>
            <div className="mt-3 rounded-lg border bg-muted/20 p-3">
              <div className="text-xs font-medium">c658e915-9247-4904-8032-717dd11ecfdd</div>
              <div className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.fixtureMeta')}</div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={loadFixture} disabled={loading}>
                <ImageIcon className="size-4" /> {t('debugFloorplanRecognition.loadFixture')}
              </Button>
              <span className="text-xs text-muted-foreground">{t('debugFloorplanRecognition.loadFixtureHint')}</span>
            </div>
            <div className="mt-3 rounded-lg border bg-muted/20 p-3">
              <div className="text-xs font-medium">b8ea2db6-4d0a-4c87-9570-d7cd2970de98</div>
              <div className="mt-1 text-xs text-muted-foreground">3 walls · 3 doors · 1 entry door · 3 windows — larger floorplan (bedrooms, bathrooms, kitchen, porch)</div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={loadFixtureLarge} disabled={loading}>
                <ImageIcon className="size-4" /> {t('debugFloorplanRecognition.loadFixtureLarge')}
              </Button>
              <span className="text-xs text-muted-foreground">{t('debugFloorplanRecognition.loadFixtureLargeHint')}</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t('debugFloorplanRecognition.fixtureBothNote')}</p>
          </div>
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

        {/* RAW Layer Controls */}
        {raw && (
          <div className="mt-6 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-red-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-600">{t('debugFloorplanRecognition.vlmRawModelOutput')}</span>
              <span className="text-xs text-muted-foreground">— RAW recognition layers</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-4">
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

        {/* Geometry Primitives — deterministic extraction layer */}
        {!raw && (
          <div className="mt-6 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-teal-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal-700">{t('geometryPrimitives.badge')}</span>
              <span className="text-xs text-muted-foreground">— {t('geometryPrimitives.noRaw')}</span>
            </div>
          </div>
        )}
        {raw && primitivesResult && (
          <div className="mt-6 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-teal-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal-700">{t('geometryPrimitives.badge')}</span>
              <span className="text-xs text-muted-foreground">— {t('geometryPrimitives.intro')}</span>
            </div>

            {/* Mode selector */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{t('geometryPrimitives.modeLabel')}:</span>
              <Button type="button" variant={primitiveMode === 'raw' ? 'default' : 'outline'} size="sm" onClick={() => setPrimitiveMode('raw')}>
                {t('geometryPrimitives.modeRaw')}
              </Button>
              <Button type="button" variant={primitiveMode === 'raw+primitives' ? 'default' : 'outline'} size="sm" onClick={() => setPrimitiveMode('raw+primitives')}>
                {t('geometryPrimitives.modeRawPlus')}
              </Button>
              <Button type="button" variant={primitiveMode === 'primitives-only' ? 'default' : 'outline'} size="sm" onClick={() => setPrimitiveMode('primitives-only')}>
                {t('geometryPrimitives.modeOnly')}
              </Button>
            </div>

            {/* Layer + label toggles */}
            <div className="mt-4 flex flex-wrap gap-4 border-t pt-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={showPrimitivesLayer} onCheckedChange={(v) => setShowPrimitivesLayer(Boolean(v))} />
                {t('geometryPrimitives.layerToggle')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={showPrimitiveLabels} onCheckedChange={(v) => setShowPrimitiveLabels(Boolean(v))} />
                {t('geometryPrimitives.showLabels')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={showPrimitiveMeasurements} onCheckedChange={(v) => setShowPrimitiveMeasurements(Boolean(v))} />
                {t('geometryPrimitives.showMeasurements')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={showSourcePolygons} onCheckedChange={(v) => setShowSourcePolygons(Boolean(v))} />
                {t('geometryPrimitives.showSourcePolygons')}
              </label>
            </div>

            {/* Visual diagnostic summary */}
            <div className="mt-4 border-t pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('geometryPrimitives.summaryTitle')}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { label: t('geometryPrimitives.summaryRawWalls'), value: primitivesResult.summary.rawWallCount, tone: 'neutral' as const },
                  { label: t('geometryPrimitives.summaryTotal'), value: primitivesResult.summary.totalPrimitives, tone: 'neutral' as const },
                  { label: t('geometryPrimitives.summaryRuns'), value: primitivesResult.summary.runs, tone: 'neutral' as const },
                  { label: t('geometryPrimitives.summaryHorizontal'), value: primitivesResult.summary.horizontal, tone: 'teal' as const },
                  { label: t('geometryPrimitives.summaryVertical'), value: primitivesResult.summary.vertical, tone: 'violet' as const },
                  { label: t('geometryPrimitives.summaryDiagonal'), value: primitivesResult.summary.diagonal, tone: 'amber' as const },
                  { label: t('geometryPrimitives.summaryNoOrientation'), value: primitivesResult.summary.noReliableOrientation, tone: 'neutral' as const },
                  { label: t('geometryPrimitives.summaryCorners'), value: primitivesResult.summary.corners, tone: 'neutral' as const },
                  { label: t('geometryPrimitives.summaryThickness'), value: primitivesResult.summary.withThicknessEvidence, tone: 'green' as const },
                  { label: t('geometryPrimitives.summaryAmbiguous'), value: primitivesResult.summary.ambiguous, tone: 'amber' as const },
                  { label: t('geometryPrimitives.summaryLowQuality'), value: primitivesResult.summary.lowQuality, tone: 'red' as const },
                ].map((chip) => (
                  <span
                    key={chip.label}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                      chip.tone === 'teal'
                        ? 'border-teal-200 bg-teal-50 text-teal-800'
                        : chip.tone === 'violet'
                          ? 'border-violet-200 bg-violet-50 text-violet-800'
                          : chip.tone === 'amber'
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : chip.tone === 'green'
                              ? 'border-green-200 bg-green-50 text-green-800'
                              : chip.tone === 'red'
                                ? 'border-red-200 bg-red-50 text-red-800'
                                : 'border-muted-foreground/20 bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    <span className="font-semibold">{chip.value}</span> {chip.label}
                  </span>
                ))}
              </div>
              {/* Per-RAW-object breakdown — which detections are actually compound */}
              <div className="mt-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('geometryPrimitives.compoundTitle')}</h4>
                <p className="mt-1 text-xs text-muted-foreground">{t('geometryPrimitives.compoundHint')}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(() => {
                    const counts = new Map<string, number>();
                    for (const p of primitivesResult.primitives) {
                      counts.set(p.sourceObjectId, (counts.get(p.sourceObjectId) ?? 0) + 1);
                    }
                    return [...counts.entries()]
                      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
                      .map(([id, count]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setSelectedObjectId(id)}
                          title={t('geometryPrimitives.compoundHint')}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs transition-colors hover:border-teal-400 hover:bg-teal-50 ${
                            selectedObjectId === id ? 'border-teal-400 bg-teal-100' : 'border-muted-foreground/20 bg-muted/30'
                          }`}
                        >
                          <span className="font-semibold">{id}</span>
                          <span className="font-sans text-muted-foreground">→ {t('geometryPrimitives.compoundPrimitives', { count: String(count) })}</span>
                        </button>
                      ));
                  })()}
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{t('geometryPrimitives.legend')}:</span>
              {[
                { color: PRIMITIVE_COLORS.horizontal, label: t('geometryPrimitives.legendHorizontal'), dashed: false },
                { color: PRIMITIVE_COLORS.vertical, label: t('geometryPrimitives.legendVertical'), dashed: false },
                { color: PRIMITIVE_COLORS.diagonal, label: t('geometryPrimitives.legendDiagonal'), dashed: false },
                { color: PRIMITIVE_COLORS.corner, label: t('geometryPrimitives.legendCorner'), dashed: false, dot: true },
                { color: '#111', label: t('geometryPrimitives.legendUncertain'), dashed: true },
                { color: PRIMITIVE_COLORS.selected, label: t('geometryPrimitives.legendSelected'), dashed: false },
                { color: PRIMITIVE_COLORS.sourcePolygon, label: t('geometryPrimitives.legendSourcePolygon'), dashed: true },
              ].map((item) => (
                <span key={item.label} className="inline-flex items-center gap-1.5">
                  {item.dot ? (
                    <span className="inline-block size-2.5 rounded-full border border-white" style={{ background: item.color }} />
                  ) : (
                    <span className="inline-block h-0.5 w-6 rounded" style={{ background: item.color, opacity: item.dashed ? 0.6 : 1 }} />
                  )}
                  {item.label}
                </span>
              ))}
            </div>

            <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">{t('geometryPrimitives.selectHint')}</p>
          </div>
        )}

        {/* Visualization — RAW + VLM + Geometry Primitives (mode-aware) */}
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
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.rawOverlay')}</h3>
                  {primitiveMode === 'primitives-only' ? (
                    <span className="rounded bg-teal-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700">{t('geometryPrimitives.badge')}</span>
                  ) : (
                    vlmAnalysis && <span className="rounded bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">{t('debugFloorplanRecognition.vlmArchitecturalInterpretation')}</span>
                  )}
                </div>
                {renderOverlayStack()}
                {vlmAnalysis && vlmMode === 'topology-only' && (
                  <p className="mt-1 text-xs text-violet-600">{t('debugFloorplanRecognition.topologyOnlyNote')}</p>
                )}
                {vlmAnalysis && vlmMode === 'geometry-only' && (
                  <p className="mt-1 text-xs text-purple-600">{t('debugFloorplanRecognition.geometryOnlyNote')}</p>
                )}
                {primitiveMode === 'primitives-only' && (
                  <p className="mt-1 text-xs text-teal-700">{t('geometryPrimitives.modeOnlyNote')}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {primitiveMode === 'primitives-only' ? (
                  <>
                    <span className="rounded bg-teal-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal-700">{t('geometryPrimitives.badge')}</span>
                    <span className="text-xs text-muted-foreground">· {t('geometryPrimitives.modeOnly')}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{t('geometryPrimitives.selectHint')}</span>
                  </>
                ) : (
                  <>
                    <span className="rounded bg-red-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-600">{t('debugFloorplanRecognition.vlmRawModelOutput')}</span>
                    {showPrimitivesLayer && primitiveMode === 'raw+primitives' && (
                      <>
                        <span className="text-xs text-muted-foreground">+</span>
                        <span className="rounded bg-teal-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal-700">{t('geometryPrimitives.badge')}</span>
                      </>
                    )}
                    {vlmAnalysis && (
                      <>
                        <span className="text-xs text-muted-foreground">+</span>
                        <span className="rounded bg-violet-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700">{t('debugFloorplanRecognition.vlmArchitecturalInterpretation')}</span>
                      </>
                    )}
                    <span className="text-xs text-muted-foreground">· {t('debugFloorplanRecognition.vlmOverlayTitle')}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{t('debugFloorplanRecognition.clickToInspect')}</span>
                  </>
                )}
              </div>
              {renderOverlayStack()}
              {vlmAnalysis && vlmMode === 'topology-only' && (
                <p className="mt-1 text-xs text-violet-600">{t('debugFloorplanRecognition.topologyOnlyNote')}</p>
              )}
              {vlmAnalysis && vlmMode === 'geometry-only' && (
                <p className="mt-1 text-xs text-purple-600">{t('debugFloorplanRecognition.geometryOnlyNote')}</p>
              )}
              {primitiveMode === 'primitives-only' && (
                <p className="mt-1 text-xs text-teal-700">{t('geometryPrimitives.modeOnlyNote')}</p>
              )}
            </div>
          )
        ) : (
          !loading && <p className="mt-6 text-sm text-muted-foreground">{t('debugFloorplanRecognition.noResult')}</p>
        )}

        {/* Interactive Object Inspector */}
        {raw && selectedObjectId && (
          <div className="mt-6 rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t('debugFloorplanRecognition.inspectTitle')}: {selectedObjectId}</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedObjectId(null)}>{t('debugFloorplanRecognition.inspectClose')}</Button>
            </div>
            {(() => {
              const parseId = (id: string) => {
                const m = id.match(/^(wall|door|entry_door|window|kitchen|door_center_line|entry_door_center_line|window_center_line)-(\d+)$/);
                if (!m) return null;
                return { category: m[1], index: Number(m[2]) };
              };
              const parsed = parseId(selectedObjectId);
              if (!parsed) return <p className="mt-2 text-xs text-muted-foreground">{t('debugFloorplanRecognition.inspectInvalidId')}</p>;
              const arr = (raw as unknown as Record<string, unknown>)[parsed.category] as unknown[] | undefined;
              const exists = Array.isArray(arr) && parsed.index < arr.length;
              const polygon = exists ? (arr as number[][][])[parsed.index] : null;
              const classifications = vlmAnalysis?.objectClassifications.filter((c) => c.objectId === selectedObjectId) ?? [];
              const openings = vlmAnalysis?.openings.filter((o) => o.objectId === selectedObjectId || o.hostWallIds.includes(selectedObjectId)) ?? [];
              const wallRels = vlmAnalysis?.wallRelationships.filter((r) => r.wallIds.includes(selectedObjectId)) ?? [];
              const roomRefs = vlmAnalysis?.rooms.filter((r) => {
                const walls = (r as unknown as { boundaryWalls?: string[]; boundaryObjects?: string[] }).boundaryWalls ?? (r as unknown as { boundaryObjects?: string[] }).boundaryObjects ?? [];
                const ops = (r as unknown as { openings?: string[] }).openings ?? [];
                return walls.includes(selectedObjectId) || ops.includes(selectedObjectId);
              }) ?? [];
              return (
                <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
                  <div>
                    <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.inspectType')}</span>
                    <span className="font-medium">{parsed.category}</span>
                    <span className="block mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.inspectRawPolygon')}</span>
                    {polygon ? (
                      <span className="font-mono text-xs break-all">{JSON.stringify(polygon.slice(0, 3))}{polygon.length > 3 ? ' …' : ''} ({polygon.length} points)</span>
                    ) : (
                      <span className="text-muted-foreground">{exists ? 'No polygon' : t('debugFloorplanRecognition.inspectNotFound')}</span>
                    )}
                    {polygon && <span className="block text-muted-foreground">{t('debugFloorplanRecognition.inspectRawAvailable')}</span>}
                  </div>
                  <div>
                    {classifications.length > 0 ? (
                      <>
                        <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.inspectVlmClassification')}</span>
                        {classifications.map((c, i) => (
                          <div key={i} className="mt-1">
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${c.classification === 'likely_false_positive' ? 'bg-pink-100 text-pink-700' : c.classification === 'suspicious' ? 'bg-amber-100 text-amber-700' : c.classification === 'valid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                              {c.classification}
                            </span>
                            <span className="ml-1">{Math.round(c.confidence * 100)}%</span>
                            {c.reason && <span className="ml-1 text-muted-foreground">· {c.reason}</span>}
                          </div>
                        ))}
                      </>
                    ) : vlmAnalysis ? (
                      <span className="text-muted-foreground">{t('debugFloorplanRecognition.inspectNoClassification')}</span>
                    ) : (
                      <span className="text-muted-foreground">{t('debugFloorplanRecognition.inspectRunVlmHint')}</span>
                    )}
                  </div>
                  <div>
                    <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.inspectRelationships')}</span>
                    {wallRels.length === 0 && openings.length === 0 ? (
                      <span className="text-muted-foreground">{t('debugFloorplanRecognition.inspectNoRelationships')}</span>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {wallRels.map((r, i) => {
                          const other = r.wallIds.filter((id) => id !== selectedObjectId);
                          return (
                            <li key={`wr-${i}`}>
                              <span className="font-medium">{r.relationship.replace(/_/g, ' ')} →</span>{' '}
                              {other.map((oid) => (
                                <button key={oid} type="button" onClick={() => setSelectedObjectId(oid)} className="rounded border bg-muted/30 px-1 py-0.5 text-xs hover:border-amber-400 hover:bg-amber-50">
                                  {oid}
                                </button>
                              ))}
                              <span className="ml-1 text-muted-foreground">{Math.round(r.confidence * 100)}%{r.reason ? ` · ${r.reason}` : ''}</span>
                            </li>
                          );
                        })}
                        {openings.map((o, i) => {
                          const isHost = o.hostWallIds.includes(selectedObjectId);
                          return (
                            <li key={`op-${i}`}>
                              {isHost ? (
                                <>
                                  <span className="font-medium">Host for {o.objectId}</span> → {o.relationship.replace(/_/g, ' ')} ({Math.round(o.confidence * 100)}%)
                                  <button type="button" onClick={() => setSelectedObjectId(o.objectId)} className="ml-1 rounded border bg-muted/30 px-1 py-0.5 text-xs hover:border-amber-400 hover:bg-amber-50">{o.objectId}</button>
                                </>
                              ) : (
                                <>
                                  <span className="font-medium">{o.objectId}</span> → host:{' '}
                                  {o.hostWallIds.map((wid) => (
                                    <button key={wid} type="button" onClick={() => setSelectedObjectId(wid)} className="rounded border bg-muted/30 px-1 py-0.5 text-xs hover:border-amber-400 hover:bg-amber-50">
                                      {wid}
                                    </button>
                                  ))}
                                  <span className="ml-1 text-muted-foreground">{o.relationship} · {Math.round(o.confidence * 100)}%{o.reason ? ` · ${o.reason}` : ''}</span>
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div>
                    <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.inspectRoomsRef')}</span>
                    {roomRefs.length === 0 ? (
                      <span className="text-muted-foreground">{t('debugFloorplanRecognition.inspectNoRooms')}</span>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {roomRefs.map((r, i) => (
                          <li key={i}>
                            <span className="font-medium">{r.id} · {r.type}</span> ({Math.round(r.confidence * 100)}%)
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setTopologyHighlightIds([selectedObjectId])}>{t('debugFloorplanRecognition.inspectHighlight')}</Button>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedObjectId(null)}>{t('debugFloorplanRecognition.inspectClear')}</Button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Primitive Details Panel */}
        {primitivesResult && selectedPrimitiveId && (() => {
          const primitive = primitivesResult.primitives.find((p) => p.primitiveId === selectedPrimitiveId);
          if (!primitive) return null;
          const rels = primitivesResult.relationships.filter((r) => r.a === selectedPrimitiveId || r.b === selectedPrimitiveId);
          const otherIdOf = (r: { a: string; b: string }) => (r.a === selectedPrimitiveId ? r.b : r.a);
          const relLabel = (type: string) => {
            switch (type) {
              case 'parallel': return t('geometryPrimitives.relParallel');
              case 'perpendicular': return t('geometryPrimitives.relPerpendicular');
              case 'same_axis': return t('geometryPrimitives.relSameAxis');
              case 'close_parallel': return t('geometryPrimitives.relCloseParallel');
              case 'endpoint_proximity': return t('geometryPrimitives.relEndpointProximity');
              case 'intersection': return t('geometryPrimitives.relIntersection');
              case 'overlap': return t('geometryPrimitives.relOverlap');
              case 'offset': return t('geometryPrimitives.relOffset');
              default: return type.replace(/_/g, ' ');
            }
          };
          const orientationLabel =
            primitive.orientation === 'horizontal'
              ? t('geometryPrimitives.orientationHorizontal')
              : primitive.orientation === 'vertical'
                ? t('geometryPrimitives.orientationVertical')
                : t('geometryPrimitives.orientationDiagonal');
          const qualityLabel =
            primitive.quality === 'high'
              ? t('geometryPrimitives.qualityHigh')
              : primitive.quality === 'medium'
                ? t('geometryPrimitives.qualityMedium')
                : t('geometryPrimitives.qualityLow');
          const thicknessLabel =
            primitive.estimatedThicknessPx !== null
              ? t('geometryPrimitives.detailThicknessReliable', { px: String(Math.round(primitive.estimatedThicknessPx)) })
              : primitive.thickness.reason === 'ambiguous_parallel_boundaries'
                ? `${t('geometryPrimitives.detailThicknessAmbiguous')} (${t('geometryPrimitives.thicknessReasonAmbiguous')})`
                : t('geometryPrimitives.detailThicknessNone');
          return (
            <div className="mt-6 rounded-xl border-2 border-teal-300 bg-card p-5">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <span className="inline-block size-3 rounded-sm" style={{ background: primitive.kind === 'corner' ? PRIMITIVE_COLORS.corner : PRIMITIVE_COLORS[primitive.orientation], opacity: primitive.uncertain ? 0.55 : 1 }} aria-hidden />
                  {t('geometryPrimitives.detailTitle')}: <span className="font-mono">{primitive.primitiveId}</span>
                </h3>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedObjectId(primitive.sourceObjectId)}>
                    {t('geometryPrimitives.detailParentRaw')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPrimitiveId(null)}>
                    {t('geometryPrimitives.detailClose')}
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t('geometryPrimitives.detailKind')}</span>
                  <span className="font-medium">{primitive.kind === 'run' ? t('geometryPrimitives.run') : t('geometryPrimitives.corner')} · {orientationLabel}</span>
                  <span className="mt-2 block text-[11px] uppercase tracking-wide text-muted-foreground">{t('geometryPrimitives.detailSource')}</span>
                  <span className="font-mono">{primitive.sourceObjectId} (polygon #{primitive.sourcePolygonIndex})</span>
                  <span className="mt-2 block text-[11px] uppercase tracking-wide text-muted-foreground">{t('geometryPrimitives.detailEndpoints')}</span>
                  <span className="font-mono">({Math.round(primitive.from.x)}, {Math.round(primitive.from.y)}) → ({Math.round(primitive.to.x)}, {Math.round(primitive.to.y)})</span>
                  {primitive.kind === 'run' && primitive.sourceVertexIndices.length > 0 && (
                    <>
                      <span className="mt-2 block text-[11px] uppercase tracking-wide text-muted-foreground">{t('geometryPrimitives.detailSourceVertices')}</span>
                      <span className="font-mono">[{primitive.sourceVertexIndices.join(', ')}]</span>
                    </>
                  )}
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t('geometryPrimitives.detailLength')}</span>
                  <span className="font-medium">{primitive.lengthPx}px</span>
                  <span className="mt-2 block text-[11px] uppercase tracking-wide text-muted-foreground">{t('geometryPrimitives.detailAngle')}</span>
                  <span className="font-medium">
                    {primitive.kind === 'corner' && primitive.vertexAngleDeg !== null
                      ? `${t('geometryPrimitives.detailVertexAngle')}: ${primitive.vertexAngleDeg.toFixed(1)}°`
                      : `${primitive.angleDeg.toFixed(1)}°`}
                  </span>
                  <span className="mt-2 block text-[11px] uppercase tracking-wide text-muted-foreground">{t('geometryPrimitives.detailOrientation')}</span>
                  <span className="font-medium">{orientationLabel}</span>
                  <span className="mt-2 block text-[11px] uppercase tracking-wide text-muted-foreground">{t('geometryPrimitives.detailBoundingBox')}</span>
                  <span className="font-mono">
                    ({Math.round(primitive.boundingBox.minX)}, {Math.round(primitive.boundingBox.minY)}) – ({Math.round(primitive.boundingBox.maxX)}, {Math.round(primitive.boundingBox.maxY)})
                  </span>
                  <span className="mt-2 block text-[11px] uppercase tracking-wide text-muted-foreground">{t('geometryPrimitives.detailQuality')}</span>
                  <span className={`font-medium ${primitive.quality === 'low' ? 'text-amber-600' : primitive.quality === 'high' ? 'text-green-700' : ''}`}>
                    {qualityLabel} · {t('geometryPrimitives.detailConfidence')}: {Math.round(primitive.confidence * 100)}%
                  </span>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t('geometryPrimitives.detailThickness')}</span>
                  <span className={`font-medium ${primitive.estimatedThicknessPx !== null ? 'text-green-700' : primitive.thickness.reason === 'ambiguous_parallel_boundaries' ? 'text-amber-600' : 'text-muted-foreground'}`}>
                    {thicknessLabel}
                  </span>
                  {primitive.thickness.partnerIds.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('geometryPrimitives.detailThicknessPartners')}</span>
                      {primitive.thickness.partnerIds.map((pid) => (
                        <button
                          key={pid}
                          type="button"
                          onClick={() => setSelectedPrimitiveId(pid)}
                          className="rounded border bg-muted/30 px-1.5 py-0.5 font-mono text-xs hover:border-teal-400 hover:bg-teal-50"
                        >
                          {pid}
                        </button>
                      ))}
                    </div>
                  )}
                  {primitive.straightnessPx !== null && (
                    <>
                      <span className="mt-2 block text-[11px] uppercase tracking-wide text-muted-foreground">{t('geometryPrimitives.detailStraightness')}</span>
                      <span className="font-mono">{primitive.straightnessPx}px</span>
                    </>
                  )}
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{t('geometryPrimitives.detailRelationships')}</span>
                  {rels.length === 0 ? (
                    <span className="text-muted-foreground">{t('geometryPrimitives.detailNoRelationships')}</span>
                  ) : (
                    <ul className="mt-1 max-h-64 space-y-1 overflow-auto">
                      {rels.map((r, i) => (
                        <li key={`rel-${i}`} className="flex items-center gap-1.5">
                          <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800">{relLabel(r.type)}</span>
                          <span className="font-mono text-xs">{r.value}{r.unit}</span>
                          <span className="text-muted-foreground">→</span>
                          <button
                            type="button"
                            onClick={() => setSelectedPrimitiveId(otherIdOf(r))}
                            className="rounded border bg-muted/30 px-1.5 py-0.5 font-mono text-xs hover:border-teal-400 hover:bg-teal-50"
                          >
                            {otherIdOf(r)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Annotated Recognition Debug Preview */}
        {raw && previewUrl && imageWidth ? (
          <div className="mt-8 rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t('debugFloorplanRecognition.annotatedTitle')}</h2>
              <Button variant="ghost" size="sm" onClick={() => setAnnotatedCollapsed((v) => !v)}>
                {annotatedCollapsed ? t('debugFloorplanRecognition.expand') : t('debugFloorplanRecognition.collapse')}
              </Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{t('debugFloorplanRecognition.annotatedIntro')}</p>
            {!annotatedCollapsed && (
              <div className="mt-4">
                {annotatedGenerating ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" /> {t('debugFloorplanRecognition.annotatedGenerating')}
                  </div>
                ) : annotatedError ? (
                  <p role="alert" className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{annotatedError}</p>
                ) : annotatedDataUrl ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.originalImage')}</h3>
                        <div className="overflow-hidden rounded-xl border">
                          <img src={previewUrl} alt={t('debugFloorplanRecognition.previewAlt')} className="h-auto w-full object-contain" />
                        </div>
                      </div>
                      <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('debugFloorplanRecognition.annotatedImage')}</h3>
                        <div className="overflow-hidden rounded-xl border">
                          <img src={annotatedDataUrl} alt={t('debugFloorplanRecognition.annotatedAlt')} className="h-auto w-full object-contain" />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = annotatedDataUrl;
                          a.download = `annotated-${Date.now()}.png`;
                          a.click();
                        }}
                      >
                        <Download className="size-3.5" /> {t('debugFloorplanRecognition.downloadAnnotated')}
                      </Button>
                      <span className="text-xs text-muted-foreground">{t('debugFloorplanRecognition.annotatedHint')}</span>
                    </div>
                    {annotatedDataUrl && <p className="mt-2 text-xs text-amber-600">{t('debugFloorplanRecognition.annotatedVerify')}</p>}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('debugFloorplanRecognition.annotatedEmpty')}</p>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* VLM Architectural Analysis Section */}
        <div className="mt-8 rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <Brain className="size-5 text-violet-600" aria-hidden />
            <h2 className="text-lg font-semibold">{t('debugFloorplanRecognition.vlmTitle')}</h2>
            <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700">POC</span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t('debugFloorplanRecognition.vlmIntro')}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" onClick={runVlmAnalysis} disabled={!raw || !file || vlmLoading || loading || annotatedGenerating || !annotatedDataUrl}>
              {vlmLoading ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" /> {t('debugFloorplanRecognition.analyzing')}
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> {t('debugFloorplanRecognition.analyzeWithVlm')}
                </>
              )}
            </Button>
            {!raw && <span className="text-xs text-muted-foreground">{t('debugFloorplanRecognition.vlmNeedRaw')}</span>}
            {raw && !annotatedDataUrl && !annotatedGenerating && <span className="text-xs text-amber-600">{t('debugFloorplanRecognition.vlmNeedAnnotated')}</span>}
            {annotatedGenerating && <span className="text-xs text-muted-foreground">{t('debugFloorplanRecognition.annotatedGenerating')}</span>}
            {vlmAnalysis && (
              <Button type="button" variant="outline" size="sm" onClick={exportVlm}>
                <Download className="size-3.5" /> {t('debugFloorplanRecognition.vlmExport')}
              </Button>
            )}
          </div>

          {/* VLM Inputs */}
          {raw && (
            <div className="mt-5 rounded-xl border bg-muted/20 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide">{t('debugFloorplanRecognition.vlmInputTitle')}</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border bg-card p-2">
                  <span className="block text-xs font-medium">{t('debugFloorplanRecognition.vlmInputOriginal')}</span>
                  {previewUrl ? <img src={previewUrl} alt={t('debugFloorplanRecognition.previewAlt')} className="mt-2 max-h-32 w-full rounded object-contain" /> : <span className="text-xs text-muted-foreground">{t('debugFloorplanRecognition.vlmNoImage')}</span>}
                  <span className="mt-1 block text-xs text-muted-foreground">{t('debugFloorplanRecognition.vlmInputOriginalHint')}</span>
                </div>
                <div className="rounded-lg border bg-card p-2">
                  <span className="block text-xs font-medium">{t('debugFloorplanRecognition.vlmInputAnnotated')}</span>
                  {annotatedDataUrl ? <img src={annotatedDataUrl} alt={t('debugFloorplanRecognition.annotatedAlt')} className="mt-2 max-h-32 w-full rounded object-contain" /> : <span className="text-xs text-muted-foreground">{annotatedGenerating ? t('debugFloorplanRecognition.annotatedGenerating') : t('debugFloorplanRecognition.vlmNoImage')}</span>}
                  <span className="mt-1 block text-xs text-muted-foreground">{t('debugFloorplanRecognition.vlmInputAnnotatedHint')}</span>
                </div>
                <div className="rounded-lg border bg-card p-2">
                  <span className="block text-xs font-medium">{t('debugFloorplanRecognition.vlmInputJson')}</span>
                  <span className="mt-2 block text-xs text-muted-foreground">{t('debugFloorplanRecognition.vlmInputJsonHint', { walls: String(raw.wall.length), windows: String(raw.window.length), doors: String(raw.door.length) })}</span>
                  <pre className="mt-2 max-h-28 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify({ wall: raw.wall.length, door: raw.door.length, window: raw.window.length, kitchen: raw.kitchen.length }, null, 2)}</pre>
                </div>
              </div>
            </div>
          )}

          {/* Status */}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${vlmAnalysis ? 'bg-green-50 text-green-700' : vlmLoading ? 'bg-amber-50 text-amber-700' : vlmError ? 'bg-red-50 text-red-700' : 'bg-muted text-muted-foreground'}`}>
              <span className={`h-2 w-2 rounded-full ${vlmAnalysis ? 'bg-green-500' : vlmLoading ? 'bg-amber-500 animate-pulse' : vlmError ? 'bg-red-500' : 'bg-gray-400'}`} aria-hidden />
              {vlmStatus}
            </span>
            {vlmModel && <span className="text-muted-foreground">{t('debugFloorplanRecognition.vlmModel', { model: vlmModel })}</span>}
            {vlmDurationMs !== null && <span className="text-muted-foreground">{t('debugFloorplanRecognition.vlmDuration', { ms: String(vlmDurationMs) })}</span>}
            {vlmWarnings.length > 0 && <span className="text-amber-600">{t('debugFloorplanRecognition.vlmWarnings', { warnings: vlmWarnings.join(', ') })}</span>}
          </div>

          {vlmError && (
            <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {vlmError}
            </p>
          )}

          {vlmRawResponse != null && vlmError ? (
            <div className="mt-3 rounded-lg border bg-muted/20 p-3">
              <h4 className="text-xs font-semibold">{t('debugFloorplanRecognition.vlmRawResponse')}</h4>
              <pre className="mt-2 max-h-64 overflow-auto text-xs">{typeof vlmRawResponse === 'string' ? vlmRawResponse : JSON.stringify(vlmRawResponse, null, 2)}</pre>
            </div>
          ) : null}

          {/* VLM layer toggles */}
          {vlmAnalysis && (
            <div className="mt-5 rounded-xl border bg-muted/20 p-4">
              <div className="flex flex-wrap gap-4">
                {vlmLayerDefs.map(({ key, label, color }) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={vlmVisibility[key]}
                      onCheckedChange={(v) => setVlmVisibility((prev) => ({ ...prev, [key]: Boolean(v) }))}
                    />
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} aria-hidden />
                    {label}
                  </label>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-4 border-t pt-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={showVlmIds} onCheckedChange={(v) => setShowVlmIds(Boolean(v))} />
                  {t('debugFloorplanRecognition.vlmShowIds')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={showConfidence} onCheckedChange={(v) => setShowConfidence(Boolean(v))} />
                  {t('debugFloorplanRecognition.vlmShowConfidence')}
                </label>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-muted-foreground">Mode:</span>
                  <Button type="button" variant={vlmMode === 'raw+vlm+constraints' ? 'default' : 'outline'} size="sm" onClick={() => setVlmMode('raw+vlm+constraints')}>
                    {t('debugFloorplanRecognition.vlmModeRawVlmConstraints')}
                  </Button>
                  <Button type="button" variant={vlmMode === 'raw+vlm' ? 'default' : 'outline'} size="sm" onClick={() => setVlmMode('raw+vlm')}>
                    {t('debugFloorplanRecognition.vlmModeRawVlm')}
                  </Button>
                  <Button type="button" variant={vlmMode === 'topology-only' ? 'default' : 'outline'} size="sm" onClick={() => setVlmMode('topology-only')}>
                    {t('debugFloorplanRecognition.vlmModeTopologyOnly')}
                  </Button>
                  <Button type="button" variant={vlmMode === 'geometry-only' ? 'default' : 'outline'} size="sm" onClick={() => setVlmMode('geometry-only')}>
                    {t('debugFloorplanRecognition.vlmModeGeometryOnly')}
                  </Button>
                </div>
              </div>
              {/* Geometry Constraints toggles */}
              <div className="mt-4 flex flex-wrap gap-4 border-t pt-4">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={showConstraints} onCheckedChange={(v) => setShowConstraints(Boolean(v))} />
                  {t('debugFloorplanRecognition.constraintsShowLayer')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={constraintsVisibility.mergeWalls} onCheckedChange={(v) => setConstraintsVisibility((p) => ({ ...p, mergeWalls: Boolean(v) }))} />
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: GEOMETRY_CONSTRAINT_COLORS.merge_walls }} aria-hidden />
                  {t('debugFloorplanRecognition.constraintsMergeWalls')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={constraintsVisibility.continueWall} onCheckedChange={(v) => setConstraintsVisibility((p) => ({ ...p, continueWall: Boolean(v) }))} />
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: GEOMETRY_CONSTRAINT_COLORS.continue_wall }} aria-hidden />
                  {t('debugFloorplanRecognition.constraintsContinueWall')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={constraintsVisibility.extendWall} onCheckedChange={(v) => setConstraintsVisibility((p) => ({ ...p, extendWall: Boolean(v) }))} />
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: GEOMETRY_CONSTRAINT_COLORS.extend_wall }} aria-hidden />
                  {t('debugFloorplanRecognition.constraintsExtendWall')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={constraintsVisibility.removeObject} onCheckedChange={(v) => setConstraintsVisibility((p) => ({ ...p, removeObject: Boolean(v) }))} />
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: GEOMETRY_CONSTRAINT_COLORS.remove_object }} aria-hidden />
                  {t('debugFloorplanRecognition.constraintsRemoveObject')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={constraintsVisibility.parallelWalls} onCheckedChange={(v) => setConstraintsVisibility((p) => ({ ...p, parallelWalls: Boolean(v) }))} />
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: GEOMETRY_CONSTRAINT_COLORS.parallel_walls }} aria-hidden />
                  {t('debugFloorplanRecognition.constraintsParallelWalls')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={constraintsVisibility.perpendicularWalls} onCheckedChange={(v) => setConstraintsVisibility((p) => ({ ...p, perpendicularWalls: Boolean(v) }))} />
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: GEOMETRY_CONSTRAINT_COLORS.perpendicular_walls }} aria-hidden />
                  {t('debugFloorplanRecognition.constraintsPerpendicularWalls')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={constraintsVisibility.sameAxis} onCheckedChange={(v) => setConstraintsVisibility((p) => ({ ...p, sameAxis: Boolean(v) }))} />
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: GEOMETRY_CONSTRAINT_COLORS.same_axis }} aria-hidden />
                  {t('debugFloorplanRecognition.constraintsSameAxis')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={constraintsVisibility.wallCorner} onCheckedChange={(v) => setConstraintsVisibility((p) => ({ ...p, wallCorner: Boolean(v) }))} />
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: GEOMETRY_CONSTRAINT_COLORS.wall_corner }} aria-hidden />
                  {t('debugFloorplanRecognition.constraintsWallCorner')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={constraintsVisibility.wallTJunction} onCheckedChange={(v) => setConstraintsVisibility((p) => ({ ...p, wallTJunction: Boolean(v) }))} />
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: GEOMETRY_CONSTRAINT_COLORS.wall_t_junction }} aria-hidden />
                  {t('debugFloorplanRecognition.constraintsWallTJunction')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={constraintsVisibility.openingInterruptsWall} onCheckedChange={(v) => setConstraintsVisibility((p) => ({ ...p, openingInterruptsWall: Boolean(v) }))} />
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: GEOMETRY_CONSTRAINT_COLORS.opening_interrupts_wall }} aria-hidden />
                  {t('debugFloorplanRecognition.constraintsOpeningInterruptsWall')}
                </label>
              </div>
            </div>
          )}

          {!vlmAnalysis && !vlmLoading && !vlmError ? (
            <p className="mt-4 text-sm text-muted-foreground">{t('debugFloorplanRecognition.vlmNoAnalysis')}</p>
          ) : null}

          {/* Geometry Constraints */}
          {vlmAnalysis && (
            <div className="mt-5 rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-purple-600" aria-hidden />
                <h3 className="text-sm font-semibold">{t('debugFloorplanRecognition.constraintsTitle')}</h3>
                <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">POC</span>
                <span className="ml-auto text-xs text-muted-foreground">{t('debugFloorplanRecognition.constraintsCount', { count: String((vlmAnalysis.geometryConstraints ?? []).length) })}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.constraintsIntro')}</p>

              {/* Constraint summary */}
              {(() => {
                const summary = summarizeConstraints(vlmAnalysis.geometryConstraints ?? []);
                const chips: Array<{ label: string; value: number }> = [
                  { label: t('debugFloorplanRecognition.constraintsSumMerge'), value: summary.mergeWalls },
                  { label: t('debugFloorplanRecognition.constraintsSumContinue'), value: summary.continueWall },
                  { label: t('debugFloorplanRecognition.constraintsSumExtend'), value: summary.extendWall },
                  { label: t('debugFloorplanRecognition.constraintsSumRemove'), value: summary.removeObject },
                  { label: t('debugFloorplanRecognition.constraintsSumParallelPerp'), value: summary.parallelPerpendicular },
                  { label: t('debugFloorplanRecognition.constraintsSumCorners'), value: summary.corners },
                  { label: t('debugFloorplanRecognition.constraintsSumTJunctions'), value: summary.tJunctions },
                  { label: t('debugFloorplanRecognition.constraintsSumOpening'), value: summary.openingInterruptions },
                ];
                return (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {chips.map((chip) => (
                      <span key={chip.label} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${chip.value > 0 ? 'border-purple-200 bg-purple-50 text-purple-800' : 'border-muted-foreground/20 bg-muted/30 text-muted-foreground'}`}>
                        <span className="font-semibold">{chip.value}</span>
                        {chip.label}
                      </span>
                    ))}
                  </div>
                );
              })()}

              {/* Selected constraint details panel */}
              {selectedConstraintId && (() => {
                const sel = (vlmAnalysis.geometryConstraints ?? []).find((c) => constraintKey(c) === selectedConstraintId);
                if (!sel) return null;
                const col = GEOMETRY_CONSTRAINT_COLORS[sel.type];
                const directional = sel.type === 'continue_wall' || sel.type === 'extend_wall' || sel.type === 'opening_interrupts_wall';
                return (
                  <div className="mt-3 rounded-lg border-2 bg-white p-3" style={{ borderColor: col }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded px-2 py-0.5 text-xs font-semibold text-white" style={{ background: col }}>
                          {geometryConstraintLabel(sel.type)}
                        </span>
                        <span className="font-mono text-xs">{sel.objectIds.join(directional ? ' → ' : ' + ')}</span>
                        <span className={`text-xs font-semibold ${isLowConfidenceConstraint(sel.confidence) ? 'text-amber-600' : 'text-green-600'}`}>
                          {t('debugFloorplanRecognition.constraintsConfidence', { value: String(Math.round(sel.confidence * 100)) })}
                        </span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedConstraintId(null)}>
                        {t('debugFloorplanRecognition.constraintsDetailsClose')}
                      </Button>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-muted-foreground">{t('debugFloorplanRecognition.constraintsDetailsType')}: <span className="font-mono">{sel.type}</span></p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">{t('debugFloorplanRecognition.constraintsDetailsObjects')}: <span className="font-mono">{sel.objectIds.join(', ')}</span></p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">{t('debugFloorplanRecognition.constraintsDetailsConfidence')}: <span className="font-mono">{sel.confidence.toFixed(3)}</span>{isLowConfidenceConstraint(sel.confidence) && <span className="ml-1 text-amber-600">{t('debugFloorplanRecognition.constraintsLowConfidenceHint')}</span>}</p>
                    <p className="mt-1 text-xs leading-5 text-foreground">{t('debugFloorplanRecognition.constraintsDetailsReason')}: <span className="italic">{sel.reason ?? t('debugFloorplanRecognition.constraintsNoReason')}</span></p>
                  </div>
                );
              })()}

              {(vlmAnalysis.geometryConstraints ?? []).length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">{t('debugFloorplanRecognition.constraintsEmpty')}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {sortConstraintsByConfidence(vlmAnalysis.geometryConstraints ?? []).map((c: GeometryConstraint) => {
                    const col = GEOMETRY_CONSTRAINT_COLORS[c.type];
                    const isLow = isLowConfidenceConstraint(c.confidence);
                    const directional = c.type === 'continue_wall' || c.type === 'extend_wall' || c.type === 'opening_interrupts_wall';
                    const isSelected = selectedConstraintId === constraintKey(c);
                    return (
                      <li key={constraintKey(c)} className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${isSelected ? 'border-purple-400 bg-purple-50/50' : 'bg-muted/20 hover:border-purple-300'}`}>
                        <span className={`mt-0.5 text-sm font-bold ${isLow ? 'text-amber-600' : 'text-green-600'}`}>{isLow ? '⚠' : '✓'}</span>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded px-2 py-0.5 text-xs font-semibold text-white" style={{ background: col }}>
                              {geometryConstraintLabel(c.type)}
                            </span>
                            <span className="font-mono text-xs">
                              {directional ? `${c.objectIds[0]} → ${c.objectIds.slice(1).join(' → ')}` : c.objectIds.join(' + ')}
                            </span>
                            <span className={`text-xs ${isLow ? 'text-amber-600' : 'text-green-600'}`}>
                              {t('debugFloorplanRecognition.constraintsConfidence', { value: String(Math.round(c.confidence * 100)) })}
                            </span>
                            {isLow && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{t('debugFloorplanRecognition.constraintsLowConfidenceBadge')}</span>}
                            <div className="ml-auto flex gap-1.5">
                              <Button type="button" variant="outline" size="sm" onClick={() => { setTopologyHighlightIds(c.objectIds); }}>{t('debugFloorplanRecognition.geometryHighlight')}</Button>
                              <Button type="button" variant={isSelected ? 'default' : 'outline'} size="sm" onClick={() => setSelectedConstraintId(isSelected ? null : constraintKey(c))}>
                                {t('debugFloorplanRecognition.constraintsDetails')}
                              </Button>
                            </div>
                          </div>
                          {c.reason && <p className="mt-1 text-xs text-muted-foreground">&quot;{c.reason}&quot;</p>}
                          {isLow && <p className="mt-1 text-xs text-amber-600">{t('debugFloorplanRecognition.constraintsLowConfidenceHint')}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Geometry Relationships — VLM geometry interpretation POC */}
          {vlmAnalysis && (
            <div className="mt-5 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t('debugFloorplanRecognition.geometryRelationshipsTitle')}</h3>
                <span className="text-xs text-muted-foreground">{t('debugFloorplanRecognition.geometryRelationshipsCount', { count: String((vlmAnalysis.geometryRelationships ?? []).length) })}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.geometryRelationshipsIntro')}</p>
              {(vlmAnalysis.geometryRelationships ?? []).length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">{t('debugFloorplanRecognition.geometryRelationshipsEmpty')}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {sortGeometryRelationshipsByConfidence(vlmAnalysis.geometryRelationships ?? []).map((r: GeometryRelationship) => {
                    const directional = r.type === 'wall_continuation' || r.type === 'opening_interrupts_wall';
                    const prims = directional ? r.sourcePrimitiveIds.join(' → ') : r.sourcePrimitiveIds.join(' + ');
                    return (
                      <li key={geometryRelationshipKey(r)} className="rounded-lg border bg-muted/20 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-teal-600 px-2 py-0.5 font-mono text-xs font-semibold text-white">
                            {r.type}
                          </span>
                          <span className="font-mono text-xs">{prims}</span>
                          <span className="text-xs text-muted-foreground">
                            {t('debugFloorplanRecognition.constraintsConfidence', { value: String(Math.round(r.confidence * 100)) })}
                          </span>
                        </div>
                        {r.sourceObjectIds.length > 0 && (
                          <p className="mt-1 font-mono text-xs text-muted-foreground">{r.sourceObjectIds.join(', ')}</p>
                        )}
                        {r.reason && <p className="mt-1 text-xs text-muted-foreground">&quot;{r.reason}&quot;</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Architectural Topology — the VLM → topology contract */}
          {vlmAnalysis && (
            <div className="mt-5 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Grid2x2 className="size-4 text-amber-600" aria-hidden /> {t('debugFloorplanRecognition.topologyTitle')}
                </h3>
                {topologyHighlightIds.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setTopologyHighlightIds([])}>
                    {t('debugFloorplanRecognition.topologyClear')}
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.topologyIntro')}</p>
              <p className="mt-1 text-xs text-amber-700">{t('debugFloorplanRecognition.topologyClickHint')}</p>

              {!hasTopology ? (
                <p className="mt-3 text-xs text-muted-foreground">{t('debugFloorplanRecognition.topologyEmpty')}</p>
              ) : (
                <div className="mt-3 grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-green-700">{t('debugFloorplanRecognition.topologyContinuousWalls')}</h4>
                    {topology.continuousWalls.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.topologyNone')}</p>
                    ) : (
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {topology.continuousWalls.map((group, i) => (
                          <li key={`cw-${i}`}>{topologyItem(group)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-orange-700">{t('debugFloorplanRecognition.topologyCorners')}</h4>
                    {topology.corners.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.topologyNone')}</p>
                    ) : (
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {topology.corners.map((pair, i) => (
                          <li key={`cn-${i}`}>{topologyItem(pair)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-700">{t('debugFloorplanRecognition.topologyTJunctions')}</h4>
                    {topology.tJunctions.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.topologyNone')}</p>
                    ) : (
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {topology.tJunctions.map((pair, i) => (
                          <li key={`tj-${i}`}>{topologyItem(pair)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-pink-700">{t('debugFloorplanRecognition.topologyFalsePositives')}</h4>
                    {summaryFalsePositives.length === 0 && falsePositiveObjects.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.topologyNone')}</p>
                    ) : (
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {summaryFalsePositives.map((id, i) => (
                          <li key={`fp-${i}`}>{topologyIdChip(id)}</li>
                        ))}
                        {falsePositiveObjects
                          .filter((c) => !summaryFalsePositives.includes(c.objectId))
                          .map((c, i) => (
                            <li key={`fp-cls-${i}`}>{topologyIdChip(c.objectId)}</li>
                          ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700">{t('debugFloorplanRecognition.topologySuspicious')}</h4>
                    {suspiciousObjects.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.topologyNone')}</p>
                    ) : (
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {suspiciousObjects.map((c, i) => (
                          <li key={`sp-${i}`}>
                            <span className="inline-flex items-center gap-1">
                              {topologyIdChip(c.objectId)}
                              <span className="text-[10px] text-muted-foreground">{Math.round(c.confidence * 100)}%</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{t('debugFloorplanRecognition.topologyUncertain')}</h4>
                    {uncertainObjects.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.topologyNone')}</p>
                    ) : (
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {uncertainObjects.map((c, i) => (
                          <li key={`uc-${i}`}>{topologyIdChip(c.objectId)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {validObjects.length > 0 && (
                    <div className="md:col-span-2 lg:col-span-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-green-800">{t('debugFloorplanRecognition.topologyValid')}</h4>
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {validObjects.map((c, i) => (
                          <li key={`vl-${i}`}>{topologyIdChip(c.objectId)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Reasoning panel */}
          {vlmAnalysis && (
            <div className="mt-5 rounded-xl border bg-violet-50/40">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className="size-4 text-violet-600" /> {t('debugFloorplanRecognition.vlmFindings')}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setVlmFindingsCollapsed((v) => !v)}>
                  {vlmFindingsCollapsed ? t('debugFloorplanRecognition.expand') : t('debugFloorplanRecognition.collapse')}
                </Button>
              </div>
              {!vlmFindingsCollapsed && (
                <div className="grid gap-4 p-4 text-sm md:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-700">{t('debugFloorplanRecognition.vlmFindingsWallContinuity')}</h4>
                    {vlmAnalysis.wallRelationships.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.vlmNoFindings')}</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {vlmAnalysis.wallRelationships.map((r, i) => (
                          <li key={i} className="text-xs leading-5">
                            <span className="font-medium">{r.wallIds.join(' + ')}</span> → {r.relationship.replace(/_/g, ' ')} ({Math.round(r.confidence * 100)}%)
                            {r.reason && <span className="text-muted-foreground"> · {r.reason}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-700">{t('debugFloorplanRecognition.vlmFindingsOpenings')}</h4>
                    {vlmAnalysis.openings.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.vlmNoFindings')}</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {vlmAnalysis.openings.map((o, i) => (
                          <li key={i} className="text-xs leading-5">
                            <span className="font-medium">{o.objectId}</span> → {o.hostWallIds.join('/')} ({Math.round(o.confidence * 100)}%)
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-700">{t('debugFloorplanRecognition.vlmFindingsClassifications')}</h4>
                    {vlmAnalysis.objectClassifications.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.vlmNoFindings')}</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {vlmAnalysis.objectClassifications.map((a, i) => (
                          <li key={i} className="text-xs leading-5">
                            <span className="font-medium">{a.objectId}</span> → {a.classification.replace(/_/g, ' ')} ({Math.round(a.confidence * 100)}%)
                            {a.reason && <span className="text-muted-foreground"> · {a.reason}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-700">{t('debugFloorplanRecognition.vlmFindingsRooms')}</h4>
                    {vlmAnalysis.rooms.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.vlmNoFindings')}</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {vlmAnalysis.rooms.map((r, i) => {
                          const walls = (r as unknown as { boundaryWalls?: string[]; boundaryObjects?: string[] }).boundaryWalls ?? (r as unknown as { boundaryObjects?: string[] }).boundaryObjects ?? [];
                          const openings = (r as unknown as { openings?: string[] }).openings ?? [];
                          return (
                            <li key={i} className="text-xs leading-5">
                              <span className="font-medium">{r.id} · {r.type}</span> ({Math.round(r.confidence * 100)}%) — {t('debugFloorplanRecognition.vlmRoomWalls', { walls: walls.join(', ') })}
                              {openings.length > 0 && <span className="text-muted-foreground"> · {t('debugFloorplanRecognition.vlmRoomOpenings', { openings: openings.join(', ') })}</span>}
                              {r.reason && <span className="text-muted-foreground"> · {r.reason}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VLM Grounding */}
          {vlmAnalysis && (
            <div className="mt-5 rounded-xl border bg-white p-4">
              <h3 className="text-sm font-semibold">{t('debugFloorplanRecognition.vlmGroundingTitle')}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t('debugFloorplanRecognition.vlmGroundingIntro')}</p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="text-xs font-semibold text-violet-700">{t('debugFloorplanRecognition.vlmGroundingWalls')}</h4>
                  {vlmAnalysis.wallRelationships.length === 0 ? <p className="text-xs text-muted-foreground">{t('debugFloorplanRecognition.vlmNoFindings')}</p> : (
                    <ul className="mt-1 space-y-1">
                      {vlmAnalysis.wallRelationships.map((r, i) => (
                        <li key={i} className="text-xs leading-5">
                          <span className="font-medium">{r.wallIds.join(' → ')}</span>
                          <span className="ml-1 rounded bg-green-50 px-1 py-0.5 text-xs">{r.relationship.replace(/_/g, ' ')}</span>
                          <span className="ml-1 text-muted-foreground">{t('debugFloorplanRecognition.vlmGroundingConfidence', { value: String(Math.round(r.confidence * 100)) })}</span>
                          {r.relationship === 'uncertain' && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-amber-700">{t('debugFloorplanRecognition.vlmUncertain')}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-violet-700">{t('debugFloorplanRecognition.vlmGroundingOpenings')}</h4>
                  {vlmAnalysis.openings.length === 0 ? <p className="text-xs text-muted-foreground">{t('debugFloorplanRecognition.vlmNoFindings')}</p> : (
                    <ul className="mt-1 space-y-1">
                      {vlmAnalysis.openings.map((o, i) => (
                        <li key={i} className="text-xs leading-5">
                          <span className="font-medium">{o.objectId} → {o.hostWallIds.join(' + ')}</span>
                          <span className="ml-1 text-muted-foreground">{o.relationship.replace(/_/g, ' ')} · {t('debugFloorplanRecognition.vlmGroundingConfidence', { value: String(Math.round(o.confidence * 100)) })}</span>
                          {o.relationship === 'uncertain' && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-amber-700">{t('debugFloorplanRecognition.vlmUncertain')}</span>}
                          {o.reason && <span className="ml-1 text-muted-foreground">· {o.reason}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {vlmWarnings.length > 0 && (
                  <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                    <span className="text-xs font-semibold text-amber-700">{t('debugFloorplanRecognition.vlmWarnings', { warnings: '' }).replace(': ', '')}:</span>
                    <ul className="mt-1 list-disc pl-5 text-xs text-amber-700">
                      {vlmWarnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                    <p className="mt-1 text-xs text-amber-600">{t('debugFloorplanRecognition.vlmInvalidIdHint')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VLM JSON */}
          {vlmAnalysis && (
            <div className="mt-6 rounded-xl border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h3 className="text-sm font-semibold">{t('debugFloorplanRecognition.vlmJson')}</h3>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(JSON.stringify(vlmAnalysis, null, 2));
                      setVlmCopied(true);
                      setTimeout(() => setVlmCopied(false), 1500);
                    }}
                  >
                    {vlmCopied ? <Check className="size-3" /> : <Copy className="size-3" />} {vlmCopied ? t('debugFloorplanRecognition.copied') : t('debugFloorplanRecognition.copyJson')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setVlmJsonCollapsed((v) => !v)}>
                    {vlmJsonCollapsed ? t('debugFloorplanRecognition.expand') : t('debugFloorplanRecognition.collapse')}
                  </Button>
                </div>
              </div>
              {!vlmJsonCollapsed && (
                <pre className="max-h-[600px] overflow-auto bg-muted/20 p-4 text-xs">
                  <code>{JSON.stringify(vlmAnalysis, null, 2)}</code>
                </pre>
              )}
            </div>
          )}
        </div>

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

        {/* Geometry Primitives JSON */}
        {primitivesResult && raw && (
          <div className="mt-6 rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-semibold">{t('geometryPrimitives.jsonTitle')}</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const payload = {
                      generatedAt: new Date().toISOString(),
                      imageSize: { width: imageWidth, height: imageHeight },
                      thresholds: primitivesResult.thresholds,
                      summary: primitivesResult.summary,
                      primitives: primitivesResult.primitives,
                      relationships: primitivesResult.relationships,
                    };
                    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                    setPrimitivesCopied(true);
                    setTimeout(() => setPrimitivesCopied(false), 1500);
                  }}
                >
                  {primitivesCopied ? <Check className="size-3" /> : <Copy className="size-3" />} {primitivesCopied ? t('debugFloorplanRecognition.copied') : t('debugFloorplanRecognition.copyJson')}
                </Button>
                <Button variant="outline" size="sm" onClick={exportPrimitives}>
                  <Download className="size-3.5" /> {t('geometryPrimitives.export')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPrimitivesJsonCollapsed((v) => !v)}>
                  {primitivesJsonCollapsed ? t('debugFloorplanRecognition.expand') : t('debugFloorplanRecognition.collapse')}
                </Button>
              </div>
            </div>
            {!primitivesJsonCollapsed && (
              <pre className="max-h-[600px] overflow-auto bg-muted/20 p-4 text-xs">
                <code>{JSON.stringify(primitivesResult, null, 2)}</code>
              </pre>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
