import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  err,
  makeAppError,
  ok,
  type AppError,
  type Result,
} from '@pressly/errors';
import type { Database } from '@pressly/db';
import { pricingItems } from '../schema/items.schema.ts';
import { pricingLocations } from '../schema/locations.schema.ts';
import { pricingServices } from '../schema/services.schema.ts';
import { pricingSets } from '../schema/sets.schema.ts';
import type { GetPricingCommand } from '../../features/get-pricing/get-pricing.command.ts';
import type { PricingReader } from '../../features/get-pricing/get-pricing.port.ts';
import type { GetPricingResult } from '../../features/get-pricing/get-pricing.result.ts';

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

export const makePostgresPricingReader = (db: Database): PricingReader => ({
  getPricing: async (
    command: GetPricingCommand,
  ): Promise<Result<GetPricingResult, AppError>> => {
    try {
      const [service] = await db
        .select()
        .from(pricingServices)
        .where(eq(pricingServices.slug, command.serviceSlug))
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
                .from(pricingLocations)
                .where(eq(pricingLocations.slug, command.locationSlug))
                .limit(1)
            )[0];

      const locationSet =
        location === undefined
          ? undefined
          : (
              await db
                .select()
                .from(pricingSets)
                .where(
                  and(
                    eq(pricingSets.serviceId, service.id),
                    eq(pricingSets.locationId, location.id),
                    eq(pricingSets.status, 'active'),
                  ),
                )
                .orderBy(desc(pricingSets.effectiveFrom))
                .limit(1)
            )[0];

      const defaultSet =
        locationSet ??
        (
          await db
            .select()
            .from(pricingSets)
            .where(
              and(
                eq(pricingSets.serviceId, service.id),
                isNull(pricingSets.locationId),
                eq(pricingSets.status, 'active'),
              ),
            )
            .orderBy(desc(pricingSets.effectiveFrom))
            .limit(1)
        )[0];

      if (defaultSet === undefined)
        return err(
          notFound(`Active pricing set not found: ${command.serviceSlug}`),
        );

      const items = await db
        .select()
        .from(pricingItems)
        .where(eq(pricingItems.pricingSetId, defaultSet.id))
        .orderBy(pricingItems.sortOrder, pricingItems.name);

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
