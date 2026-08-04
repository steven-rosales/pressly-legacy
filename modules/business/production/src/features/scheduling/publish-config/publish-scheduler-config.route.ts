import { Router, type RequestHandler } from 'express';
import type { PublishSchedulerConfig } from './publish-scheduler-config.usecase.ts';
import {
  makePublishSchedulerConfigController,
  publishSchedulerConfigBoundary,
} from './publish-scheduler-config.controller.ts';

export const makePublishSchedulerConfigRoute = (input: {
  publish: PublishSchedulerConfig;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.post(
    '/production/locations/:locationId/scheduler-configs',
    input.authenticate,
    publishSchedulerConfigBoundary.validate,
    input.authorize,
    makePublishSchedulerConfigController(input),
  );
  return router;
};
