import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { ScreenshotService } from '../lib/screenshot.js';
import { servedFilePath } from '../lib/screenshot.js';
import { asyncHandler, sendError } from '../lib/http.js';
import { getLogger } from '../lib/logger.js';

const screenshotBody = z.object({
  url: z.string().min(1).optional(),
  selector: z.string().min(1).optional(),
  fullPage: z.boolean().optional(),
});

export function screenshotsRouter(screenshot: ScreenshotService): Router {
  const router = Router();
  const log = getLogger();

  // POST /screenshot — capture a screenshot of the Vista app (viewport, full
  // page, or a single element) and return a file reference. The `filename` is
  // safe for an external caller to retrieve via GET /screenshot/:filename.
  router.post(
    '/screenshot',
    asyncHandler(async (req, res) => {
      const body = screenshotBody.parse(req.body);
      const result = await screenshot.capture({
        url: body.url || '/',
        selector: body.selector,
        fullPage: body.fullPage,
      });
      log.info(
        { url: result.url, path: result.path, bytes: result.bytes, width: result.width },
        'Screenshot captured',
      );
      res.json({
        status: 'ok',
        format: result.format,
        filename: result.filename,
        path: result.path,
        url: result.url,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
      });
    }),
  );

  // GET /screenshot/:filename — serve a previously captured PNG safely. Only
  // files inside the configured screenshot directory are reachable; path
  // traversal is rejected and the correct image content type is returned.
  router.get(
    '/screenshot/:filename',
    asyncHandler(async (req, res) => {
      const filename = Array.isArray(req.params.filename)
        ? req.params.filename[0]
        : req.params.filename;
      const filePath = filename ? servedFilePath(screenshot.dir, filename) : null;
      if (!filePath) {
        sendError(res, 400, 'Invalid screenshot filename');
        return;
      }
      let data: Buffer;
      try {
        data = await readFile(filePath);
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          (error as { code?: unknown }).code === 'ENOENT'
        ) {
          sendError(res, 404, 'Screenshot not found');
          return;
        }
        throw error;
      }
      res.setHeader('content-type', 'image/png');
      res.setHeader('content-length', String(data.byteLength));
      res.setHeader('cache-control', 'private, max-age=3600');
      res.send(data);
    }),
  );

  return router;
}
