import { type Database } from '@pressly/db/client';
import { and, desc, eq, gt, isNull, lte, or, sql } from '@pressly/db/query';
import * as pricing from '@pressly/db/schema/pricing';
import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import { toPricingCatalog } from './effective-pricing-catalog.persistence.mapper.ts';
import type { EffectivePricingCatalogFinder } from './load-pricing-catalog.port.ts';

const pricingReadFailure = (cause: unknown): AppError =>
  databaseError({
    code: 'pricing_read_failed',
    message: 'Failed to read pricing.',
    safeMessage: 'Pricing is temporarily unavailable.',
    status: 503,
    cause,
  });

const isCurrentPricingSet = () =>
  and(
    eq(pricing.pricingSets.status, 'active'),
    lte(pricing.pricingSets.effectiveFrom, sql`now()`),
    or(
      isNull(pricing.pricingSets.effectiveTo),
      gt(pricing.pricingSets.effectiveTo, sql`now()`),
    ),
  );

export const makeEffectivePricingCatalogFinder = (
  db: Database,
): EffectivePricingCatalogFinder => ({
  findEffectivePricingCatalog: async (command) => {
    try {
      const [service] = await db
        .select()
        .from(pricing.pricingServices)
        .where(
          and(
            eq(pricing.pricingServices.slug, command.serviceSlug),
            eq(pricing.pricingServices.isActive, true),
          ),
        )
        .limit(1);

      if (service === undefined)
        return result.err({
          code: 'pricing_not_found',
          serviceSlug: command.serviceSlug,
          missing: 'service',
        });

      const [activeSet] = await db
        .select()
        .from(pricing.pricingSets)
        .where(
          and(
            eq(pricing.pricingSets.serviceId, service.id),
            isCurrentPricingSet(),
          ),
        )
        .orderBy(desc(pricing.pricingSets.effectiveFrom))
        .limit(1);

      if (activeSet === undefined)
        return result.err({
          code: 'pricing_not_found',
          serviceSlug: command.serviceSlug,
          missing: 'active-pricing-set',
        });

      const items = await db
        .select()
        .from(pricing.pricingItems)
        .where(eq(pricing.pricingItems.pricingSetId, activeSet.id))
        .orderBy(pricing.pricingItems.sortOrder, pricing.pricingItems.name);

      return result.ok(toPricingCatalog({ command, activeSet, items }));
    } catch (cause) {
      throw mapUnknownError(cause, pricingReadFailure);
    }
  },
});
