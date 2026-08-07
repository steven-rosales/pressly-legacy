import type * as pricing from '@pressly/db/schema/pricing';
import type { PricingChangePlan } from '../../../foundations/language/pricing-change/pricing-change.model.ts';

type PricingItemRow = typeof pricing.pricingItems.$inferSelect;

export const toReplacementPricingItems = (input: {
  currentItems: readonly PricingItemRow[];
  newPricingSetId: string;
  plan: PricingChangePlan;
  publishedAt: Date;
}) => {
  const newPriceByCode = new Map(
    input.plan.changes.map((item) => [item.code, item.newPriceCents]),
  );

  return input.currentItems.map((item) => ({
    pricingSetId: input.newPricingSetId,
    code: item.code,
    service: item.service,
    category: item.category,
    name: item.name,
    unit: item.unit,
    priceCents: newPriceByCode.get(item.code) ?? item.priceCents,
    sortOrder: item.sortOrder,
    metadata: item.metadata,
    createdAt: input.publishedAt,
    updatedAt: input.publishedAt,
  }));
};
