/**
 * Bounded concurrency for independent work items (for example OCR + AI
 * analysis of multiple uploaded documents).
 *
 * The architecture intentionally avoids background jobs: this helper keeps the
 * expensive work parallel up to a small limit while preserving the input order
 * of the results. Per-item failures are isolated in the sense that a failing
 * item never cancels the remaining items — the mapper itself must catch
 * per-item errors (as the document pipeline does) so the batch continues.
 */

/**
 * Maximum number of document analyses running at the same time. Kept small so
 * OCR/AI provider rate limits stay respected; configurable via the
 * DOCUMENT_ANALYSIS_CONCURRENCY environment variable.
 */
export const DOCUMENT_ANALYSIS_CONCURRENCY = Math.max(
  1,
  Number(process.env.DOCUMENT_ANALYSIS_CONCURRENCY) || 3,
);

/**
 * Runs `mapper` over `items` with at most `limit` concurrent invocations.
 * Results are returned in the original item order, independent of completion
 * order. An empty input performs no work at all.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  };
  const workers = Array.from(
    { length: Math.max(0, Math.min(limit, items.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}