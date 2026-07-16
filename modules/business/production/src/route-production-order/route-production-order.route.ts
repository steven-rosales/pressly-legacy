import {
  commitProductionOrderRouteRequestSchema,
  previewProductionOrderRouteRequestSchema,
  productionOrderRoutingParamsSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import {
  makeCommitProductionOrderRouteController,
  makePreviewProductionOrderRouteController,
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
    validateRequest({
      params: productionOrderRoutingParamsSchema,
      body: previewProductionOrderRouteRequestSchema,
    }),
    input.authorize,
    makePreviewProductionOrderRouteController(input),
  );
  router.post(
    orderRoutePath,
    input.authenticate,
    validateRequest({
      params: productionOrderRoutingParamsSchema,
      body: commitProductionOrderRouteRequestSchema,
    }),
    input.authorize,
    makeCommitProductionOrderRouteController(input),
  );
  return router;
};
