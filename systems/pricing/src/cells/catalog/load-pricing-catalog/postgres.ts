import type { PostgresDatabase } from '@pressly/postgres/client';
import {
  and,
  desc,
  eq,
  gt,
  isNull,
  lte,
  or,
  sql,
} from '@pressly/postgres/query';
import type { PricingSchema } from '../../../schema/pricing.ts';
import type { LoadPricingCatalogRepository } from './types.ts';

export const makeLoadPricingCatalogPostgresRepository = (
  database: PostgresDatabase,
  pricing: Pick<
    PricingSchema,
    'pricingItems' | 'pricingServices' | 'pricingSets'
  >,
): LoadPricingCatalogRepository =>
  async function loadPricingCatalog(query) {
    const [service] = await database
      .select()
      .from(pricing.pricingServices)
      .where(
        and(
          eq(pricing.pricingServices.slug, query.serviceSlug),
          eq(pricing.pricingServices.isActive, true),
        ),
      )
      .limit(1);
    if (service === undefined) return { kind: 'missing', missing: 'service' };

    const [activeSet] = await database
      .select()
      .from(pricing.pricingSets)
      .where(
        and(
          eq(pricing.pricingSets.serviceId, service.id),
          eq(pricing.pricingSets.status, 'active'),
          lte(pricing.pricingSets.effectiveFrom, sql`now()`),
          or(
            isNull(pricing.pricingSets.effectiveTo),
            gt(pricing.pricingSets.effectiveTo, sql`now()`),
          ),
        ),
      )
      .orderBy(desc(pricing.pricingSets.effectiveFrom))
      .limit(1);
    if (activeSet === undefined)
      return { kind: 'missing', missing: 'active-pricing-set' };

    const items = await database
      .select()
      .from(pricing.pricingItems)
      .where(eq(pricing.pricingItems.pricingSetId, activeSet.id))
      .orderBy(pricing.pricingItems.sortOrder, pricing.pricingItems.name);

    return {
      kind: 'found',
      catalog: {
        serviceSlug: query.serviceSlug,
        currency: activeSet.currency,
        updatedAt: activeSet.updatedAt,
        items: items.map((item) => ({
          service: item.service,
          unit: item.unit,
          category: item.category,
          name: item.name,
          priceCents: item.priceCents,
          sortOrder: item.sortOrder,
          metadata: {
            ...(item.metadata.minimumThresholdQuantity === undefined
              ? {}
              : {
                  minimumThresholdQuantity:
                    item.metadata.minimumThresholdQuantity,
                }),
            ...(item.metadata.displayUnitLabel === undefined
              ? {}
              : { displayUnitLabel: item.metadata.displayUnitLabel }),
          },
        })),
      },
    };
  };
