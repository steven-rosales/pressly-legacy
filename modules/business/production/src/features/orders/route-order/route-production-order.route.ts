import { Router, type RequestHandler } from 'express';
import {
  makeCommitProductionOrderRouteController,
  makePreviewProductionOrderRouteController,
} from './route-production-order.controller.ts';
import type {
  CommitProductionOrderRoute,
  PreviewProductionOrderRoute,
} from './route-production-order.port.ts';

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
  const previewController = makePreviewProductionOrderRouteController(input);
  const commitController = makeCommitProductionOrderRouteController(input);
  router.post(
    `${orderRoutePath}/preview`,
    input.authenticate,
    previewController.validate,
    input.authorize,
    previewController.handle,
  );
  router.post(
    orderRoutePath,
    input.authenticate,
    commitController.validate,
    input.authorize,
    commitController.handle,
  );
  return router;
};
