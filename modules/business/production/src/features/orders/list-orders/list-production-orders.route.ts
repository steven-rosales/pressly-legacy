import { Router, type RequestHandler } from 'express';
import {
  listProductionOrdersBoundary,
  makeListProductionOrdersController,
} from './list-production-orders.controller.ts';
import type { ListProductionOrders } from './list-production-orders.usecase.ts';

export const makeListProductionOrdersRoute = (input: {
  listOrders: ListProductionOrders;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  router.get(
    '/production/locations/:locationId/orders',
    input.authenticate,
    listProductionOrdersBoundary.validate,
    input.authorize,
    makeListProductionOrdersController(input.listOrders),
  );
  return router;
};
