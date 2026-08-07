import { Router, type RequestHandler } from 'express';
import { makeListProductionHistoryRunsController } from './list-production-history-runs.controller.ts';
import type { ListProductionHistoryRuns } from './list-production-history-runs.port.ts';

export const makeListProductionHistoryRunsRoute = (input: {
  listRuns: ListProductionHistoryRuns;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  const controller = makeListProductionHistoryRunsController(input);
  router.get(
    '/production/locations/:locationId/history/runs',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
