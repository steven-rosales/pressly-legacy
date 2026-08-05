import { Router, type RequestHandler } from 'express';
import { makePreviewProductionOrderBacklogController } from './preview-production-order-backlog.controller.ts';
import type { PreviewProductionOrderBacklog } from './preview-production-order-backlog.port.ts';

export const makePreviewProductionOrderBacklogRoute = (input: {
  preview: PreviewProductionOrderBacklog;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();

  const controller = makePreviewProductionOrderBacklogController(input);
  router.post(
    '/production/locations/:locationId/order-backlog/preview',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );

  return router;
};
