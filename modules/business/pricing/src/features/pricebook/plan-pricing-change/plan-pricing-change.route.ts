import { Router, type RequestHandler } from 'express';
import {
  makePlanPricingChangeController,
  type ReadPricingChangeAuthor,
} from './plan-pricing-change.controller.ts';
import type { PlanPricingChange } from './plan-pricing-change.usecase.ts';

export type PlanPricingChangeRouteSecurity = Readonly<{
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readAuthor: ReadPricingChangeAuthor;
}>;

export const makePlanPricingChangeRoute = (input: {
  planPricingChange: PlanPricingChange;
  security: PlanPricingChangeRouteSecurity;
}): Router => {
  const router = Router();
  const controller = makePlanPricingChangeController({
    planPricingChange: input.planPricingChange,
    readAuthor: input.security.readAuthor,
  });

  router.post(
    '/changes/plan',
    controller.validate,
    input.security.authenticate,
    input.security.authorize,
    controller.handle,
  );

  return router;
};
