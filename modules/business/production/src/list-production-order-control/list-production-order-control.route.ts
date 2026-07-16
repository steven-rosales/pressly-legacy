import {
  listProductionOrderControlQuerySchema,
  productionLocationParamsSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import { makeListProductionOrderControlController } from './list-production-order-control.controller.ts';
import type { ListProductionOrderControlApplication } from './list-production-order-control.usecase.ts';

export const makeListProductionOrderControlRoute = (input: {
  list: ListProductionOrderControlApplication;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  router.get(
    '/production/locations/:locationId/order-control',
    input.authenticate,
    validateRequest({
      params: productionLocationParamsSchema,
      query: listProductionOrderControlQuerySchema,
    }),
    input.authorize,
    makeListProductionOrderControlController(input.list),
  );
  return router;
};
