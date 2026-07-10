import { result, type Result } from '@pressly/kernel';
import { makeAppError, type AppError } from '@pressly/errors';
import { utcIsoFromDate } from '@pressly/time';
import {
  and,
  desc,
  eq,
  gt,
  isNull,
  lte,
  or,
  pricing,
  sql,
  type Database,
} from '@pressly/db';
import type {
  LoadPricingCatalogCommand,
  LoadPricingCatalogResult,
} from '@pressly/contracts';
import type { EffectivePricingCatalogFinder } from './load-pricing-catalog.port.ts';

const notFound = (message: string): AppError =>
  makeAppError({
    kind: 'NotFoundError',
    code: 'pricing_not_found',
    message,
    safeMessage: 'Pricing is not available.',
    status: 404,
  });

const databaseFailure = (cause: unknown): AppError =>
  makeAppError({
    kind: 'DatabaseError',
    code: 'pricing_read_failed',
    message: 'Failed to read pricing.',
    safeMessage: 'Pricing is temporarily unavailable.',
    status: 500,
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
  findEffectivePricingCatalog: async (
    command: LoadPricingCatalogCommand,
  ): Promise<Result<LoadPricingCatalogResult, AppError>> => {
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
        return result.err(
          notFound(`Pricing service not found: ${command.serviceSlug}`),
        );

      const activeSet = (
        await db
          .select()
          .from(pricing.pricingSets)
          .where(
            and(
              eq(pricing.pricingSets.serviceId, service.id),
              isCurrentPricingSet(),
            ),
          )
          .orderBy(desc(pricing.pricingSets.effectiveFrom))
          .limit(1)
      )[0];

      if (activeSet === undefined)
        return result.err(
          notFound(`Active pricing set not found: ${command.serviceSlug}`),
        );

      const items = await db
        .select()
        .from(pricing.pricingItems)
        .where(eq(pricing.pricingItems.pricingSetId, activeSet.id))
        .orderBy(pricing.pricingItems.sortOrder, pricing.pricingItems.name);

      return result.ok({
        serviceSlug: command.serviceSlug,
        currency: activeSet.currency,
        updatedAt: utcIsoFromDate(activeSet.updatedAt),
        items: items.map((item) => ({
          service: item.service,
          unit: item.unit,
          category: item.category,
          name: item.name,
          priceCents: item.priceCents,
          sortOrder: item.sortOrder,
          metadata: item.metadata,
        })),
      });
    } catch (error) {
      return result.err(databaseFailure(error));
    }
  },
});
