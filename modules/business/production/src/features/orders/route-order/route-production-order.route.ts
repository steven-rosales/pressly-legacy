import { Router, type RequestHandler } from 'express';
import {
  commitProductionOrderRouteBoundary,
  makeCommitProductionOrderRouteController,
  makePreviewProductionOrderRouteController,
  previewProductionOrderRouteBoundary,
} from './route-production-order.controller.ts';
import type {
  CommitProductionOrderRoute,
  PreviewProductionOrderRoute,
} from './route-production-order.usecase.ts';

const orderRoutePath =
  '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route';

export const makeRouteProductionOrderRoutes = (input: {
  preview: PreviewProductionOrderRoute;
  commit: CommitProductionOrderRoute;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.post(
    `${orderRoutePath}/preview`,
    input.authenticate,
    previewProductionOrderRouteBoundary.validate,
    input.authorize,
    makePreviewProductionOrderRouteController(input),
  );
  router.post(
    orderRoutePath,
    input.authenticate,
    commitProductionOrderRouteBoundary.validate,
    input.authorize,
    makeCommitProductionOrderRouteController(input),
  );
  return router;
};
