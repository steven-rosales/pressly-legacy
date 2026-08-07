import { Router, type RequestHandler } from 'express';
import { makeListProductionHistoryActivityController } from './list-production-history-activity.controller.ts';
import type { ListProductionHistoryActivity } from './list-production-history-activity.port.ts';

export const makeListProductionHistoryActivityRoute = (input: {
  listActivity: ListProductionHistoryActivity;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  const controller = makeListProductionHistoryActivityController(input);
  router.get(
    '/production/locations/:locationId/history/activity',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
