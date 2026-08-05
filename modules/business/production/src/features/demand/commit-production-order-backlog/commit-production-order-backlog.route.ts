import { Router, type RequestHandler } from 'express';
import { makeCommitProductionOrderBacklogController } from './commit-production-order-backlog.controller.ts';
import type { CommitProductionOrderBacklog } from './commit-production-order-backlog.port.ts';

export const makeCommitProductionOrderBacklogRoute = (input: {
  commit: CommitProductionOrderBacklog;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  const controller = makeCommitProductionOrderBacklogController(input);
  router.post(
    '/production/locations/:locationId/order-backlog',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
