# Phase 3 — Candidate research records (specialized floor-plan geometry models)

Collected Phase 3 (Step 2) from current, authoritative sources (GitHub repo +
README + paper + HuggingFace model card), checked 2026-08-27. Nothing is
fabricated; unverifiable fields are `unknown`. Measured latency/cost from this
phase: `phase3-report.md`; commercial-gate flag per candidate below.

Legend — `commercial_use`:
- `COMMERCIAL_READY` — code + weights + training data all permissive.
- `COMMERCIAL_RISK` — code/weights permissive but training data or an
  unstated weight license leaves commercial use a legal gray area.
- `NON_COMMERCIAL` — explicit non-commercial restriction.
- `UNKNOWN` — cannot be determined from authoritative sources.

---

## 1. Raster2Seq (Cornell) — SIGGRAPH 2026 raster→vector floorplan

```text
name                      = Raster2Seq: Polygon Sequence Generation for Floorplan Reconstruction
repository                = https://github.com/Cornell-VAILab/Raster2Seq
paper                     = https://arxiv.org/abs/2602.09016 (SIGGRAPH 2026)
last_meaningful_update    = 2026-07-14 (repo pushed; HF model card alive)
license (code)            = MIT (LICENSE in repo)
weights_license           = MIT (HF model card `haopt/Raster2Seq` tags mit)
dataset_license           = varies per checkpoint: Structured3D (MIT), CubiCasa5K
                            (CC BY-NC 4.0), Raster2Graph 10k (LIFULL proprietary raster
                            images). WAFFLE zero-shot subset used with CubiCasa ckpt.
commercial_use            = COMMERCIAL_RISK — MIT code + weights, BUT the
                            `cubicasa5k` checkpoint is trained on CC BY-NC data and
                            `raster2graph*` on proprietary LIFULL images (commercial
                            use of those checkpoints is a gray area). `s3d-bw` /
                            `s3d-density` (Structured3D, MIT data) are the cleaner
                            checkpoints but target 3D-rendered plans, not CAD drawings.
input_format              = rasterized floor-plan image (RGB), COCO-style dataset
                            folder at inference (predict.py iterates an annotation dir)
output_representation     = labeled polygon sequences jointly encoding geometry +
                            semantics: rooms, windows, doors (paper abstract)
walls                     = indirect (room-polygon boundaries; "nowalls" dataset naming)
rooms                     = yes (polygons + room-type labels)
doors                     = yes (labeled polygons)
windows                   = yes (labeled polygons)
stairs                    = no
dimensions                = no
CPU_support               = no (see below)
GPU_requirement           = NVIDIA CUDA; tested torch 2.3.1 + cu118, python 3.10
minimum_VRAM_if_known     = unknown
framework                 = PyTorch, Deformable-DETR backbone, autoregressive
                            anchor decoder + BoundaryFormer diff. rasterization
pretrained_weights        = https://huggingface.co/haopt/Raster2Seq (5 checkpoints:
                            s3d-bw, cubicasa5k, raster2graph, raster2graph-512,
                            s3d-density); RoomF1 99.6/88.7/97.0/98.1/99.1
installation_complexity   = high — must compile `models/ops` (deformable attention)
                            AND `diff_ras/rasterize_cuda` (CUDAExtension)
inference_speed          = unknown (paper does not quote per-image time)
fine_tuning_supported     = yes (finetune_*.sh stage 2 semantic + the model is
                            sequence-decoder based → trainable on new labels)
training_code_available   = yes (tools/pretrain_*.sh, finetune_*.sh)
training_data_available   = yes (data_preprocess/, COCO-format annotations)
notes                     = 2026 SOTA across Structured3D / CubiCasa5K / Raster2Graph /
                            WAFFLE. The strongest *image→vector* floor-plan model found
                            in Aug 2026. Blocked in this environment by CUDA-only
                            operators (see WHY NOT RUN below).
```

### WHY NOT RUN (documented blocker, verified on this machine)

`models/ops/setup.py` raises

```text
NotImplementedError: Cuda is not availabel
```

when `torch.cuda.is_available()` is false (no `nvcc`, no `CUDA_HOME`,
`torch.cuda.is_available()==False`), and `diff_ras/setup.py` unconditionally
builds a `CUDAExtension` (`rasterize_cuda_kernel.cu`). No CPU fallback exists
for either operator, so Raster2Seq cannot be installed or run on this CPU-only
machine. Its inference entry also expects a COCO annotation folder rather than
arbitrary images, which would need dataset plumbing. Recorded as a concrete
failure, not fabricated.

---

## 2. CubiCasa4-class ResNet34-UNet (Yytsi `floorplan-to-3d`)

```text
name                      = floorplan-to-3d segmentation model
repository                = https://github.com/Yytsi/floorplan-to-3d
paper                     = none (project README; model trained on CubiCasa5K)
last_meaningful_update    = 2026-05-13 (repo + HF weights pushed)
license (code)            = MIT
weights_license           = MIT (HF card `Yytsi/floorplan-to-3d-walls` tags `mit`,
                            best.safetensors ~98 MB, reported 4-class mIoU 0.983)
dataset_license           = CubiCasa5K CC BY-NC 4.0 (training data)
commercial_use            = COMMERCIAL_RISK — MIT code+weights, but trained on
                            NC-licensed CubiCasa5K; a legal ruling on weights derived
                            from NC data is not settled → treat as restricted
input_format              = raster floor-plan image (repo server rasterizes SVG
                            via cairosvg; the UNet itself consumes the rendered PNG)
output_representation     = 4-class pixel mask: floor / wall / door / window;
                            repo post-processes to per-class polygons (3D extrusion)
walls                     = yes (mask; centerlines derived for geo2)
rooms                     = no (single "floor" class is not a room decomposition)
doors                     = yes (mask)
windows                   = yes (mask)
stairs                    = no
dimensions                = no
CPU_support               = yes (README: server runs on CPU; no GPU required)
GPU_requirement           = optional (CUDA / MPS if available)
minimum_VRAM_if_known     = unknown; UNet+ResNet34 ≈ 24M params, fits in ~2 GB
framework                 = PyTorch + segmentation-models-pytorch + safetensors
pretrained_weights        = https://huggingface.co/Yytsi/floorplan-to-3d-walls
installation_complexity   = low (pip torch cpu + smp + safetensors + opencv + skimage)
inference_speed          = measured here: ~0.5–0.7 s/image steady on 8 CPU cores (512²)
fine_tuning_supported     = yes (train.py + smp.UNet is a standard trainable head)
training_code_available   = yes (src/buildingcv/train.py)
training_data_available   = CubiCasa5K (CC BY-NC), or re-train on permissive data
notes                     = the practical CPU-runnable "walls+openings" candidate.
                            Benchmark id `cubicasa-unet` in geo2.
```

## 3. OpenBIM-FloorPlan-AI M2 (UNet+ResNet34)

```text
name                      = OpenBIM FloorPlan AI M2 (domain-adapted UNet)
repository                = https://github.com/Chunling1/OpenBIM-FloorPlan-AI
paper                     = none (README; trained on CubiCasa5K + domain adaptation)
last_meaningful_update    = 2026-05-27 repo, weights v1.0.0 release
license (code)            = MIT
weights_license           = MIT (weights on GitHub Releases under the MIT repo:
                            M2_DA_FT_v2_best.pt ~93 MB, reported mIoU 0.787)
dataset_license           = CubiCasa5K CC BY-NC 4.0 (training data)
commercial_use            = COMMERCIAL_RISK — same NC-training-data caveat as #2
input_format              = raster floor-plan image (square-resized 512×512 training
                            convention); includes CAD/black-background domain-adaptation
                            pre-/post-processing in the repo (NOT used in geo2)
output_representation     = 4-class pixel mask: background / wall / window / door
walls                     = yes (mask)
rooms                     = no
doors                     = yes (mask)
windows                   = yes (mask)
stairs                    = no
dimensions                = no
CPU_support               = yes (repo offers an ONNX CPU path, <1.5 s claimed; the
                            PyTorch .pt runs on CPU too — measured here)
GPU_requirement           = optional (torch path: cuda if available else cpu)
minimum_VRAM_if_known     = unknown (~24M params)
framework                 = PyTorch, segmentation-models-pytorch; ONNX runtime option
pretrained_weights        = https://github.com/Chunling1/OpenBIM-FloorPlan-AI/releases
installation_complexity   = low
inference_speed          = measured here: ~0.5 s/image steady on 8 CPU cores (512²)
fine_tuning_supported     = yes (train_all.py, finetune_domain*.py)
training_code_available   = yes
training_data_available   = CubiCasa5K (CC BY-NC) + community-annotation build-out
notes                     = second CPU-runnable candidate with different training data
                            split and class order. Benchmark id `openbim-unet` in geo2.
```

---

## 4. RoomFormer (Tsinghua) — inspected, NOT runnable for raster plans

```text
name                      = RoomFormer: Two-level Queries for Single-stage Floorplan
                            Reconstruction (CVPR 2023)
repository                = https://github.com/ywyue/RoomFormer
paper                     = https://arxiv.org/abs/2211.15658
last_meaningful_update    = 2025-04-02
license (code)            = MIT
weights_license           = unknown (checkpoints hosted on ETH polybox, no license stated)
dataset_license           = Structured3D / SceneCAD processed data (SCanNet); Structured3D
                            is MIT, SceneCAD/ScanNet carry their own research terms
commercial_use            = COMMERCIAL_RISK / UNKNOWN (code MIT; weight+dataset licenses
                            not clearly stated)
input_format              = top-down point-density map of a 3D scene (projected RGB-D
                            point clouds from Structured3D panoramas / ScanNet scans) —
                            NOT a raster 2D floor-plan drawing
output_representation     = vectorized room polygons (ordered vertices); semantic-rich
                            variant (SD-TQ) adds room types + doors + windows
walls                     = indirect (room-polygon boundaries)
rooms                     = yes (polygons)
doors                     = yes (semantic-rich variant only)
windows                   = yes (semantic-rich variant only)
stairs                    = no
dimensions                = no
CPU_support               = no (Deformable-DETR + diffuse rasterization CUDA ops)
GPU_requirement           = NVIDIA CUDA (tested cu111 / torch 1.9) — also needs
                            detectron2 + boundaryformer compile
minimum_VRAM_if_known     = unknown
framework                 = PyTorch 1.9, Deformable-DETR, BoundaryFormer
pretrained_weights        = https://polybox.ethz.ch/index.php/s/vlBo66X0NTrcsTC
installation_complexity   = high (compile ops, detectron2 source build, old torch)
inference_speed          = unknown
fine_tuning_supported     = yes (train_stru3d.sh / train_scenecad.sh / sem-rich)
training_code_available   = yes
training_data_available   = yes (author-processed Structured3D + SceneCAD)
notes                     = canonical "specialized floor-plan model", but its input is a
                            3D-scan density map, not a 2D architectural drawing — the
                            geo2 fixtures are 2D drawings, so it is out of domain here
                            (documented modality mismatch, not a bug).
```

---

## References checked / rejected

| candidate | verdict | reason |
|---|---|---|
| CubiCasa5K original (ResNet34-UNet multi-task) | NON_COMMERCIAL | CC BY-NC 4.0 code+weights; CC BY-NC-SA dataset (also CUDA-only) |
| ResPlan (m-agour) | dataset, not a model | CC BY 4.0 vector-graph dataset + GNN baselines; **no pretrained image→vector model**. Commercially clean → valuable later for training |
| floor-plan-vectorizer (pimenoffd, Dec 2025) | scaffolding | no released weights, no license |
| DiffPlanner (TVCG 2025) | out of scope | *generative* (boundary → rooms), not raster→vector; no license statement |
| PolyRoom / FRI-Net / PolyDiffuse / Raster2Graph | research-only | no permissive weights; CUDA-only; rooms-only; Raster2Graph images proprietary |
| `roomgraph` (aec-platform) | out of scope | MIT classical-CV pipeline, but requires **vector PDF** input; raster out of scope |

---

## Selection rationale (Step 4)

- **Raster2Seq** — the strongest 2026 *true* floor-plan geometry model (rooms +
  windows + doors as labeled polygons, SOTA on the standard benchmarks) and
  MIT-clean publishing; selected because it is the right architecture to test
  "specialized model vs VLM". Could not run here (CUDA-only ops) — documented.
- **CubiCasa UNet (Yytsi)** — practical CPU-runnable walls+openings model,
  MIT weights; the "actual floor-plan geometry" requirement.
- **OpenBIM UNet M2** — second independent CPU-runnable segmentation model
  (different training regime/class order/domain adaptation) for generalization
  contrast.
- **RoomFormer** — canonical specialized floor-plan room model; inspected and
  documented as input-modality-mismatched (3D density maps) + CUDA-only.

Not selected: CubiCasa5K original (non-commercial licence), ResPlan (no
inference model), pimenoffd vectorizer (no weights), other research repos
(no permissive weights).