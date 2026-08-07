import { Router, type RequestHandler } from 'express';
import {
  makePublishPricingChangeController,
  type ReadPricingChangeAuthor,
} from './publish-pricing-change.controller.ts';
import type { PublishPricingChange } from './publish-pricing-change.usecase.ts';

export type PublishPricingChangeRouteSecurity = Readonly<{
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readAuthor: ReadPricingChangeAuthor;
}>;

export const makePublishPricingChangeRoute = (input: {
  publishPricingChange: PublishPricingChange;
  security: PublishPricingChangeRouteSecurity;
}): Router => {
  const router = Router();
  const controller = makePublishPricingChangeController({
    publishPricingChange: input.publishPricingChange,
    readAuthor: input.security.readAuthor,
  });

  router.post(
    '/changes/publish',
    controller.validate,
    input.security.authenticate,
    input.security.authorize,
    controller.handle,
  );

  return router;
};
