"""Minimal local HTTP inference service for the geometric feasibility phase.

A single bare-bones stdlib HTTP server (no FastAPI/uvicorn) exposing:

    GET  /healthz   -> {"ok": true, "device": ..., "epoch": ..., "model": ...}
    POST /extract   -> JSON body {"image_base64": "<b64>", "content_type": "<mime>"}
                       returns the raw model output document (VistaGeometry
                       adapter runs in the frontend API route, not here).

The `/extract` request may additionally carry a validated VLM semantic
document (`"semantic": {...}` — the Phase 5 normalized payload). When
present, the deterministic Phase 6 fusion layer runs and the response gains
`"semantic"` and `"fused"` fields; without it the response is the Phase 2–4
document only. Fusion never runs without semantics — the VLM stays a
per-plan advisory input, never a geometry source.

This is intentionally a minimal service — there is no queueing, auth or
database wiring. It runs both locally and in a container (Dockerfile +
`deploy/helm/vista-geometry-ai`); `HOST`/`PORT` may be set via environment
variables and default to `127.0.0.1:8787`. Start it with:

    python -m geometry_ai.service --weights weights --port 8787

The Next.js route talks to this service via GEOMETRY_AI_SERVICE_URL.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from .extract import GeometryInference
from .fusion import fuse

MAX_BODY_BYTES = 20 * 1024 * 1024


def build_app(weights_dir: str | Path, device: str | None = None, ckpt: str = "best.safetensors"):
    inference = GeometryInference(weights_dir, ckpt=ckpt, device=device)

    class Handler(BaseHTTPRequestHandler):
        server_version = "VistaGeometryAI/0.1"

        def _send_json(self, status: int, payload: dict) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:
            if urlparse(self.path).path != "/healthz":
                self._send_json(404, {"error": "not_found"})
                return
            self._send_json(
                200,
                {
                    "ok": True,
                    "device": str(inference.device),
                    "epoch": inference.epoch,
                    "model": inference.model.__class__.__name__,
                    "image_size": list(inference.image_size),
                    "preprocess": inference.preprocess,
                },
            )

        def do_POST(self) -> None:
            if urlparse(self.path).path != "/extract":
                self._send_json(404, {"error": "not_found"})
                return
            length = int(self.headers.get("Content-Length", "0"))
            if length > MAX_BODY_BYTES:
                self._send_json(413, {"error": "too_large"})
                return
            raw = self.rfile.read(length)
            try:
                req = json.loads(raw.decode("utf-8"))
                image_bytes = base64.b64decode(req["image_base64"])
            except Exception:
                self._send_json(400, {"error": "bad_request"})
                return
            try:
                result = inference.run(image_bytes)
                semantic = req.get("semantic")
                if isinstance(semantic, dict):
                    result["semantic"] = semantic
                    result["fused"] = fuse(
                        result["normalized"],
                        semantic,
                        src_w=result["input"]["width"],
                        src_h=result["input"]["height"],
                    )
            except Exception as exc:  # surface failures as JSON, not HTML
                self._send_json(422, {"error": str(exc)})
                return
            self._send_json(200, result)

        def log_message(self, fmt: str, *args) -> None:
            # Keep the console quiet unless verbose mode is on.
            if self.server.verbose:  # type: ignore[attr-defined]
                BaseHTTPRequestHandler.log_message(self, fmt, *args)

    return inference, Handler


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--weights", type=Path, default=Path(__file__).resolve().parent.parent / "weights")
    p.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    p.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8787")))
    p.add_argument("--device", default=None)
    p.add_argument("--verbose", action="store_true")
    args = p.parse_args()

    inference, Handler = build_app(args.weights, args.device)
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    httpd.verbose = args.verbose  # type: ignore[attr-defined]
    print(
        f"[geometry-ai] ready on http://{args.host}:{args.port} "
        f"(model '{inference.model.__class__.__name__}', device {inference.device}, epoch {inference.epoch})"
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[geometry-ai] shutdown")


if __name__ == "__main__":
    main()