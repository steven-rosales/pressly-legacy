import { and, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import {
  err,
  makeAppError,
  ok,
  type AppError,
  type Result,
} from '@pressly/errors';
import { pricing, type Database } from '@pressly/db';
import type {
  LoadPricingCatalogCommand,
  LoadPricingCatalogResult,
} from '@pressly/contracts';
import type { EffectivePricingCatalogFinder } from '../../../features/load-pricing-catalog/load-pricing-catalog.port.ts';

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
        return err(
          notFound(`Pricing service not found: ${command.serviceSlug}`),
        );

      const location =
        command.locationSlug === undefined
          ? undefined
          : (
              await db
                .select()
                .from(pricing.pricingLocations)
                .where(
                  and(
                    eq(pricing.pricingLocations.slug, command.locationSlug),
                    eq(pricing.pricingLocations.isActive, true),
                  ),
                )
                .limit(1)
            )[0];

      if (command.locationSlug !== undefined && location === undefined)
        return err(
          notFound(`Pricing location not found: ${command.locationSlug}`),
        );

      const locationSet =
        location === undefined
          ? undefined
          : (
              await db
                .select()
                .from(pricing.pricingSets)
                .where(
                  and(
                    eq(pricing.pricingSets.serviceId, service.id),
                    eq(pricing.pricingSets.locationId, location.id),
                    isCurrentPricingSet(),
                  ),
                )
                .orderBy(desc(pricing.pricingSets.effectiveFrom))
                .limit(1)
            )[0];

      const defaultSet =
        locationSet ??
        (
          await db
            .select()
            .from(pricing.pricingSets)
            .where(
              and(
                eq(pricing.pricingSets.serviceId, service.id),
                isNull(pricing.pricingSets.locationId),
                isCurrentPricingSet(),
              ),
            )
            .orderBy(desc(pricing.pricingSets.effectiveFrom))
            .limit(1)
        )[0];

      if (defaultSet === undefined)
        return err(
          notFound(`Active pricing set not found: ${command.serviceSlug}`),
        );

      const items = await db
        .select()
        .from(pricing.pricingItems)
        .where(eq(pricing.pricingItems.pricingSetId, defaultSet.id))
        .orderBy(pricing.pricingItems.sortOrder, pricing.pricingItems.name);

      return ok({
        serviceSlug: command.serviceSlug,
        ...(command.locationSlug === undefined
          ? {}
          : { locationSlug: command.locationSlug }),
        currency: defaultSet.currency,
        updatedAt: defaultSet.updatedAt.toISOString(),
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
      return err(databaseFailure(error));
    }
  },
});
