import { Router, type RequestHandler } from 'express';
import type { SetProductionOrderPriority } from './set-production-order-priority.usecase.ts';
import {
  makeSetProductionOrderPriorityController,
  setProductionOrderPriorityBoundary,
} from './set-production-order-priority.controller.ts';

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
    setProductionOrderPriorityBoundary.validate,
    input.authorize,
    makeSetProductionOrderPriorityController(input),
  );
  return router;
};
