import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const config = {
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  pythonBin: process.env.PYTHON_BIN ?? 'python',
  checkpoint: process.env.CHECKPOINT ?? 'hf:cubicasa5k',
  device: process.env.DEVICE ?? 'auto',
  tmpDir: process.env.TMP_DIR || path.join(os.tmpdir(), 'raster2seq-local'),
  inferenceTimeoutMs: Number(process.env.INFERENCE_TIMEOUT_MS ?? 300_000),
  maxImageBytes: Number(process.env.MAX_IMAGE_MB ?? 15) * 1024 * 1024,
  mock: String(process.env.RASTER2SEQ_MOCK ?? 'false').toLowerCase() === 'true',
};

const INFER_SCRIPT = path.join(PROJECT_ROOT, 'inference', 'infer_single.py');
const MOCK_RESULT = path.join(PROJECT_ROOT, 'samples', 'mock-result.json');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const log = (level, msg, extra = {}) => {
  const line = { ts: new Date().toISOString(), level, msg, ...extra };
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(line));
};

function fail(res, httpStatus, code, message) {
  return res.status(httpStatus).json({ success: false, error: { code, message } });
}

/** Minimal magic-byte check so text uploads fail fast with a clear error. */
function sniffImage(buffer, mime) {
  if (buffer.length < 12) return false;
  if (mime === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mime === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8;
  }
  if (mime === 'image/webp') {
    return (
      buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  return false;
}

/** Strip machine-specific paths before sending errors to clients. */
function sanitize(message) {
  return String(message ?? 'Unexpected server error').replace(config.tmpDir, '<tmp>').slice(0, 500);
}

function runInference(imagePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      config.pythonBin,
      [INFER_SCRIPT, '--image', imagePath, '--checkpoint', config.checkpoint, '--device', config.device],
      { cwd: PROJECT_ROOT },
    );
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' }));
    }, config.inferenceTimeoutMs);
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(Object.assign(new Error(`cannot start python (${err.message})`), { code: 'SPAWN' }));
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      if (exitCode !== 0) {
        // Prefer the structured JSON error from infer_single.py when present.
        try {
          const parsed = JSON.parse(stdout.trim().split('\n').pop() || '');
          if (parsed && parsed.status === 'error') {
            reject(Object.assign(new Error(parsed.message || 'inference failed'), {
              code: parsed.code || 'INFERENCE_FAILED',
            }));
            return;
          }
        } catch {
          // fall through to generic error below
        }
        reject(
          Object.assign(new Error(stderr.slice(-500) || `inference exited with code ${exitCode}`), {
            code: 'INFERENCE_FAILED',
          }),
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim().split('\n').pop() || ''));
      } catch {
        reject(Object.assign(new Error('model returned malformed output'), { code: 'MALFORMED' }));
      }
    });
  });
}

const app = express();
app.use(cors({ origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',') }));
app.use(express.json({ limit: '1mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxImageBytes, files: 1 },
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'file', maxCount: 1 },
]);

function healthPayload() {
  return {
    ok: true,
    mock: config.mock,
    checkpoint: config.checkpoint,
    device: config.device,
    raster2seq_repo: '../raster2seq (upstream, unmodified)',
  };
}

app.get('/api/health', (_req, res) => {
  res.json(healthPayload());
});

// Alias required by the public Cloudflare Tunnel contract (`GET /health`).
// Kept identical to `/api/health` so existing clients keep working.
app.get('/health', (_req, res) => {
  res.json(healthPayload());
});

app.post('/api/floorplan/analyze', upload, async (req, res) => {
  // Accept the RunPod field name `file` as an alias for compatibility.
  const file = req.files?.image?.[0] ?? req.files?.file?.[0];
  if (!file) {
    return fail(res, 400, 'MISSING_IMAGE', 'No image uploaded. Send multipart field "image".');
  }
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return fail(res, 400, 'INVALID_IMAGE', 'Only JPG, PNG and WEBP images are supported.');
  }
  if (file.size === 0) {
    return fail(res, 400, 'INVALID_IMAGE', 'The uploaded image is empty.');
  }
  if (!sniffImage(file.buffer, file.mimetype)) {
    return fail(res, 400, 'INVALID_IMAGE', 'The uploaded file is not a valid image.');
  }

  const started = Date.now();
  const requestId = crypto.randomUUID();
  const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
  let stagedPath = null;

  try {
    fs.mkdirSync(config.tmpDir, { recursive: true });

    if (config.mock) {
      const raw = fs.readFileSync(MOCK_RESULT, 'utf8');
      const result = JSON.parse(raw);
      log('log', 'floorplan analyzed (mock)', { requestId, roomCount: result.room_count });
      return res.json({ success: true, mocked: true, result });
    }

    stagedPath = path.join(config.tmpDir, `${requestId}.${ext}`);
    fs.writeFileSync(stagedPath, file.buffer);
    log('log', 'running Raster2Seq inference', {
      requestId,
      bytes: file.size,
      checkpoint: config.checkpoint,
      device: config.device,
    });

    const result = await runInference(stagedPath);
    if (!result || result.status !== 'ok' || !Array.isArray(result.spaces)) {
      log('error', 'malformed model output', { requestId });
      return fail(res, 502, 'MALFORMED_OUTPUT', 'The model returned an unexpected response.');
    }
    log('log', 'floorplan analyzed', {
      requestId,
      roomCount: result.room_count,
      inferenceMs: result.inference_ms,
      totalMs: Date.now() - started,
    });
    return res.json({ success: true, result });
  } catch (err) {
    const code = err?.code;
    if (code === 'TIMEOUT') {
      log('error', 'inference timed out', { requestId });
      return fail(res, 504, 'INFERENCE_TIMEOUT', 'Floorplan analysis timed out. Please retry.');
    }
    if (code === 'SPAWN' || code === 'model_unavailable') {
      log('error', 'model unavailable', { requestId, detail: sanitize(err.message) });
      return fail(res, 503, 'MODEL_UNAVAILABLE', 'The recognition model is not available.');
    }
    log('error', 'inference failed', { requestId, detail: sanitize(err.message) });
    return fail(res, 502, 'INFERENCE_FAILED', 'Floorplan analysis failed.');
  } finally {
    if (stagedPath) {
      fs.rm(stagedPath, { force: true }, () => {});
    }
  }
});

// Multer size-limit errors arrive here; keep the contract {success:false,...}.
app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return fail(res, 400, 'INVALID_IMAGE', 'Images must be 15 MB or smaller.');
  }
  if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
    return fail(res, 400, 'MISSING_IMAGE', 'No image uploaded. Send multipart field "image".');
  }
  log('error', 'unexpected server error', { detail: sanitize(err?.message) });
  return fail(res, 500, 'SERVER_ERROR', 'Unexpected server error.');
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(config.port, () => {
    log('log', `raster2seq-local API listening on :${config.port}`, {
      mock: config.mock,
      checkpoint: config.checkpoint,
      device: config.device,
    });
  });
}

export default app;
