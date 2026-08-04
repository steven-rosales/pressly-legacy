import { Router, type RequestHandler } from 'express';
import {
  changeProductionOrderResolutionBoundary,
  makeChangeProductionOrderResolutionController,
} from './change-production-order-resolution.controller.ts';
import type { ChangeProductionOrderResolution } from './change-production-order-resolution.usecase.ts';

export const makeChangeProductionOrderResolutionRoute = (input: {
  changeResolution: ChangeProductionOrderResolution;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.put(
    '/production/locations/:locationId/orders/:productionOrderId/resolution',
    input.authenticate,
    changeProductionOrderResolutionBoundary.validate,
    input.authorize,
    makeChangeProductionOrderResolutionController(input),
  );
  return router;
};
