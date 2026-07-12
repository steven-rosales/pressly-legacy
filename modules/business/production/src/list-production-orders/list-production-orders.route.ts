import {
  listProductionOrdersQuerySchema,
  productionLocationParamsSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import { makeListProductionOrdersController } from './list-production-orders.controller.ts';
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
    validateRequest({
      params: productionLocationParamsSchema,
      query: listProductionOrdersQuerySchema,
    }),
    input.authorize,
    makeListProductionOrdersController(input.listOrders),
  );
  return router;
};
