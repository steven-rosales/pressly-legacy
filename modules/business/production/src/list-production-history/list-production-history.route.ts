import {
  listProductionHistoryActivityQuerySchema,
  listProductionHistoryPlansQuerySchema,
  listProductionHistoryRunsQuerySchema,
  productionHistoryLocationParamsSchema,
  productionHistoryRunParamsSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import {
  makeListProductionHistoryActivityController,
  makeListProductionHistoryPlansController,
  makeListProductionHistoryRunsController,
  makeLoadProductionHistoryRunController,
} from './list-production-history.controller.ts';
import type { ProductionHistoryApplication } from './list-production-history.usecase.ts';

export const makeListProductionHistoryRoute = (input: {
  history: ProductionHistoryApplication;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();

  router.get(
    '/production/locations/:locationId/history/runs',
    input.authenticate,
    validateRequest({
      params: productionHistoryLocationParamsSchema,
      query: listProductionHistoryRunsQuerySchema,
    }),
    input.authorize,
    makeListProductionHistoryRunsController(input.history),
  );
  router.get(
    '/production/locations/:locationId/history/runs/:productionRunId',
    input.authenticate,
    validateRequest({ params: productionHistoryRunParamsSchema }),
    input.authorize,
    makeLoadProductionHistoryRunController(input.history),
  );
  router.get(
    '/production/locations/:locationId/history/activity',
    input.authenticate,
    validateRequest({
      params: productionHistoryLocationParamsSchema,
      query: listProductionHistoryActivityQuerySchema,
    }),
    input.authorize,
    makeListProductionHistoryActivityController(input.history),
  );
  router.get(
    '/production/locations/:locationId/history/plans',
    input.authenticate,
    validateRequest({
      params: productionHistoryLocationParamsSchema,
      query: listProductionHistoryPlansQuerySchema,
    }),
    input.authorize,
    makeListProductionHistoryPlansController(input.history),
  );

  return router;
};
