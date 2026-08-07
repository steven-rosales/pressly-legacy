import { Router, type RequestHandler } from 'express';
import { makeChangeProductionOrderResolutionController } from './change-production-order-resolution.controller.ts';
import type { ChangeProductionOrderResolution } from './change-production-order-resolution.port.ts';

export const makeChangeProductionOrderResolutionRoute = (input: {
  changeResolution: ChangeProductionOrderResolution;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  const controller = makeChangeProductionOrderResolutionController(input);
  router.put(
    '/production/locations/:locationId/orders/:productionOrderId/resolution',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
