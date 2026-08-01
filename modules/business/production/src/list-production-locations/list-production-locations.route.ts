import { listProductionLocationsQuerySchema } from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler, type Response } from 'express';
import { makeListProductionLocationsController } from './list-production-locations.controller.ts';
import type { ListProductionLocations } from './list-production-locations.usecase.ts';

export const makeListProductionLocationsRoute = (input: {
  listLocations: ListProductionLocations;
  authenticate: RequestHandler;
  readAllowedLocationIds: (
    response: Response,
  ) => Promise<readonly string[] | null>;
}): Router => {
  const router = Router();
  router.get(
    '/production/locations',
    input.authenticate,
    validateRequest({ query: listProductionLocationsQuerySchema }),
    makeListProductionLocationsController(input),
  );
  return router;
};
