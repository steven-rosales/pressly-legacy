import { Router, type RequestHandler, type Response } from 'express';
import {
  listProductionLocationsBoundary,
  makeListProductionLocationsController,
} from './list-production-locations.controller.ts';
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
    listProductionLocationsBoundary.validate,
    makeListProductionLocationsController(input),
  );
  return router;
};
