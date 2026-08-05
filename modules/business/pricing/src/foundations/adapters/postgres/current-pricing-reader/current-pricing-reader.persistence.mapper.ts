import type * as pricing from '@pressly/db/schema/pricing';
import type { CurrentPricing } from '../../../language/pricing-change/pricing-change.model.ts';

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
