import { Router, type RequestHandler } from 'express';
import {
  commitProductionOrderBacklogBoundary,
  makeCommitProductionOrderBacklogController,
  makePreviewProductionOrderBacklogController,
  previewProductionOrderBacklogBoundary,
} from './review-production-order-backlog.controller.ts';
import type {
  CommitProductionOrderBacklog,
  PreviewProductionOrderBacklog,
} from './review-production-order-backlog.usecase.ts';

const backlogPath = '/production/locations/:locationId/order-backlog';

export const makeReviewProductionOrderBacklogRoutes = (input: {
  preview: PreviewProductionOrderBacklog;
  commit: CommitProductionOrderBacklog;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.post(
    `${backlogPath}/preview`,
    input.authenticate,
    previewProductionOrderBacklogBoundary.validate,
    input.authorize,
    makePreviewProductionOrderBacklogController(input),
  );
  router.post(
    backlogPath,
    input.authenticate,
    commitProductionOrderBacklogBoundary.validate,
    input.authorize,
    makeCommitProductionOrderBacklogController(input),
  );
  return router;
};
