import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import { apiFailure, apiSuccess } from '@pressly/http';
import type {
  PricingChangeAuthor,
  PricingChangeRequest,
} from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import type { PlanPricingChange } from '../../../features/publish-pricing/plan-pricing-change.usecase.ts';

export type ReadPricingChangeAuthor = (
  res: Parameters<RequestHandler>[1],
) => PricingChangeAuthor;

export const makePlanPricingChangeController = (input: {
  planPricingChange: PlanPricingChange;
  readAuthor: ReadPricingChangeAuthor;
}): RequestHandler =>
  catchAsync(async (req, res) => {
    const body = req.body as PricingChangeRequest;
    const requestedBy = input.readAuthor(res);
    const planResult = await input.planPricingChange({
      ...body,
      requestedBy,
    });

    if (result.isErr(planResult)) {
      res.status(planResult.error.status).json(apiFailure(planResult.error));
      return;
    }

    res.status(200).json(apiSuccess(planResult.value));
  });
