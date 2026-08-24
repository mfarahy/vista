/**
 * A minimal snapshot of a persisted document after a pipeline stage. Only the
 * fields the handler needs are typed; the rest is passed through.
 */
export interface ProcessorDocumentResult {
  id: string;
  status: string;
  [key: string]: unknown;
}

export interface ProcessorStepResult {
  record: ProcessorDocumentResult;
}

/**
 * Client used by the document-processing handler to invoke the per-stage
 * document pipeline. Kept behind an interface so handlers can be unit-tested
 * with a fake and the transport (currently an HTTP call into expose-service)
 * can be swapped later (gRPC, NATS request/reply, …).
 */
export interface DocumentProcessingClient {
  /** Runs the OCR stage for a document. */
  ocr(documentId: string): Promise<ProcessorStepResult>;
  /** Runs the AI understanding stage for a document (after OCR). */
  understand(documentId: string): Promise<ProcessorStepResult>;
}

/** HTTP client that calls expose-service's internal `/api/internal` endpoints. */
export function createHttpDocumentProcessingClient(exposeServiceUrl: string): DocumentProcessingClient {
  const base = exposeServiceUrl.replace(/\/$/, '');

  async function call(step: 'ocr' | 'understand', documentId: string): Promise<ProcessorStepResult> {
    const url = `${base}/api/internal/documents/${encodeURIComponent(documentId)}/${step}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`document-processing ${step} failed for ${documentId}: HTTP ${response.status}`);
    }
    const body = (await response.json().catch(() => ({}))) as Partial<ProcessorStepResult>;
    if (!body.record) {
      throw new Error(`document-processing ${step} returned no record for ${documentId}`);
    }
    return body as ProcessorStepResult;
  }

  return {
    ocr: (documentId) => call('ocr', documentId),
    understand: (documentId) => call('understand', documentId),
  };
}
