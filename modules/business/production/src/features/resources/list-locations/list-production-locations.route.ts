import { Router, type RequestHandler, type Response } from 'express';
import { makeListProductionLocationsController } from './list-production-locations.controller.ts';
import type { ListProductionLocations } from './list-production-locations.port.ts';

export const makeListProductionLocationsRoute = (input: {
  listLocations: ListProductionLocations;
  authenticate: RequestHandler;
  readAllowedLocationIds: (
    response: Response,
  ) => Promise<readonly string[] | null>;
}): Router => {
  const router = Router();
  const controller = makeListProductionLocationsController(input);
  router.get(
    '/production/locations',
    input.authenticate,
    controller.validate,
    controller.handle,
  );
  return router;
};
