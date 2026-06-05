import { Router, type RequestHandler, type Response } from 'express';
import {
  pricingChangeRequestSchema,
  type PricingChangeAuthor,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { PlanPricingChange } from '../../../features/publish-pricing/plan-pricing-change.usecase.ts';
import type { PublishPricingChange } from '../../../features/publish-pricing/publish-pricing-change.usecase.ts';
import { makePlanPricingChangeController } from './plan-pricing-change.controller.ts';
import { makePublishPricingChangeController } from './publish-pricing-change.controller.ts';

type PricingChangeAuthorizationInput = Readonly<{
  action: 'pricing:plan' | 'pricing:publish';
  roles: readonly ('owner' | 'admin')[];
  freshSessionMaxAgeMinutes?: number;
}>;

type ReadPricingChangeAuthor = (res: Response) => PricingChangeAuthor;

type PricingChangeRouteAuth = Readonly<{
  authenticate: RequestHandler;
  authorize: (input: PricingChangeAuthorizationInput) => RequestHandler;
  readAuthor: ReadPricingChangeAuthor;
  freshSessionMaxAgeMinutes: number;
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
    input.auth.authorize({
      action: 'pricing:plan',
      roles: ['owner', 'admin'],
    }),
    planPricingChangeController,
  );

  router.post(
    '/changes/publish',
    validate,
    input.auth.authenticate,
    input.auth.authorize({
      action: 'pricing:publish',
      roles: ['owner'],
      freshSessionMaxAgeMinutes: input.auth.freshSessionMaxAgeMinutes,
    }),
    publishPricingChangeController,
  );

  return router;
};
