import { NextRequest, NextResponse } from 'next/server';
import { fetchRawGeometry } from '@/lib/geometry/ai/ai-service';
import {
  fusedResultToVistaGeometry,
  normalizedResultToVistaGeometry,
  rawResultToVistaGeometry,
  recoveredResultToVistaGeometry,
} from '@/lib/geometry/ai/geometry-adapter';

export const runtime = 'nodejs';

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Proxy for the local geometry-ai Python service.
 *
 * Receives the uploaded floor plan, runs the raw model extraction plus the
 * deterministic Phase 3 normalization, and returns *two* `VistaGeometry`
 * variants (raw and normalized) plus display metadata. When the service also
 * ran the Phase 6 semantic fusion (a validated VLM semantic document was
 * available), a third *fused* `VistaGeometry` variant, a Phase 7 *recovered*
 * variant and the semantic/fusion/recovery debug surfaces are included. The
 * frontend never sees model-specific structures.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid-form' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing-file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'too-large' }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const raw = await fetchRawGeometry(buffer, file.type);
    const rawGeometry = rawResultToVistaGeometry(raw);
    const geometry = normalizedResultToVistaGeometry(raw);
    const fusedGeometry = fusedResultToVistaGeometry(raw);
    const recoveredGeometry = recoveredResultToVistaGeometry(raw);
    return NextResponse.json({
      geometry: recoveredGeometry ?? geometry,
      rawGeometry,
      fusedGeometry,
      recoveredGeometry,
      meta: {
        modelId: raw.model.id,
        epoch: raw.model.epoch,
        license: raw.model.license,
        inferenceMs: raw.timing_ms?.inference ?? null,
      },
      debug: {
        candidates: raw.normalized.candidates ?? null,
        refinementProvider: raw.normalized.refinement?.provider ?? null,
        semantic: raw.semantic ?? null,
        fused: raw.fused ?? null,
        recovered: raw.recovered ?? null,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'GeometryAiUnreachableError') {
      return NextResponse.json({ error: 'service-unreachable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'extract-failed' }, { status: 422 });
  }
}