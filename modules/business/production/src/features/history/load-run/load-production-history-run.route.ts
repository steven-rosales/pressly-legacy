import { Router, type RequestHandler } from 'express';
import {
  loadProductionHistoryRunBoundary,
  makeLoadProductionHistoryRunController,
} from './load-production-history-run.controller.ts';
import type { LoadProductionHistoryRun } from './load-production-history-run.usecase.ts';

export const makeLoadProductionHistoryRunRoute = (input: {
  loadRun: LoadProductionHistoryRun;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  router.get(
    '/production/locations/:locationId/history/runs/:productionRunId',
    input.authenticate,
    loadProductionHistoryRunBoundary.validate,
    input.authorize,
    makeLoadProductionHistoryRunController(input),
  );
  return router;
};
