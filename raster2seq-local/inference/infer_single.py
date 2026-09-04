"""Single-image Raster2Seq inference entrypoint for the Vista local API service.

Thin wrapper around the upstream Raster2Seq implementation
(``../raster2seq``, cloned from https://github.com/Cornell-VAILab/Raster2Seq).
It reuses the upstream modules -- ``ImageDataset``, ``ResizeAndPad``,
``build_model``, ``generate`` and the ``CC5K_LABEL``/``S3D_LABEL``/``R2G_LABEL``
mappings -- instead of reimplementing the model. The only differences from
upstream ``predict.py`` are:

* it processes exactly one image file (upstream ``predict.py`` walks a whole
  dataset directory via ``get_image_paths_from_directory``);
* it writes the prediction as JSON to stdout (upstream ``--save_pred`` writes
  COCO-style JSON files per image -- see ``predict.py`` lines ~490-512);
* it uses ``time.perf_counter`` instead of ``torch.cuda.Event`` so the timing
  code also runs when CUDA is unavailable (the model kernels themselves still
  require CUDA -- see README "Known limitations").

Default flags mirror upstream ``tools/predict_cc5k.sh`` (CubiCasa5K,
semantic, 256px). Other checkpoints (``hf:s3d-bw``, ``hf:raster2graph``)
need their matching ``--dataset_name``/``--semantic_classes`` values;
see upstream ``tools/predict_*.sh``.

Stdout contract (always a single JSON document):
  success -> {"status": "ok", "image_id": ..., "room_count": N,
              "spaces": [{"id", "category_id", "label", "polygon"}], ...}
  failure -> {"status": "error", "code": "...", "message": "..."}
The process exit code is 0 on success and non-zero on failure.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback

# --- Locate the upstream repository (override with RASTER2SEQ_REPO) ----------
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_REPO = os.path.normpath(os.path.join(_THIS_DIR, "..", "raster2seq"))
_REPO_ROOT = os.environ.get("RASTER2SEQ_REPO", _DEFAULT_REPO)
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)


def _fail(code: str, message: str) -> "NoReturn":  # noqa: F821
    print(json.dumps({"status": "error", "code": code, "message": message}))
    raise SystemExit(1)


def parse_args(argv=None):
    # Reuse the upstream argument parser verbatim so model_args always carries
    # every attribute build_model()/generate() expect (lr_backbone,
    # loss coefficients, ...). Only --image/--out/--device are ours.
    from predict import get_args_parser

    p = argparse.ArgumentParser(
        description="Raster2Seq single-image inference", parents=[get_args_parser()]
    )
    p.add_argument("--image", required=True, help="Path to the input floorplan image")
    p.add_argument("--out", default="", help="Write JSON here instead of stdout")
    # Defaults mirror upstream tools/predict_cc5k.sh (CubiCasa5K, semantic).
    # --device accepts auto|cuda|cpu ("auto" is ours; upstream default is cuda).
    p.set_defaults(
        device="auto",
        checkpoint=os.environ.get("RASTER2SEQ_CHECKPOINT", "hf:cubicasa5k"),
        dataset_name="cubicasa",
        semantic_classes=12,
        input_channels=3,
        image_size=256,
        seq_len=512,
        num_bins=32,
        poly2seq=True,
        use_anchor=True,
        dec_attn_concat_src=True,
        per_token_sem_loss=True,
        disable_poly_refine=True,
        ema4eval=True,
    )
    return p.parse_args(argv)


def main() -> None:
    args = parse_args()

    if not os.path.isfile(args.image):
        _fail("invalid_image", "Input image not found.")

    try:
        import torch
    except ImportError:
        _fail(
            "model_unavailable",
            "PyTorch is not installed. Set up the Raster2Seq Python "
            "environment first (see README).",
        )

    if args.device == "auto":
        device_name = "cuda" if torch.cuda.is_available() else "cpu"
    else:
        device_name = args.device
    if device_name == "cuda" and not torch.cuda.is_available():
        _fail(
            "model_unavailable",
            "CUDA device requested but torch.cuda.is_available() is False. "
            "Raster2Seq requires an NVIDIA GPU with the cu118 PyTorch build.",
        )

    try:
        from datasets.discrete_tokenizer import DiscreteTokenizer
        from datasets.transforms import ResizeAndPad
        from detectron2.data import transforms as T
        from engine import generate
        from models import build_model
        from raster2seq_hub import resolve_checkpoint_path
        from util.plot_utils import CC5K_LABEL, R2G_LABEL, S3D_LABEL
    except ImportError as exc:
        _fail(
            "model_unavailable",
            "Could not import the upstream Raster2Seq modules "
            f"(looked in {_REPO_ROOT}): {exc}. "
            "Install the Python requirements first (see README).",
        )

    label_maps = {"stru3d": S3D_LABEL, "cubicasa": CC5K_LABEL, "r2g": R2G_LABEL, "waffle": CC5K_LABEL}
    label_map = label_maps.get(args.dataset_name, CC5K_LABEL)

    # Mirror predict.py: single-file dataset with the same ResizeAndPad.
    transform = T.AugmentationList([ResizeAndPad((args.image_size, args.image_size), pad_value=255)])
    try:
        # Import here so the module-level import stays light for --help.
        from predict import ImageDataset

        dataset = ImageDataset([args.image], num_image_channels=args.input_channels, transform=transform)
        sample = dataset[0]
        images = sample["image"].unsqueeze(0)
    except Exception as exc:  # noqa: BLE001 - surfaced as JSON
        _fail("invalid_image", f"Could not read/transform the input image: {exc}")

    # args already carries the full upstream namespace (predict.py defaults).
    if args.disable_poly_refine:
        args.with_poly_refine = False
    if args.device == "auto":
        args.device = device_name

    tokenizer = None
    if args.poly2seq:
        tokenizer = DiscreteTokenizer(args.num_bins, args.seq_len, add_cls=False)
        args.vocab_size = len(tokenizer)

    try:
        model = build_model(args, train=False, tokenizer=tokenizer)
    except Exception as exc:  # noqa: BLE001
        _fail("model_unavailable", f"Could not build the Raster2Seq model: {exc}")

    device = torch.device(device_name)
    model.to(device)

    try:
        checkpoint_path = resolve_checkpoint_path(args.checkpoint)
    except Exception as exc:  # noqa: BLE001
        _fail("model_unavailable", f"Could not resolve checkpoint {args.checkpoint!r}: {exc}")
    if not os.path.isfile(checkpoint_path):
        _fail(
            "model_unavailable",
            f"Checkpoint file not found: {checkpoint_path}. "
            "Download it first (see README Model setup).",
        )

    try:
        checkpoint = torch.load(checkpoint_path, map_location="cpu")
        import copy

        if args.ema4eval and "ema" in checkpoint:
            state = copy.deepcopy(checkpoint["ema"])
        else:
            state = copy.deepcopy(checkpoint["model"])
        for key in list(state.keys()):
            if key.startswith("module."):
                state[key[7:]] = state.pop(key)
        model.load_state_dict(state, strict=False)
    except Exception as exc:  # noqa: BLE001
        _fail("model_unavailable", f"Could not load checkpoint weights: {exc}")

    for param in model.parameters():
        param.requires_grad = False
    model.eval()

    started = time.perf_counter()
    try:
        with torch.no_grad():
            outputs = generate(
                model,
                images.to(device),
                semantic_rich=args.semantic_classes > 0,
                use_cache=True,
                per_token_sem_loss=args.per_token_sem_loss,
                drop_wd=False,
                poly2seq=args.poly2seq,
            )
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        _fail("inference_failed", f"Raster2Seq inference failed: {exc}")
    inference_ms = round((time.perf_counter() - started) * 1000.0, 1)

    rooms = outputs.get("room") or [[]]
    labels = outputs.get("labels") or [[]]
    pred_rm, pred_cls = rooms[0], labels[0] or []
    if pred_cls is None:
        pred_cls = [-1] * len(pred_rm)

    image_id = os.path.splitext(os.path.basename(args.image))[0]
    spaces = []
    for instance_id, (poly, category_id) in enumerate(zip(pred_rm, pred_cls)):
        try:
            polygon = [[float(x), float(y)] for x, y in [list(map(float, pt)) for pt in poly]]
        except (TypeError, ValueError):
            flat = [float(v) for v in list(poly)]
            polygon = [[flat[i], flat[i + 1]] for i in range(0, len(flat) - 1, 2)]
        category_id = int(category_id)
        spaces.append(
            {
                "id": instance_id,
                "category_id": category_id,
                "label": label_map.get(category_id, str(category_id)),
                "polygon": polygon,
            }
        )

    # Same per-instance fields as upstream predict.py --save_pred
    # ({image_id, segmentation, category_id, id}); polygons here are in the
    # 256x256 padded model-input space, exactly as upstream emits them.
    result = {
        "status": "ok",
        "image_id": image_id,
        "room_count": len(spaces),
        "spaces": spaces,
        "image_size": args.image_size,
        "coordinate_space": f"model-input-{args.image_size}x{args.image_size}-padded",
        "checkpoint": args.checkpoint,
        "dataset": args.dataset_name,
        "device": device_name,
        "inference_ms": inference_ms,
    }
    payload = json.dumps(result)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(payload)
    else:
        print(payload)


if __name__ == "__main__":
    main()
