#!/bin/bash
# GPU entrypoint: compile the upstream deformable-attention ops on first
# start (docker build has no GPU, so it cannot happen at image build time),
# then run the Node.js API. Rebuilds only when the import is missing.
set -e

if ! python3 -c "import torch, MultiScaleDeformableAttention" >/dev/null 2>&1; then
  echo "[entrypoint] Building MultiScaleDeformableAttention ops (first start only)..."
  cd /app/raster2seq/models/ops
  python3 setup.py build install
  cd /app
  python3 -c "import torch, MultiScaleDeformableAttention; print('[entrypoint] ops OK')"
else
  echo "[entrypoint] Attention ops already built, skipping."
fi

exec node api/server.js
