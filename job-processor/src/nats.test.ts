import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Writable } from 'node:stream';
import { pino, type Logger } from 'pino';
import { connectNats, retryDelayMs } from './nats.js';

/** A pino logger backed by a collecting stream for asserting on log output. */
function captureLogger(): { log: Logger; messages: string[] } {
  const messages: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      try {
        const line = JSON.parse(chunk.toString()) as { level: number; msg: string };
        const level = line.level >= 50 ? 'error' : line.level >= 40 ? 'warn' : line.level >= 30 ? 'info' : 'debug';
        messages.push(`${level}: ${line.msg}`);
      } catch {
        /* ignore malformed partial lines */
      }
      callback();
    },
  });
  const log = pino({ level: 'debug' }, stream) as Logger;
  return { log, messages };
}

describe('connectNats retry & logging', () => {
  it('backs off exponentially with a cap of 64x the base delay', () => {
    assert.equal(retryDelayMs(0, 1000), 1000);
    assert.equal(retryDelayMs(1, 1000), 2000);
    assert.equal(retryDelayMs(5, 1000), 32_000);
    // Capped: further retries do not grow beyond 64x.
    assert.equal(retryDelayMs(6, 1000), 64_000);
    assert.equal(retryDelayMs(9, 1000), 64_000);
  });

  it('fails after the configured number of attempts and logs each failure', async () => {
    const previous = process.env.NATS_URL;
    process.env.NATS_URL = 'nats://127.0.0.1:1';
    const { log, messages } = captureLogger();
    try {
      await assert.rejects(
        () => connectNats({ retries: 2, retryBaseMs: 5 }, log),
        /ECONNREFUSED|Unable|connect/i,
      );
    } finally {
      if (previous === undefined) delete process.env.NATS_URL;
      else process.env.NATS_URL = previous;
    }
    assert.ok(
      messages.some((m) => m.includes('retrying')),
      'expected a retry warning to be logged, got: ' + JSON.stringify(messages),
    );
    assert.ok(messages.some((m) => m.includes('Could not connect to NATS')));
  });
});