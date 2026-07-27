import {
  commitProductionOrderBacklogRequestSchema,
  previewProductionOrderBacklogRequestSchema,
  productionLocationParamsSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import {
  makeCommitProductionOrderBacklogController,
  makePreviewProductionOrderBacklogController,
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
    validateRequest({
      params: productionLocationParamsSchema,
      body: previewProductionOrderBacklogRequestSchema,
    }),
    input.authorize,
    makePreviewProductionOrderBacklogController(input),
  );
  router.post(
    backlogPath,
    input.authenticate,
    validateRequest({
      params: productionLocationParamsSchema,
      body: commitProductionOrderBacklogRequestSchema,
    }),
    input.authorize,
    makeCommitProductionOrderBacklogController(input),
  );
  return router;
};
