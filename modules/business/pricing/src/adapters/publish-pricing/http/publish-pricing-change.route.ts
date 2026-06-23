import { Router, type RequestHandler } from 'express';
import { pricingChangeRequestSchema } from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { PlanPricingChange } from '../../../features/publish-pricing/plan-pricing-change.usecase.ts';
import type { PublishPricingChange } from '../../../features/publish-pricing/publish-pricing-change.usecase.ts';
import {
  makePlanPricingChangeController,
  type ReadPricingChangeAuthor,
} from './plan-pricing-change.controller.ts';
import { makePublishPricingChangeController } from './publish-pricing-change.controller.ts';

type PricingChangeRouteAuth = Readonly<{
  authenticate: RequestHandler;
  planPricingChange: RequestHandler;
  publishPricingChange: RequestHandler;
  readAuthor: ReadPricingChangeAuthor;
}>;

export const makePublishPricingChangeRoute = (input: {
  planPricingChange: PlanPricingChange;
  publishPricingChange: PublishPricingChange;
  auth: PricingChangeRouteAuth;
}): Router => {
  const router = Router();
  const validate = validateRequest({ body: pricingChangeRequestSchema });
  const planPricingChangeController = makePlanPricingChangeController({
    planPricingChange: input.planPricingChange,
    readAuthor: input.auth.readAuthor,
  });
  const publishPricingChangeController = makePublishPricingChangeController({
    publishPricingChange: input.publishPricingChange,
    readAuthor: input.auth.readAuthor,
  });

  router.post(
    '/changes/plan',
    validate,
    input.auth.authenticate,
    input.auth.planPricingChange,
    planPricingChangeController,
  );

  router.post(
    '/changes/publish',
    validate,
    input.auth.authenticate,
    input.auth.publishPricingChange,
    publishPricingChangeController,
  );

  return router;
};
