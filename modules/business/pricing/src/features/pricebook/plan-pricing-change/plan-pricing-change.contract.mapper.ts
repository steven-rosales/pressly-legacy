import {
  pricingChangePlanSchema,
  pricingChangeRequestSchema,
  type PricingChangePlan as PricingChangePlanResult,
  type PricingChangeRequest,
} from '@pressly/contracts/pricing';
import type {
  PricingChangeAuthor,
  PricingChangeCommand,
  PricingChangePlan,
} from '../../../foundations/language/pricing-change/pricing-change.model.ts';

export const planPricingChangeContract = Object.freeze({
  body: pricingChangeRequestSchema,
  response: pricingChangePlanSchema,
});

export const toPlanPricingChangeCommand = (
  request: PricingChangeRequest,
  requestedBy: PricingChangeAuthor,
): PricingChangeCommand => ({
  serviceSlug: request.serviceSlug,
  reason: request.reason,
  items: request.items,
  requestedBy,
});

export const toPricingChangePlanResult = (
  plan: PricingChangePlan,
): PricingChangePlanResult => ({
  serviceSlug: plan.serviceSlug,
  reason: plan.reason,
  oldPricingSetId: plan.oldPricingSetId,
  currency: plan.currency,
  changes: plan.changes.map((change) => ({
    code: change.code,
    name: change.name,
    oldPriceCents: change.oldPriceCents,
    newPriceCents: change.newPriceCents,
  })),
});
