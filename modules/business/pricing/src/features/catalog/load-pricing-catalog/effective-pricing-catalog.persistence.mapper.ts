import type * as pricing from '@pressly/db/schema/pricing';
import type {
  LoadPricingCatalogCommand,
  PricingCatalog,
} from './load-pricing-catalog.model.ts';

type PricingSetRow = typeof pricing.pricingSets.$inferSelect;
type PricingItemRow = typeof pricing.pricingItems.$inferSelect;

export const toPricingCatalog = (input: {
  command: LoadPricingCatalogCommand;
  activeSet: PricingSetRow;
  items: readonly PricingItemRow[];
}): PricingCatalog => ({
  serviceSlug: input.command.serviceSlug,
  currency: input.activeSet.currency,
  updatedAt: input.activeSet.updatedAt,
  items: input.items.map((item) => ({
    service: item.service,
    unit: item.unit,
    category: item.category,
    name: item.name,
    priceCents: item.priceCents,
    sortOrder: item.sortOrder,
    metadata: item.metadata,
  })),
});
