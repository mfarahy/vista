"""Phase 5 — identify the real scanned plans in `sample_inputs/`.

One-off classification pass that ran the VLM over the untracked real-world
inputs found in `geometry-ai/sample_inputs/` (scanned German plans, photos of
printed plans, and a 1968 Bauplan PDF) to decide which ones are clean
floor-plan drawings worth adopting as benchmark fixtures 07–09.

Run:
    python -m geometry_ai.identify_plans

Writes `output/phase5/real-fixture-identification.md` (gitignored output).
Requires OPENAI_API_KEY (falls back to expose-service/.env) and pymupdf only
if the PDF is present.
"""

from __future__ import annotations

import base64
import json
import os
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SCHEMA = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": ["floor_plan", "photo_of_plan", "document", "other"]},
        "plan_type": {"type": "string", "enum": ["basement", "ground_floor", "upper_floor", "site", "section", "unknown"]},
        "visible_labels": {"type": "array", "items": {"type": "string"}},
        "has_stairs": {"type": "boolean"},
        "summary": {"type": "string"},
    },
    "required": ["kind", "plan_type", "visible_labels", "has_stairs", "summary"],
    "additionalProperties": False,
}

PROMPT = """You are reading a scanned German architectural drawing.
Identify what kind of image this is. If it is a floor plan, list every visible
room label exactly as printed (German), say whether stairs are visible, and
guess the plan type. If it is a photo of a printed plan, say so. If it is not a
floor plan at all (e.g. a document, section drawing, site plan), say what it
is. Respond with the JSON structure only."""


def _api_key() -> str:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        env_file = ROOT.parent / "expose-service" / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("OPENAI_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not key:
        raise SystemExit("OPENAI_API_KEY is not set")
    return key


def _identify(key: str, path: Path, mime: str) -> dict:
    data = base64.b64encode(path.read_bytes()).decode()
    body = {
        "model": "gpt-5.6-luna",
        "max_completion_tokens": 1500,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}},
                ],
            }
        ],
        "response_format": {"type": "json_schema", "json_schema": {"name": "plan_id", "strict": True, "schema": SCHEMA}},
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=240) as resp:
        raw = json.loads(resp.read().decode())
    return {
        "file": path.name,
        "latency_s": round(time.perf_counter() - t0, 1),
        "payload": json.loads(raw["choices"][0]["message"]["content"]),
    }


def main() -> None:
    key = _api_key()
    samples = ROOT / "sample_inputs"
    if not samples.exists():
        print("no sample_inputs/ — nothing to identify")
        return

    files: list[tuple[Path, str]] = []
    for p in sorted(samples.glob("*.jpg")) + sorted(samples.glob("*.png")):
        files.append((p, "image/jpeg" if p.suffix.lower() in (".jpg", ".jpeg") else "image/png"))
    for pdf in sorted(samples.glob("*.pdf")):
        try:
            import pymupdf
        except ImportError:
            print("pymupdf not installed — skipping the PDFs")
            break
        tmp = Path(os.environ.get("TEMP", "."))
        for i, page in enumerate(pymupdf.open(pdf)):
            page_path = tmp / f"bauplan-{pdf.stem}-page-{i + 1}.png"
            page.get_pixmap(dpi=100).save(page_path)
            files.append((page_path, "image/png"))

    out = ROOT / "output" / "phase5"
    out.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Phase 5 — real-fixture identification",
        "",
        "One-off VLM pass (gpt-5.6-luna) over the untracked `sample_inputs/` "
        "to classify the project's real scanned plans. Fixtures 07–09 were "
        "adopted from the clean floor-plan drawings below; photos of printed "
        "plans and section/elevation pages were not benchmarked.",
        "",
        "| File | Kind | Plan type | Stairs | Visible labels |",
        "|---|---|---|---|---|",
    ]
    for path, mime in files:
        result = _identify(key, path, mime)
        p = result["payload"]
        labels = ", ".join(p["visible_labels"]) or "—"
        lines.append(
            f"| {result['file']} | {p['kind']} | {p['plan_type']} | {p['has_stairs']} | {labels} |"
        )
        print(result["file"], "->", p["kind"], p["plan_type"], f"({result['latency_s']}s)")
    (out / "real-fixture-identification.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nwritten {out / 'real-fixture-identification.md'}")


if __name__ == "__main__":
    main()