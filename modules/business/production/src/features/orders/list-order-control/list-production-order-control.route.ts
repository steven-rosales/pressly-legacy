import { Router, type RequestHandler } from 'express';
import {
  listProductionOrderControlBoundary,
  makeListProductionOrderControlController,
} from './list-production-order-control.controller.ts';
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
    listProductionOrderControlBoundary.validate,
    input.authorize,
    makeListProductionOrderControlController(input.list),
  );
  return router;
};
