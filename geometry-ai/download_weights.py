"""Download the MIT-licensed model weights + config from Hugging Face.

    python download_weights.py

Fetches `best.safetensors` (~98 MB) and the matching training `config.yaml`
from `Yytsi/floorplan-to-3d-walls` into `./weights`. The weights are MIT
licensed; see `docs/geometry-ai-evaluation.md` for the license analysis.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from huggingface_hub import hf_hub_download

REPO_ID = "Yytsi/floorplan-to-3d-walls"
FILES = ("best.safetensors", "config.yaml")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "weights")
    args = p.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    for f in FILES:
        path = hf_hub_download(repo_id=REPO_ID, filename=f, local_dir=args.out)
        print(f"downloaded {path}")


if __name__ == "__main__":
    main()