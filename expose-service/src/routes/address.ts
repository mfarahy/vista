import { Router } from 'express';
import { searchAddressSuggestions } from '../external-services/location.js';
import { getQueryParam, sendError, errorMessage, asyncHandler } from '../lib/http.js';

export const addressRouter = Router();

addressRouter.get(
  '/api/address/suggestions',
  asyncHandler(async (req, res) => {
    const query = getQueryParam(req, 'q').trim();
    if (query.length < 3) return res.json([]);
    try {
      res.json(await searchAddressSuggestions(query));
    } catch (error) {
      sendError(res, 502, errorMessage(error, 'Address lookup could not be completed.'));
    }
  }),
);
