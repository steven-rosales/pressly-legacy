import { Router, type RequestHandler } from 'express';
import { makeListProductionOrderControlController } from './list-production-order-control.controller.ts';
import type { ListProductionOrderControlApplication } from './list-production-order-control.usecase.ts';

export const makeListProductionOrderControlRoute = (input: {
  list: ListProductionOrderControlApplication;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  const controller = makeListProductionOrderControlController(input.list);
  router.get(
    '/production/locations/:locationId/order-control',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
