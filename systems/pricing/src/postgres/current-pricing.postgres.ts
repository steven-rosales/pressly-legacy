import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, eq, gt, isNull, lte, or, sql } from '@pressly/postgres/query';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import type {
  CurrentPricing,
  PricingChangeReadFailure,
} from '../model/pricing-change.ts';
import type { PricingServiceSlug } from '../model/pricing.ts';
import type { PricingSchema } from '../schema/pricing.ts';

type CurrentPricingSchema = Pick<
  PricingSchema,
  'pricingItems' | 'pricingServices' | 'pricingSets'
>;
type PricingServiceRow =
  CurrentPricingSchema['pricingServices']['$inferSelect'];
type PricingSetRow = CurrentPricingSchema['pricingSets']['$inferSelect'];
type PricingItemRow = CurrentPricingSchema['pricingItems']['$inferSelect'];

export type CurrentPricingSnapshot = Readonly<{
  service: PricingServiceRow;
  currentSet: PricingSetRow;
  currentItems: readonly PricingItemRow[];
}>;

export const activePricingSetPredicate = (
  schema: CurrentPricingSchema,
  serviceId: string,
) =>
  and(
    eq(schema.pricingSets.serviceId, serviceId),
    eq(schema.pricingSets.status, 'active'),
    lte(schema.pricingSets.effectiveFrom, sql`now()`),
    or(
      isNull(schema.pricingSets.effectiveTo),
      gt(schema.pricingSets.effectiveTo, sql`now()`),
    ),
  );

export const loadCurrentPricingSnapshot = async (
  database: PostgresExecutor,
  schema: CurrentPricingSchema,
  serviceSlug: PricingServiceSlug,
): Promise<Result<CurrentPricingSnapshot, PricingChangeReadFailure>> => {
  const [service] = await database
    .select()
    .from(schema.pricingServices)
    .where(
      and(
        eq(schema.pricingServices.slug, serviceSlug),
        eq(schema.pricingServices.isActive, true),
      ),
    )
    .limit(1);
  if (service === undefined)
    return result.err({ code: 'pricing_service_not_found', serviceSlug });

  const sets = await database
    .select()
    .from(schema.pricingSets)
    .where(activePricingSetPredicate(schema, service.id))
    .limit(2);
  if (sets.length === 0)
    return result.err({ code: 'active_pricing_set_not_found', serviceSlug });
  if (sets.length > 1)
    return result.err({ code: 'multiple_active_pricing_sets', serviceSlug });

  const currentSet = sets[0] as PricingSetRow;
  const currentItems = await database
    .select()
    .from(schema.pricingItems)
    .where(eq(schema.pricingItems.pricingSetId, currentSet.id))
    .orderBy(schema.pricingItems.sortOrder, schema.pricingItems.name);
  if (currentItems.length === 0)
    return result.err({
      code: 'active_pricing_set_has_no_items',
      pricingSetId: currentSet.id,
    });

  return result.ok({ service, currentSet, currentItems });
};

export type CurrentPricingReader = (
  serviceSlug: PricingServiceSlug,
) => Promise<Result<CurrentPricing, PricingChangeReadFailure>>;

export const makePostgresCurrentPricingReader = (
  database: PostgresDatabase,
  schema: CurrentPricingSchema,
): CurrentPricingReader =>
  async function readCurrentPricing(serviceSlug) {
    try {
      const snapshot = await loadCurrentPricingSnapshot(
        database,
        schema,
        serviceSlug,
      );
      if (result.isErr(snapshot)) return snapshot;
      return result.ok({
        currentSet: {
          id: snapshot.value.currentSet.id,
          currency: snapshot.value.currentSet.currency,
        },
        currentItems: snapshot.value.currentItems.map((item) => ({
          code: item.code,
          name: item.name,
          priceCents: item.priceCents,
        })),
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'pricing_read_failed',
          message: 'Failed to read pricing.',
          safeMessage: 'Pricing is temporarily unavailable.',
          status: 503,
          cause,
        }),
      );
    }
  };
