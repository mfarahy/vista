import { Router } from 'express';
import { z } from 'zod';
import type { ScreenshotService } from '../lib/screenshot.js';
import { asyncHandler } from '../lib/http.js';
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
  // page, or a single element) and return the stored file path.
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
        path: result.path,
        url: result.url,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
      });
    }),
  );

  return router;
}
