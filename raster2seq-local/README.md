# raster2seq-local — Local Raster2Seq Floorplan API for Vista

Standalone service that runs
[Raster2Seq](https://github.com/Cornell-VAILab/Raster2Seq)
("Polygon Sequence Generation for Floorplan Reconstruction", SIGGRAPH'26)
locally and exposes it to Vista over HTTP:

```
floorplan image -> POST /api/floorplan/analyze -> Raster2Seq -> JSON response
```

Conceptually it replaces the previous RunPod prototype
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
- Python 3.10 (model layer; tested with 3.10.11) — **real inference additionally
  needs Linux + NVIDIA GPU + CUDA toolkit**, see below.
- ~2 GB free for the checkpoint; ~3 GB for a Python venv.

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

## Model setup / download (GPU machine)

On a Linux + CUDA 11.8 box, per upstream README:

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
# -> raster2seq-local API listening on :3000
```

Config lives in `api/.env` (see `api/.env.example`):
`PORT`, `CORS_ORIGIN`, `PYTHON_BIN`, `CHECKPOINT`, `DEVICE` (`auto|cuda|cpu`),
`TMP_DIR`, `INFERENCE_TIMEOUT_MS`, `MAX_IMAGE_MB`, `RASTER2SEQ_MOCK`.

## API

`GET /api/health` → `{ok, mock, checkpoint, device, raster2seq_repo}`

`POST /api/floorplan/analyze` — `multipart/form-data`, field **`image`**
(field `file` accepted as an alias for RunPod compatibility).
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
  http://localhost:3000/api/floorplan/analyze \
  -F "image=@samples/floorplan-multiroom.png"
```

Vista integration: `POST {SERVICE_URL}/api/floorplan/analyze` with the plan
as multipart `image`; read `result.spaces[]` (`category_id`/`label`/`polygon`).
The existing `expose-service` consumer (`src/lib/raster2seq.ts`,
`src/lib/v360-geometry.ts`) expects `spaces[]`/`refined_spaces[]` with
`polygon` arrays — this response is compatible with the `spaces` half
(no VLM refinement stage; see limitations).

## Testing

```powershell
cd test
.\test-api.ps1 -StartServer -Mock true    # full matrix, exits 0 on success
```

Covers: health, real sample upload → structured output, missing image (400),
non-image bytes (400), wrong field name (400), staging-dir cleanup. The real
(non-mock) path was verified to return a clean `503 MODEL_UNAVAILABLE` when
the model env is absent, with no temp files left behind and no path leakage.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `503 MODEL_UNAVAILABLE` | Python env, torch, checkpoint or CUDA missing — check server logs and `PYTHON_BIN`/`CHECKPOINT`/`DEVICE`. |
| `No module named 'MultiScaleDeformableAttention'` | Deformable-attention ops not compiled — run `models/ops/make.sh` on a Linux+CUDA box. |
| `Checkpoint file not found` | First run downloads ~1.45 GB via `huggingface_hub`; needs network + disk. |
| `The uploaded file is not a valid image` | Magic-byte mismatch (e.g. renamed `.txt`) — send a real JPG/PNG/WEBP. |
| CORS blocked in Vista dev | Set `CORS_ORIGIN=http://localhost:XXXX` in `api/.env`. |

## Docker Compose (local API + optional public tunnel)

`docker-compose.yml` runs two services:

| Service | What it is |
|---|---|
| `raster2seq-api` | This API in a `node:22-alpine` image (mock mode by default, no GPU needed). Port `3000` is `expose`d to the Docker network; the host binding is loopback-only (`127.0.0.1:3000`), so local dev works without exposing the API to the LAN/internet. |
| `cloudflared` | Official `cloudflare/cloudflared` image, remotely-managed tunnel via `CLOUDFLARE_TUNNEL_TOKEN`. Thin networking layer only — no app logic. Starts after the API is healthy. |

Local API (no Cloudflare account needed):

```powershell
cd raster2seq-local
docker compose up --build raster2seq-api
curl http://localhost:3000/health
curl http://localhost:3000/api/health
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

1. **Needs Linux + CUDA for real inference.** Upstream compiles CUDA-only
   attention kernels and uses `torch.cuda` unconditionally. Verified on
   2026-09-04 (Windows 11, GTX 1660 Ti, no CUDA toolkit, Python 3.10.11):
   the entire pure-Python chain installs (`torch 2.3.1+cpu`,
   `torchvision 0.18.1+cpu`, all `requirements.txt` pins incl. `timm 0.5.4`,
   `fairscale 0.4.6`, `pycocotools 2.0.11`), and inference then fails exactly
   at `No module named 'MultiScaleDeformableAttention'`. `RASTER2SEQ_MOCK=true`
   exists so Vista frontend work can proceed without a GPU.
2. **One Python process per request** (model reloads each time). Upstream
   `predict.py` is batch/directory oriented with no server mode; a persistent
   worker was deliberately not built (see task brief). Expect multi-second
   latency dominated by model load.
3. **No VLM refinement stage.** The RunPod prototype returned `refined_spaces`
   + rendered PNGs; this service returns the raw Raster2Seq `spaces` only.
4. **Polygons are in 256×256 padded input space**, not original pixels —
   scale by the letterbox transform if overlaying on the source image.
5. Only room semantics are predicted (no walls/doors-as-geometry beyond the
   Door/Window line labels); `category_id 0` ≈ outdoor — same filtering the
   Vista `v360-geometry` module already applies.
