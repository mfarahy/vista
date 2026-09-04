# Minimal production image for the thin Node.js API layer.
# Real Raster2Seq inference still needs Linux + CUDA (see README); the
# container defaults to RASTER2SEQ_MOCK=true so the full stack (API +
# Cloudflare Tunnel) runs anywhere. GPU hosts can extend this image or run
# the API natively with RASTER2SEQ_MOCK=false.
FROM node:22-alpine

WORKDIR /app

COPY api/package*.json ./api/
RUN npm ci --omit=dev --prefix ./api

COPY api/server.js ./api/
COPY inference ./inference
COPY samples ./samples

ENV NODE_ENV=production \
    PORT=3000 \
    RASTER2SEQ_MOCK=true

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "api/server.js"]
