import type * as pricing from '@pressly/db/schema/pricing';
import type {
  CurrentPricing,
  PricingChangePlan,
} from '../../../language/pricing-change/pricing-change.model.ts';

type PricingSetRow = typeof pricing.pricingSets.$inferSelect;
type PricingItemRow = typeof pricing.pricingItems.$inferSelect;

export const toCurrentPricing = (
  currentSet: PricingSetRow,
  currentItems: readonly PricingItemRow[],
): CurrentPricing => ({
  currentSet: {
    id: currentSet.id,
    currency: currentSet.currency,
  },
  currentItems: currentItems.map((item) => ({
    code: item.code,
    name: item.name,
    priceCents: item.priceCents,
  })),
});

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
