import { Router, type RequestHandler } from 'express';
import {
  productionOrderParamsSchema,
  setProductionOrderPriorityRequestSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { SetProductionOrderPriority } from './set-production-order-priority.usecase.ts';
import { makeSetProductionOrderPriorityController } from './set-production-order-priority.controller.ts';

export const makeSetProductionOrderPriorityRoute = (input: {
  setPriority: SetProductionOrderPriority;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.patch(
    '/production/locations/:locationId/orders/:productionOrderId/priority',
    input.authenticate,
    validateRequest({
      params: productionOrderParamsSchema,
      body: setProductionOrderPriorityRequestSchema,
    }),
    input.authorize,
    makeSetProductionOrderPriorityController(input),
  );
  return router;
};
