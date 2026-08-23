import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DOCUMENT_ANALYSIS_CONCURRENCY, mapWithConcurrency } from './concurrency.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('mapWithConcurrency', () => {
  it('processes items in parallel up to the configured limit', async () => {
    const running = new Set<number>();
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (item) => {
      running.add(item);
      peak = Math.max(peak, running.size);
      await delay(20);
      running.delete(item);
      return item * 10;
    });
    assert.deepEqual(results, [10, 20, 30, 40, 50, 60]);
    assert.equal(peak, 3, 'at most 3 analyses run simultaneously');
    assert.ok(peak >= 2, 'analyses actually overlapped');
  });

  it('never exceeds a limit of 1 (sequential behavior)', async () => {
    const running = new Set<number>();
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4], 1, async (item) => {
      running.add(item);
      peak = Math.max(peak, running.size);
      await delay(10);
      running.delete(item);
    });
    assert.equal(peak, 1);
  });

  it('isolates failures: a failing item does not cancel the others', async () => {
    const completed: number[] = [];
    await assert.rejects(
      mapWithConcurrency([1, 2, 3, 4], 4, async (item) => {
        if (item === 2) throw new Error('boom');
        await delay(5);
        completed.push(item);
        return `ok-${item}`;
      }),
      /boom/,
    );
    for (let attempt = 0; attempt < 100 && completed.length < 3; attempt += 1) {
      await delay(5);
    }
    assert.deepEqual(completed.sort(), [1, 3, 4], 'other items still complete');
  });

  it('preserves the original upload order even when completion order differs', async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (item) => {
      await delay(item === 1 ? 60 : 5);
      return item;
    });
    assert.deepEqual(results, [1, 2, 3, 4], 'results follow the input order');
  });

  it('performs no work for an empty input', async () => {
    let calls = 0;
    const results = await mapWithConcurrency([], 3, async () => {
      calls += 1;
      return 1;
    });
    assert.deepEqual(results, []);
    assert.equal(calls, 0);
  });

  it('behaves like a sequential map for a single item', async () => {
    const results = await mapWithConcurrency(['only'], 3, async (item) => item.toUpperCase());
    assert.deepEqual(results, ['ONLY']);
  });

  it('uses a sane default concurrency limit', () => {
    assert.ok(DOCUMENT_ANALYSIS_CONCURRENCY >= 1);
    assert.ok(DOCUMENT_ANALYSIS_CONCURRENCY <= 3, 'default stays small for provider limits');
  });
});