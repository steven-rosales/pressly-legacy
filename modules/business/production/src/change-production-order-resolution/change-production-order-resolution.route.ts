import {
  changeProductionOrderResolutionRequestSchema,
  productionOrderParamsSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import { makeChangeProductionOrderResolutionController } from './change-production-order-resolution.controller.ts';
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
    validateRequest({
      params: productionOrderParamsSchema,
      body: changeProductionOrderResolutionRequestSchema,
    }),
    input.authorize,
    makeChangeProductionOrderResolutionController(input),
  );
  return router;
};
