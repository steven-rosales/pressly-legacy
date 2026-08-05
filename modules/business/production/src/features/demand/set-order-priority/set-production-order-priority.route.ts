import { Router, type RequestHandler } from 'express';
import type { SetProductionOrderPriority } from './set-production-order-priority.port.ts';
import { makeSetProductionOrderPriorityController } from './set-production-order-priority.controller.ts';

export const makeSetProductionOrderPriorityRoute = (input: {
  setPriority: SetProductionOrderPriority;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  const controller = makeSetProductionOrderPriorityController(input);
  router.patch(
    '/production/locations/:locationId/orders/:productionOrderId/priority',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
