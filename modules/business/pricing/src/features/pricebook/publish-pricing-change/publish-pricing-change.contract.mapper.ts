import {
  pricingChangeRequestSchema,
  publishPricingChangeResultSchema,
  type PricingChangeRequest,
  type PublishPricingChangeResult,
} from '@pressly/contracts/pricing';
import type {
  PricingChangeAuthor,
  PricingChangeCommand,
  PublishedPricingChange,
} from '../../../foundations/language/pricing-change/pricing-change.model.ts';

export const publishPricingChangeContract = Object.freeze({
  body: pricingChangeRequestSchema,
  response: publishPricingChangeResultSchema,
});

export const toPublishPricingChangeCommand = (
  request: PricingChangeRequest,
  requestedBy: PricingChangeAuthor,
): PricingChangeCommand => ({
  serviceSlug: request.serviceSlug,
  reason: request.reason,
  items: request.items,
  requestedBy,
});

export const toPublishPricingChangeResult = (
  published: PublishedPricingChange,
): PublishPricingChangeResult => ({
  oldPricingSetId: published.oldPricingSetId,
  newPricingSetId: published.newPricingSetId,
  auditEventId: published.auditEventId,
  changeItemCount: published.changeItemCount,
});
