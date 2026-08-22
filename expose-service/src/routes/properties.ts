import { Router } from 'express';

import {
  createProperty,
  listProperties,
  getProperty,
  updateProperty,
  setCover,
  reorderImages,
  saveExpose,
  saveExposeConfiguration,
  getExposeConfiguration,
  saveLocationIntelligence,
  saveLocationResearch,
  saveBorisEnrichment,
} from '../lib/store.js';
import { propertySchema, exposeContentSchema } from '../lib/validation.js';
import {
  defaultExposeConfiguration,
  exposeConfigurationSchema,
} from '../lib/expose-configuration.js';
import { generateExposeContent, generateMetadata } from '../external-services/ai.js';
import { createManualLocation, resolveLocation } from '../lib/location-service.js';
import { enrichAddressWithBoris } from '../lib/boris-service.js';
import type { PropertyPayload } from '../lib/types.js';
import { researchLocation } from '../mastra/agents/location-research-agent.js';
import { locationResearchInputSchema } from '../mastra/schemas/location-research.js';
import { getParam, loadProperty, sendError, errorMessage, asyncHandler } from '../lib/http.js';
import { getLogger } from '../lib/logger.js';
import { upload, isAllowedImageMime, MAX_IMAGE_BYTES, IMAGE_CATEGORIES } from '../lib/upload.js';
import { exposeHTML } from '../lib/expose-template.js';
import { persistImages, removeImageRecord } from '../services/image-files.js';
import {
  contentDispositionHeader,
  pdfFileName,
  renderExposePdf,
  type RenderPdfFunction,
} from '../services/pdf.js';
import { createDemoProperty } from '../services/demo.js';
import {
  generateMarketingContent,
  InsufficientPropertyInfoError,
} from '../lib/marketing-content/service.js';

export interface PropertiesRouterOptions {
  /** Injectable PDF renderer; defaults to the Playwright implementation. */
  renderPdf?: RenderPdfFunction;
}

export function propertiesRouter(options: PropertiesRouterOptions = {}): Router {
  const propertiesRouter = Router();
  const renderPdf = options.renderPdf ?? renderExposePdf;

  propertiesRouter.get(
    '/api/properties',
    asyncHandler(async (_req, res) => {
      res.json(await listProperties());
    }),
  );

  propertiesRouter.post(
    '/api/properties',
    asyncHandler(async (_req, res) => {
      const property = await createProperty();
      res.status(201).json(property);
    }),
  );

  propertiesRouter.get(
    '/api/properties/:id',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      res.json(property);
    }),
  );

  propertiesRouter.put(
    '/api/properties/:id',
    asyncHandler(async (req, res) => {
      try {
        const payload = propertySchema.parse(req.body) as PropertyPayload;
        const property = await updateProperty(getParam(req, 'id'), payload);
        if (!property) return sendError(res, 404, 'Not found');
        res.json(property);
      } catch (error) {
        sendError(res, 400, errorMessage(error, 'Invalid request'));
      }
    }),
  );

  propertiesRouter.get(
    '/api/properties/:id/expose',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      res.json(property.expose ?? null);
    }),
  );

  propertiesRouter.put(
    '/api/properties/:id/expose',
    asyncHandler(async (req, res) => {
      try {
        const content = exposeContentSchema.parse(req.body);
        const expose = await saveExpose(getParam(req, 'id'), content);
        if (!expose) return sendError(res, 404, 'Not found');
        res.json(expose);
      } catch (error) {
        sendError(res, 400, errorMessage(error, 'Invalid content'));
      }
    }),
  );

  propertiesRouter.get(
    '/api/properties/:id/expose/configuration',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      const configuration = await getExposeConfiguration(property.id);
      res.json(configuration ?? defaultExposeConfiguration());
    }),
  );

  propertiesRouter.put(
    '/api/properties/:id/expose/configuration',
    asyncHandler(async (req, res) => {
      try {
        const configuration = exposeConfigurationSchema.parse(req.body);
        const saved = await saveExposeConfiguration(getParam(req, 'id'), configuration);
        if (!saved) return sendError(res, 404, 'Not found');
        res.json(saved);
      } catch (error) {
        sendError(res, 400, errorMessage(error, 'Invalid expose configuration'));
      }
    }),
  );

  propertiesRouter.post(
    '/api/properties/:id/ai/metadata',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      try {
        res.json(await generateMetadata(property));
      } catch (error) {
        sendError(res, 502, errorMessage(error, 'AI could not generate the metadata'));
      }
    }),
  );

  propertiesRouter.post(
    '/api/properties/:id/ai/improve',
    asyncHandler(async (req, res) => {
      let property = await loadProperty(req, res);
      if (!property) return;

      const action = typeof req.body?.action === 'string' ? `Aktion: ${req.body.action}` : '';
      try {
        const location = await resolveLocation(property);
        if (location.intelligence) {
          await saveLocationIntelligence(property.id, location.intelligence);
          property = (await getProperty(property.id)) || property;
        }
        const content = await generateExposeContent(property, action);
        await saveExpose(property.id, content);
        res.json(content);
      } catch (error) {
        sendError(res, 502, errorMessage(error, 'AI could not respond'));
      }
    }),
  );

  propertiesRouter.post(
    '/api/properties/:id/marketing-content/generate',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      try {
        const content = await generateMarketingContent(property);
        res.json(content);
      } catch (error) {
        if (error instanceof InsufficientPropertyInfoError) {
          return sendError(res, 422, error.message);
        }
        sendError(res, 502, errorMessage(error, 'Der Exposé-Inhalt konnte nicht erzeugt werden.'));
      }
    }),
  );

  propertiesRouter.get(
    '/api/properties/:id/location',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      res.json(property.exposeData?.location.intelligence || null);
    }),
  );

  propertiesRouter.post(
    '/api/properties/:id/location',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      const body = (req.body || {}) as {
        refresh?: boolean;
        latitude?: number;
        longitude?: number;
        radiusMeters?: number;
      };
      try {
        const hasCoords = body.latitude !== undefined || body.longitude !== undefined;
        if (hasCoords) {
          const { latitude, longitude } = body;
          if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            Number(latitude) < -90 ||
            Number(latitude) > 90 ||
            Number(longitude) < -180 ||
            Number(longitude) > 180
          ) {
            return sendError(res, 400, 'Coordinates are invalid.');
          }
        }
        const intelligence =
          Number.isFinite(body.latitude) && Number.isFinite(body.longitude)
            ? await createManualLocation(
                property,
                { latitude: Number(body.latitude), longitude: Number(body.longitude) },
                { radiusMeters: body.radiusMeters },
              )
            : (
                await resolveLocation(property, {
                  refresh: body.refresh,
                  radiusMeters: body.radiusMeters,
                })
              ).intelligence;
        if (!intelligence) return sendError(res, 422, 'Location could not be resolved.');
        const saved = await saveLocationIntelligence(property.id, intelligence);
        res.json(saved?.exposeData?.location.intelligence || intelligence);
      } catch (error) {
        sendError(res, 502, errorMessage(error, 'Location could not be resolved.'));
      }
    }),
  );

  propertiesRouter.post(
    '/api/properties/:id/location/refresh',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      try {
        const result = await resolveLocation(property, { refresh: true });
        if (!result.intelligence)
          return sendError(res, 422, result.error || 'Location could not be resolved.');
        const saved = await saveLocationIntelligence(property.id, result.intelligence);
        res.json(saved?.exposeData?.location.intelligence || result.intelligence);
      } catch (error) {
        sendError(res, 502, errorMessage(error, 'Location could not be resolved.'));
      }
    }),
  );

  propertiesRouter.get(
    '/api/properties/:id/location/research',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      res.json(property.exposeData?.location.research || null);
    }),
  );

  propertiesRouter.post(
    '/api/properties/:id/location/research',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      const address = property.exposeData?.location.address;
      if (!address?.city || !address.postalCode) {
        return sendError(res, 422, 'A city and postal code are required for location research.');
      }
      try {
        const input = locationResearchInputSchema.parse({
          propertyId: property.id,
          address: [address.street, address.houseNumber, address.postalCode, address.city]
            .filter(Boolean)
            .join(' '),
          city: address.city,
          district: property.exposeData?.location.district || address.district || undefined,
          neighborhood: property.exposeData?.location.neighborhood || undefined,
          postalCode: address.postalCode,
          country: address.country,
          latitude: property.exposeData?.location.latitude ?? undefined,
          longitude: property.exposeData?.location.longitude ?? undefined,
        });
        const research = await researchLocation(input, { refresh: req.body?.refresh === true });
        const saved = await saveLocationResearch(property.id, research);
        res.json(saved?.exposeData?.location.research || research);
      } catch (error) {
        sendError(res, 502, errorMessage(error, 'Location research could not be completed.'));
      }
    }),
  );

  propertiesRouter.post(
    '/api/properties/:id/location/boris',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      const body = (req.body || {}) as { latitude?: number; longitude?: number };
      const latitude = Number.isFinite(body.latitude)
        ? Number(body.latitude)
        : property.exposeData?.location.latitude;
      const longitude = Number.isFinite(body.longitude)
        ? Number(body.longitude)
        : property.exposeData?.location.longitude;
      // BORIS is an optional enrichment source: missing coordinates or any error just
      // reports "not available" and never blocks the address flow.
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
        return res.json({ available: false });
      const enrichment = await enrichAddressWithBoris({
        latitude: latitude as number,
        longitude: longitude as number,
      });
      const saved = await saveBorisEnrichment(property.id, enrichment);
      res.json(saved?.exposeData?.location.boris || enrichment || { available: false });
    }),
  );

  propertiesRouter.post(
    '/api/properties/:id/images',
    upload.array('files'),
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;

      const files = Array.isArray(req.files) ? req.files : [];
      const category = typeof req.body?.category === 'string' ? req.body.category : '';
      const subcategory = typeof req.body?.subcategory === 'string' ? req.body.subcategory : null;
      const caption = typeof req.body?.caption === 'string' ? req.body.caption : null;

      if (!(IMAGE_CATEGORIES as readonly string[]).includes(category)) {
        return sendError(res, 400, 'A semantic image category is required');
      }
      if (!files.length) return sendError(res, 400, 'No images found');
      for (const file of files) {
        if (!isAllowedImageMime(file.mimetype))
          return sendError(res, 400, 'Only JPG, PNG and WEBP are supported');
        if (file.size > MAX_IMAGE_BYTES) return sendError(res, 400, 'Images may be up to 15 MB');
      }

      const hasCover = property.images.some((image) => image.isCover);
      const images = await persistImages(
        property.id,
        files,
        {
          category: category as 'exterior' | 'interior' | 'floor_plan' | 'document',
          subcategory,
          caption,
        },
        hasCover,
      );
      res.status(201).json(images);
    }),
  );

  propertiesRouter.delete(
    '/api/properties/:id/images/:imageId',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      const imageId = getParam(req, 'imageId');
      const image = property.images.find((item) => item.id === imageId);
      if (!image) return sendError(res, 404, 'Not found');
      await removeImageRecord(property.id, imageId);
      res.json({ ok: true });
    }),
  );

  propertiesRouter.put(
    '/api/properties/:id/images/:imageId',
    asyncHandler(async (req, res) => {
      if (!req.body?.cover) return sendError(res, 400, 'Invalid action');
      const property = await setCover(getParam(req, 'id'), getParam(req, 'imageId'));
      if (!property) return sendError(res, 404, 'Not found');
      res.json(property.images);
    }),
  );

  propertiesRouter.put(
    '/api/properties/:id/images/reorder',
    asyncHandler(async (req, res) => {
      const property = await reorderImages(
        getParam(req, 'id'),
        Array.isArray(req.body?.imageIds) ? req.body.imageIds : [],
      );
      if (!property) return sendError(res, 404, 'Not found');
      res.json(property.images);
    }),
  );

  propertiesRouter.get(
    '/api/properties/:id/html',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      if (!property?.expose?.content) return sendError(res, 400, 'Please generate content first');
      res.type('html').send(await exposeHTML(property, property.expose.content));
    }),
  );

  propertiesRouter.post(
    '/api/properties/:id/pdf',
    asyncHandler(async (req, res) => {
      const property = await loadProperty(req, res);
      if (!property) return;
      try {
        const pdf = await renderPdf(property.id);
        res.set('Content-Disposition', contentDispositionHeader(pdfFileName(property)));
        res.type('application/pdf').send(pdf);
      } catch (error) {
        getLogger().error(
          { err: error, propertyId: property.id },
          'PDF render failed for property {propertyId}',
        );
        sendError(res, 502, 'Das PDF konnte nicht erstellt werden. Bitte versuchen Sie es erneut.');
      }
    }),
  );

  propertiesRouter.post(
    '/api/demo',
    asyncHandler(async (_req, res) => {
      const id = await createDemoProperty();
      res.status(201).json({ id });
    }),
  );

  return propertiesRouter;
}
