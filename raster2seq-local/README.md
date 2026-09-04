# raster2seq-local — Local Raster2Seq Floorplan API for Vista

Standalone service that runs
[Raster2Seq](https://github.com/Cornell-VAILab/Raster2Seq)
("Polygon Sequence Generation for Floorplan Reconstruction", SIGGRAPH'26)
locally and exposes it to Vista over HTTP:

```
floorplan image -> POST /api/floorplan/analyze -> Raster2Seq -> JSON response
```

Conceptually it replaces the previous remote GPU prototype
(`RASTER_AI_URL/predict?refine=vlm`, multipart field `file`) with a local
endpoint. The response carries the same kind of data (room polygons with
semantic labels) in a clean `{success, result}` envelope.

## Project layout

| Path | What it is |
|---|---|
| `raster2seq/` | **Upstream, unmodified** clone of `Cornell-VAILab/Raster2Seq` @ `a6c4e27` (2026-06-02). Never edit; re-clone to update. |
| `api/server.js` | Thin Node.js (Express) HTTP layer. Validates uploads, spawns inference, returns JSON, cleans temp files. |
| `inference/infer_single.py` | Thin Python wrapper around the upstream modules (`ImageDataset`, `build_model`, `generate`, label maps). Single image in, JSON out. The only intentional differences from upstream `predict.py` are documented in its docstring. |
| `inference/requirements-windows-cpu.txt` | Pure-Python dep pins verified installable on Windows (not sufficient alone — see limitations). |
| `samples/` | Test images + `mock-result.json` (dev fallback, same schema as the wrapper). |
| `test/test-api.ps1` | End-to-end test: health, valid upload, missing/invalid/wrong-field, temp cleanup. |

## Upstream recap (verified against the actual code)

- **Inference entry point:** `raster2seq/predict.py` (`main()`). It walks a whole
  dataset directory (`get_image_paths_from_directory`), resizes/pads every
  image to `image_size` (default 256) via `ResizeAndPad(..., pad_value=255)`,
  runs `engine.generate(...)`, and with `--save_pred` writes one COCO-style
  JSON per image: `[{image_id, segmentation, category_id, id}, ...]` where
  `segmentation` is the polygon in the **256×256 padded model-input space**.
- **Checkpoints:** resolved via `raster2seq_hub.py`; `hf:<alias>` downloads from
  Hugging Face `haopt/Raster2Seq` (e.g. `hf:cubicasa5k` → `cubicasa5k/checkpoint.pth`,
  **1_452_141_664 bytes**). Default preset mirrors `tools/predict_cc5k.sh`:
  `--dataset_name=cubicasa --semantic_classes=12 --input_channels=3 --poly2seq
  --seq_len=512 --num_bins=32 --disable_poly_refine --dec_attn_concat_src
  --per_token_sem_loss --use_anchor --ema4eval`.
- **Labels:** `util/plot_utils.py`: CubiCasa5K `CC5K_LABEL =
  {0: Outdoor, 1: Kitchen, 2: Living Room, 3: Bed Room, 4: Bath, 5: Entry,
  6: Storage, 7: Garage, 8: Undefined, 9: Window, 10: Door}` (+ `S3D_LABEL`,
  `R2G_LABEL` for other checkpoints).
- **Requirements (upstream):** Linux, Python 3.10.13, PyTorch 2.3.1 + CUDA 11.8,
  compiled deformable-attention ops (`models/ops/make.sh`) and the
  BoundaryFormer rasterizer (`diff_ras`). `models/ops/setup.py` raises
  `NotImplementedError` without CUDA; `predict.py` uses `torch.cuda.Event`
  unconditionally.

## Requirements

- Node.js ≥ 18 (API layer; tested with Node 26).
- Python 3.10 (model layer; tested with 3.10.11).
- For real inference: NVIDIA GPU + CUDA toolkit + C++ compiler.
  Upstream targets Linux + CUDA 11.8, but this project is verified working on
  **Windows 11 + GTX 1660 Ti (6 GB)** — see "Model setup / Windows (verified)".
- ~2 GB free for the checkpoint; ~4 GB for the Python venv (GPU torch).

## Installation

```powershell
cd raster2seq-local
node --version            # >= 18
cd api; npm install; cd ..
Copy-Item api\.env.example api\.env   # then edit api\.env
```

Python env (only needed for real inference; pure-Python chain verified on
Windows 10/11 + Python 3.10.11):

```powershell
C:\path\to\python3.10 -m venv .venv
.venv\Scripts\pip install torch==2.3.1 --index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\pip install torchvision==0.18.1 --index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\pip install -r inference\requirements-windows-cpu.txt
```

## Model setup / Windows GPU (verified 2026-09-04)

Machine: Windows 11, GTX 1660 Ti 6 GB, driver 610.74, VS 18 Community with
"C++ workload" (MSVC 14.51), CUDA Toolkit 13.3 (`nvcc` 13.3), Python 3.10.11.

```powershell
python3.10 -m venv .venv
.venv\Scripts\pip install torch==2.3.1 torchvision==0.18.1 `
  --index-url https://download.pytorch.org/whl/cu118
.venv\Scripts\pip install -r inference\requirements-windows-cpu.txt
.venv\Scripts\pip install einops plotly
# checkpoint (~1.45 GB, cached by huggingface_hub on first use):
.venv\Scripts\python -c "import sys; sys.path.insert(0,'raster2seq'); \
  from raster2seq_hub import download_checkpoint; download_checkpoint('cubicasa5k')"
```

Compile the deformable-attention ops. Two wrinkles on Windows, both handled
without touching upstream code:

1. torch 2.3.1 (cu118) refuses `nvcc` 13.3 (major-version check), so
   `.cuda-shim/bin/nvcc.exe` (built from `.cuda-shim/nvcc-shim.c` with `cl`,
   git-ignored) reports 11.8 for `--version` and delegates everything else to
   the real `nvcc` 13.3. Its `include/` + `lib/` are junctions to the 13.3
   toolkit.
2. CUDA 13.x headers require the conformant MSVC preprocessor — set
   `CL=/Zc:preprocessor` (env only, picked up automatically by `cl`).

```powershell
$env:CUDA_HOME = "$pwd\.cuda-shim"; $env:DISTUTILS_USE_SDK = "1"; $env:CL = "/Zc:preprocessor"
cmd /c '"C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat" >nul && .venv\Scripts\python.exe setup.py build install'
# run from raster2seq/models/ops; ends with "Finished processing dependencies
# for MultiScaleDeformableAttention==1.0"
```

Then point the API at that interpreter
(`PYTHON_BIN=D:\repo\vista\raster2seq-local\.venv\Scripts\python.exe`).

Verified: `samples/floorplan-multiroom.png` → 16 spaces (rooms + door/window
lines), `inference_ms` 2679.9; `samples/floorplan-sample1.jpg` → 22 spaces,
3740.4 ms — full JSON in `samples/real-result-*.json`.

## Model setup / Linux (per upstream README)

On a Linux + CUDA 11.8 box:

```bash
conda create -n raster2seq python=3.10 && conda activate raster2seq
pip install torch==2.3.1 torchvision==0.18.1 torchaudio==2.3.1 \
  --index-url https://download.pytorch.org/whl/cu118
pip install -r raster2seq/requirements.txt
cd raster2seq/models/ops && sh make.sh && cd ../..
cd raster2seq/diff_ras && python setup.py build develop && cd ../..
# checkpoint (~1.45 GB, cached by huggingface_hub on first use):
python -c "from raster2seq_hub import download_checkpoint; download_checkpoint('cubicasa5k')"
```

Then point the API at that interpreter: `PYTHON_BIN=/path/to/venv/bin/python`.

Manual inference check (single image, no Node involved):

```bash
python inference/infer_single.py --image samples/floorplan-multiroom.png \
  --checkpoint hf:cubicasa5k --device cuda
```

## How to start the API

```powershell
cd api
$env:RASTER2SEQ_MOCK = "false"   # "true" = dev fallback without GPU
node server.js
# -> raster2seq-local API listening on :3026
```

Config lives in `api/.env` (see `api/.env.example`):
`PORT`, `CORS_ORIGIN`, `PYTHON_BIN`, `CHECKPOINT`, `DEVICE` (`auto|cuda|cpu`),
`TMP_DIR`, `INFERENCE_TIMEOUT_MS`, `MAX_IMAGE_MB`, `RASTER2SEQ_MOCK`.

## API

`GET /api/health` → `{ok, mock, checkpoint, device, raster2seq_repo}`

`POST /api/floorplan/analyze` — `multipart/form-data`, field **`image`**
(field `file` accepted as an alias for compatibility).
Allowed: JPG/PNG/WEBP, ≤ 15 MB, magic bytes verified.

Success (`200`):

```json
{
  "success": true,
  "result": {
    "status": "ok",
    "image_id": "floorplan-multiroom",
    "room_count": 4,
    "spaces": [
      {"id": 0, "category_id": 2, "label": "Living Room",
       "polygon": [[18.5, 22.0], [150.0, 22.0], [150.0, 128.5], [18.5, 128.5]]}
    ],
    "image_size": 256,
    "coordinate_space": "model-input-256x256-padded",
    "checkpoint": "hf:cubicasa5k",
    "dataset": "cubicasa",
    "device": "cuda",
    "inference_ms": 1234.5
  }
}
```

The `spaces[]` schema is the upstream `--save_pred` JSON
(`image_id/segmentation/category_id/id`) renamed for readability
(`segmentation` → `polygon`) plus the human `label` from the upstream label
map. Polygons are in the 256×256 padded model-input space, exactly as the
model emits them. Errors: `{success:false, error:{code, message}}` with
`MISSING_IMAGE/INVALID_IMAGE` (400), `MALFORMED_OUTPUT/INFERENCE_FAILED`
(502), `MODEL_UNAVAILABLE` (503), `INFERENCE_TIMEOUT` (504). Filesystem paths
and stack traces are never sent to clients.

Example request (Vista can swap the host for the deployed URL later):

```bash
curl -X POST \
  http://localhost:3026/api/floorplan/analyze \
  -F "image=@samples/floorplan-multiroom.png"
```

### VLM refinement (`?refine=vlm`)

`POST /api/floorplan/analyze?refine=vlm` adds an OpenAI vision step after the
local draft and returns `refined_spaces[]` alongside `spaces[]` — the same
contract as the former GPU `/predict?refine=vlm`:

```bash
curl -X POST \
  "http://localhost:3026/api/floorplan/analyze?refine=vlm" \
  -F "image=@samples/floorplan-multiroom.png"
```

Refined entries: `{id, room_type, area, polygon, graph}` with
`refined_room_count`, `refined_total_area` (shoelace area in model-input px² —
no real-world scale is known), `vlm_model`, `refine_ms`, plus
`stage: "draft+vlm"` / `refinement: "vlm"` (draft-only replies carry
`stage: "draft"` / `refinement: "none"`). Every reply also carries
`request_id`. Verified live: 16 draft spaces → 16 refined
(`Undefined` → `Outdoor`/`Living Room`, areas computed) in ~16 s with
`gpt-5.6-terra`.

This is wrapper code (`api/lib/vlm-refine.js`), not upstream: upstream's own
`raster2seq/vlm_refinement/` scripts are Gemini-CLI (`gemini-2.5-pro`) batch
jobs over precomputed predictions, not a per-request API.

Configuration (`api/.env` or `raster2seq-local/.env`, server-side only):
`OPENAI_API_KEY` (required for refine), `OPENAI_MODEL` (default `gpt-4o`),
`OPENAI_BASE_URL` (default `https://api.openai.com/v1`), `REFINE_TIMEOUT_MS`
(default 180000), `REFINE_TEMPERATURE` (optional; omit unless your model
supports non-default temperatures — gpt-5.x rejects `temperature: 0`).
Without a key, `?refine=vlm` returns `503 VLM_NOT_CONFIGURED`; other failures
map to `502 VLM_FAILED` / `504 VLM_TIMEOUT`. The key is never logged or
returned; `/api/health` only reports `refinement.vlm_configured` + model name.

Vista integration: `POST {SERVICE_URL}/api/floorplan/analyze` with the plan
as multipart `image`; read `result.spaces[]` (`category_id`/`label`/`polygon`).

### Drop-in GPU replacement for expose-service

`POST {SERVICE_URL}/predict?refine=vlm` (multipart field `file`) speaks the
exact contract `expose-service/src/lib/raster2seq.ts` expects: the raw result
object with `status: 'ok'`, `spaces[]`, `refined_spaces[]`, `request_id`,
`room_count`, `inference_ms`/`refine_ms` — no `{success, result}` envelope.
To switch Vista to this service, only the env var changes:

```bash
# expose-service/.env (local) or Helm config.RASTER_AI_URL (deployed)
RASTER_AI_URL=http://localhost:3026
```

No `expose-service` code changes needed (`v360.ts`, `v360-geometry.ts`,
`debug-floorplan-recognition.ts` keep working untouched).

## Testing

```powershell
cd test
.\test-api.ps1 -StartServer -Mock true    # full matrix, exits 0 on success
```

Covers: health, real sample upload → structured output, missing image (400),
non-image bytes (400), wrong field name (400), staging-dir cleanup. Verified
both in mock mode and in real GPU mode (upload → 16 spaces from the actual
model, temp dir empty afterwards, no path leakage). With the model env absent
the API degrades to a clean `503 MODEL_UNAVAILABLE`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `503 MODEL_UNAVAILABLE` | Python env, torch, checkpoint or CUDA missing — check server logs and `PYTHON_BIN`/`CHECKPOINT`/`DEVICE`. |
| `No module named 'MultiScaleDeformableAttention'` | Deformable-attention ops not compiled — run `models/ops/make.sh` on a Linux+CUDA box. |
| `Checkpoint file not found` | First run downloads ~1.45 GB via `huggingface_hub`; needs network + disk. |
| `The uploaded file is not a valid image` | Magic-byte mismatch (e.g. renamed `.txt`) — send a real JPG/PNG/WEBP. |
| CORS blocked in Vista dev | Set `CORS_ORIGIN=http://localhost:XXXX` in `api/.env`. |
| `503 VLM_NOT_CONFIGURED` | `OPENAI_API_KEY` missing — set it in `api/.env` or `raster2seq-local/.env` (both gitignored; never commit secrets). |
| `Unsupported value: 'temperature' …` | Your model only takes the default temperature — leave `REFINE_TEMPERATURE` unset. |

## Docker Compose (GPU API + optional public tunnel)

Single `docker-compose.yml` (the old `docker-compose.gpu.yml` override was
merged in). Two services:

| Service | What it is |
|---|---|
| `raster2seq-api` | Full GPU image (`Dockerfile.gpu`: CUDA 11.8 + torch cu118 + compiled ops + baked checkpoint) running REAL inference on the host GPU. Port `3000` is `expose`d to the Docker network; the host binding is loopback-only (`127.0.0.1:3026`), so
local dev works without exposing the API to the LAN/internet (host port 3026 avoids the frontend on :3000). Falls back to the schema-identical mock with `RASTER2SEQ_MOCK=true`. |
| `cloudflared` | Official `cloudflare/cloudflared` image, remotely-managed tunnel via `CLOUDFLARE_TUNNEL_TOKEN`. Thin networking layer only — no app logic. Starts after the API is healthy. |

GPU notes: needs Docker GPU support (`docker run --rm --gpus all
nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi` must show your card). The
attention ops compile at first container start (~4 min, `TORCH_CUDA_ARCH_LIST`
targets sm_75; healthcheck `start_period` covers it), and `docker build` skips
that step (no GPU at build time — upstream `setup.py` refuses). Verified:
`POST /predict` → 16 spaces on CUDA in 3.2 s, `?refine=vlm` → 16 refined.

Local API (no Cloudflare account needed):

```powershell
cd raster2seq-local
docker compose up --build raster2seq-api
curl http://localhost:3026/health
curl http://localhost:3026/api/health
```

Public API (needs a one-time Cloudflare setup, see below):

```powershell
cd raster2seq-local
Copy-Item .env.example .env   # then set CLOUDFLARE_TUNNEL_TOKEN
docker compose up -d --build
docker compose ps
docker compose logs -f cloudflared
```

# Public Access with Cloudflare Tunnel

Goal: `Vista -> https://<your-hostname> -> Cloudflare Tunnel -> raster2seq-api -> Raster2Seq -> JSON`.

The tunnel uses Cloudflare's remotely-managed mode (token). The public
hostname (e.g. `https://raster2seq.example.com`) is configured in the
Cloudflare dashboard, not in this repo — never commit a real hostname
beyond an `example.com` placeholder, and never commit the token.

1. **Create a Cloudflare Tunnel.** Cloudflare dashboard → Zero Trust →
   Networks → Tunnels → Create a tunnel → pick the *Token* (remotely
   managed) type. Note the tunnel token shown once.
2. **Obtain the tunnel token** from the tunnel overview / install
   instructions (long opaque string).
3. **Put the token in `.env`** (never in git):
   ```powershell
   cd raster2seq-local
   Copy-Item .env.example .env
   # edit .env: CLOUDFLARE_TUNNEL_TOKEN=<paste token>
   #             R2S_PUBLIC_HOSTNAME=raster2seq.example.com (documentation only)
   ```
   `.env` is git-ignored (`raster2seq-local/.gitignore` + repo `.gitignore`).
4. **Configure the public hostname** in the tunnel's *Public Hostname*
   settings: hostname `raster2seq.example.com` (your real domain),
   service type `HTTP`, URL `http://raster2seq-api:3000`. The service URL
   must use the Docker Compose **service name** — never `localhost`, which
   from inside the tunnel container would mean the tunnel itself.
5. **(DNS)** Cloudflare adds the DNS record for the hostname automatically
   when you save the public hostname. HTTPS is provided by Cloudflare.
6. **Start the stack:**
   ```powershell
   cd raster2seq-local
   docker compose up -d --build
   docker compose ps
   docker compose logs raster2seq-api
   docker compose logs cloudflared
   ```
7. **Test the public endpoint** (replace with your hostname):
   ```bash
   curl https://raster2seq.example.com/health
   curl -X POST https://raster2seq.example.com/api/floorplan/analyze \
     -F "image=@samples/floorplan-multiroom.png"
   ```

Useful commands:

```powershell
docker compose up -d --build        # start full stack (API + tunnel)
docker compose up --build raster2seq-api   # local API only, no token needed
docker compose ps
docker compose logs -f cloudflared
docker compose logs raster2seq-api
docker compose down                 # stop everything
```

## Vista Integration

Vista only needs the public base URL — it never knows about Docker or the
tunnel. Response contract is unchanged (`{success, result}` with
`result.spaces[]`).

Base URL example: `https://raster2seq.example.com`

- Health: `GET https://raster2seq.example.com/health`
  (legacy alias `GET /api/health` still works)
- Analyze: `POST https://raster2seq.example.com/api/floorplan/analyze`
  with `multipart/form-data`, field **`image`** = floorplan file
  (JPG/PNG/WEBP, ≤ 15 MB; field `file` accepted as alias).

```bash
curl -X POST https://raster2seq.example.com/api/floorplan/analyze \
  -F "image=@floorplan.png"
```

Success (`200`): `{success:true, result:{status:"ok", room_count, spaces:[{id, category_id, label, polygon}], ...}}`
(medical mock mode adds `"mocked":true`). Errors keep
`{success:false, error:{code, message}}`; no internal paths or secrets leak.

## Tunnel Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Tunnel exits with `"tunnel run" requires the ID or name of the tunnel` | `CLOUDFLARE_TUNNEL_TOKEN` is empty/unset — copy `.env.example` to `.env` and paste the token from the Cloudflare dashboard (`docker compose logs cloudflared`). The API keeps serving locally meanwhile. Token is passed via the `TUNNEL_TOKEN` env var (never on the command line), so it never appears in process listings. Never commit the token. |
| Tunnel fails to authenticate / cannot connect to Cloudflare edge | Invalid, expired or revoked token — regenerate it in the tunnel's dashboard overview and update `.env`, then `docker compose up -d cloudflared`. |
| Tunnel `connection refused` / `dial tcp ... raster2seq-api:3000` | API not ready or wrong service URL — check `docker compose ps`, `docker compose logs raster2seq-api`; the tunnel service URL must be `http://raster2seq-api:3000` (service name, not `localhost`). `depends_on` (healthy) already gates startup. |
| Public hostname 404 / `ERR_DNS` / Cloudflare `Error 1033` | Public hostname not configured (or wrong DNS) in the tunnel's dashboard settings — re-check hostname spelling and that its service points at `http://raster2seq-api:3000`. |
| `503 MODEL_UNAVAILABLE` | Real-model env missing (Python/torch/checkpoint/CUDA) — container defaults to `RASTER2SEQ_MOCK=true`; set `RASTER2SEQ_MOCK=false` only on a GPU host with the model set up (see Model setup). |
| CORS blocked in Vista | Set `CORS_ORIGIN=https://your-vista-host` (comma-separated allowed) in `.env` and recreate the API container. |
| Inference `504`/`502` | Model load/generation too slow or failed — raise `INFERENCE_TIMEOUT_MS`, check API logs; GPU hosts only for real inference. |

## Known limitations (MVP, by design)

1. **Real inference needs a GPU + compiled ops.** Done and verified on the
   dev box (Windows 11 + GTX 1660 Ti; see setup above). `RASTER2SEQ_MOCK=true`
   remains as a fallback so Vista frontend work can proceed without a GPU.
   Note the `.cuda-shim` version-report trick: it only affects the local
   build; the compiled kernels run on the real CUDA 13.3 driver.
2. **One Python process per request** (model reloads each time). Upstream
   `predict.py` is batch/directory oriented with no server mode; a persistent
   worker was deliberately not built (see task brief). Measured end to end:
   ~3–8 s per request on GTX 1660 Ti (model load + 2.7–3.7 s inference).
3. **No VLM refinement stage.** The previous GPU prototype returned `refined_spaces`
   + rendered PNGs; this service returns the raw Raster2Seq `spaces` only.
4. **Polygons are in 256×256 padded input space**, not original pixels —
   scale by the letterbox transform if overlaying on the source image.
5. Only room semantics are predicted (no walls/doors-as-geometry beyond the
   Door/Window line labels); `category_id 0` ≈ outdoor — same filtering the
   Vista `v360-geometry` module already applies.
