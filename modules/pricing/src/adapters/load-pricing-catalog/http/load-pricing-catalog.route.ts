import { Router, type RequestHandler } from 'express';
import { pricingParamsRequestSchema } from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { LoadPricingCatalog } from '../../../features/load-pricing-catalog/load-pricing-catalog.usecase.ts';
import { makeLoadPricingCatalogController } from './load-pricing-catalog.controller.ts';

type LoadPricingCatalogAuthorizationInput = Readonly<{
  action: 'pricing:read';
  roles: readonly ('owner' | 'admin')[];
}>;

type LoadPricingCatalogRouteAuth = Readonly<{
  authenticate: RequestHandler;
  authorize: (input: LoadPricingCatalogAuthorizationInput) => RequestHandler;
}>;

export const makeLoadPricingCatalogRoute = (input: {
  loadPricingCatalog: LoadPricingCatalog;
  auth: LoadPricingCatalogRouteAuth;
}): Router => {
  const router = Router();
  const validate = validateRequest({ params: pricingParamsRequestSchema });
  const authorizePricingRead = input.auth.authorize({
    action: 'pricing:read',
    roles: ['owner', 'admin'],
  });
  const controller = makeLoadPricingCatalogController(input.loadPricingCatalog);

  router.get(
    '/services/:serviceSlug/pricing',
    validate,
    input.auth.authenticate,
    authorizePricingRead,
    controller,
  );

  router.get(
    '/locations/:locationSlug/services/:serviceSlug/pricing',
    validate,
    input.auth.authenticate,
    authorizePricingRead,
    controller,
  );

  return router;
};
