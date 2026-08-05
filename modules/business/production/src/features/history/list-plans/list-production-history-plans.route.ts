import { Router, type RequestHandler } from 'express';
import { makeListProductionHistoryPlansController } from './list-production-history-plans.controller.ts';
import type { ListProductionHistoryPlans } from './list-production-history-plans.port.ts';

export const makeListProductionHistoryPlansRoute = (input: {
  listPlans: ListProductionHistoryPlans;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  const controller = makeListProductionHistoryPlansController(input);
  router.get(
    '/production/locations/:locationId/history/plans',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
