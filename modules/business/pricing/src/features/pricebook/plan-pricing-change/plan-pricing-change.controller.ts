import {
  defineRequestBoundary,
  sendValidatedApiResult,
} from '@pressly/http/express';
import { result } from '@pressly/kernel';
import type { RequestHandler } from 'express';
import { pricingChangeFailureToAppError } from '../../../foundations/adapters/http/pricing-change-failure/pricing-change-failure.adapter.ts';
import type { PricingChangeAuthor } from '../../../foundations/language/pricing-change/pricing-change.model.ts';
import {
  planPricingChangeContract,
  toPlanPricingChangeCommand,
  toPricingChangePlanResult,
} from './plan-pricing-change.contract.mapper.ts';
import type { PlanPricingChange } from './plan-pricing-change.usecase.ts';

export const planPricingChangeBoundary = defineRequestBoundary({
  body: planPricingChangeContract.body,
});

export type ReadPricingChangeAuthor = (
  response: Parameters<RequestHandler>[1],
) => PricingChangeAuthor;

export const makePlanPricingChangeController = (input: {
  planPricingChange: PlanPricingChange;
  readAuthor: ReadPricingChangeAuthor;
}): RequestHandler =>
  planPricingChangeBoundary.handler(async ({ body }, { response }) => {
    const plan = await input.planPricingChange(
      toPlanPricingChangeCommand(body, input.readAuthor(response)),
    );

    sendValidatedApiResult(
      response,
      result.mapError(pricingChangeFailureToAppError)(plan),
      {
        schema: planPricingChangeContract.response,
        present: toPricingChangePlanResult,
      },
    );
  });
