import { Router, type RequestHandler } from 'express';
import {
  listProductionHistoryRunsBoundary,
  makeListProductionHistoryRunsController,
} from './list-production-history-runs.controller.ts';
import type { ListProductionHistoryRuns } from './list-production-history-runs.usecase.ts';

export const makeListProductionHistoryRunsRoute = (input: {
  listRuns: ListProductionHistoryRuns;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  router.get(
    '/production/locations/:locationId/history/runs',
    input.authenticate,
    listProductionHistoryRunsBoundary.validate,
    input.authorize,
    makeListProductionHistoryRunsController(input),
  );
  return router;
};
