import { Router, type RequestHandler } from 'express';
import {
  listProductionHistoryPlansBoundary,
  makeListProductionHistoryPlansController,
} from './list-production-history-plans.controller.ts';
import type { ListProductionHistoryPlans } from './list-production-history-plans.usecase.ts';

export const makeListProductionHistoryPlansRoute = (input: {
  listPlans: ListProductionHistoryPlans;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  router.get(
    '/production/locations/:locationId/history/plans',
    input.authenticate,
    listProductionHistoryPlansBoundary.validate,
    input.authorize,
    makeListProductionHistoryPlansController(input),
  );
  return router;
};
