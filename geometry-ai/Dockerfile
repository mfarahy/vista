FROM python:3.11-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOST=0.0.0.0 \
    PORT=8787

# CPU-only wheels (~2 GB smaller than the CUDA build). The satellite index must
# come first so torch/torchvision never resolve to a CUDA wheel from PyPI.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch torchvision

COPY requirements.txt ./
# cairosvg is only needed for fixture generation, not for the HTTP service.
RUN grep -v '^cairosvg' requirements.txt > requirements-runtime.txt \
    && pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements-runtime.txt \
    && rm requirements-runtime.txt

COPY download_weights.py ./
# MIT-licensed model (~98 MB) baked into the image so pods start with no
# external fetch; see docs/geometry-ai-evaluation.md for the license analysis.
RUN python download_weights.py --out /app/weights

COPY geometry_ai/ ./geometry_ai/
# Run as non-root
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8787/healthz')" || exit 1
CMD ["python", "-m", "geometry_ai.service", "--weights", "weights"]