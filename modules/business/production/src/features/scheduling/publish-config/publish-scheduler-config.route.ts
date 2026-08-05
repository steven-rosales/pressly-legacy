import { Router, type RequestHandler } from 'express';
import type { PublishSchedulerConfig } from './publish-scheduler-config.port.ts';
import { makePublishSchedulerConfigController } from './publish-scheduler-config.controller.ts';

export const makePublishSchedulerConfigRoute = (input: {
  publish: PublishSchedulerConfig;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  const controller = makePublishSchedulerConfigController(input);
  router.post(
    '/production/locations/:locationId/scheduler-configs',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
