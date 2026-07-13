import { Router, type RequestHandler } from 'express';
import {
  productionLocationParamsSchema,
  publishSchedulerConfigRequestSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { PublishSchedulerConfig } from './publish-scheduler-config.usecase.ts';
import { makePublishSchedulerConfigController } from './publish-scheduler-config.controller.ts';

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
    validateRequest({
      params: productionLocationParamsSchema,
      body: publishSchedulerConfigRequestSchema,
    }),
    input.authorize,
    makePublishSchedulerConfigController(input),
  );
  return router;
};
