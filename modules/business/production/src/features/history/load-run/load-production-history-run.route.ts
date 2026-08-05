import { Router, type RequestHandler } from 'express';
import { makeLoadProductionHistoryRunController } from './load-production-history-run.controller.ts';
import type { LoadProductionHistoryRun } from './load-production-history-run.port.ts';

export const makeLoadProductionHistoryRunRoute = (input: {
  loadRun: LoadProductionHistoryRun;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  const controller = makeLoadProductionHistoryRunController(input);
  router.get(
    '/production/locations/:locationId/history/runs/:productionRunId',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
