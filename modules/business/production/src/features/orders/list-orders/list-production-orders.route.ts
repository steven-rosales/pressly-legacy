import { Router, type RequestHandler } from 'express';
import { makeListProductionOrdersController } from './list-production-orders.controller.ts';
import type { ListProductionOrders } from './list-production-orders.port.ts';

export const makeListProductionOrdersRoute = (input: {
  listOrders: ListProductionOrders;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  const controller = makeListProductionOrdersController(input.listOrders);
  router.get(
    '/production/locations/:locationId/orders',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
