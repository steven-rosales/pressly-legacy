import { type Database, type DatabaseExecutor } from '@pressly/db/client';
import { and, eq, gt, isNull, lte, or, sql } from '@pressly/db/query';
import * as pricing from '@pressly/db/schema/pricing';
import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result, type Result } from '@pressly/kernel';
import type { PricingChangeReadFailure } from '../../../language/pricing-change/pricing-change.failure.ts';
import type { PricingChangeCommand } from '../../../language/pricing-change/pricing-change.model.ts';
import type { CurrentPricingReader } from '../../../ports/current-pricing-reader/current-pricing-reader.port.ts';
import { toCurrentPricing } from './current-pricing-reader.persistence.mapper.ts';

type PricingServiceRow = typeof pricing.pricingServices.$inferSelect;
type PricingSetRow = typeof pricing.pricingSets.$inferSelect;
type PricingItemRow = typeof pricing.pricingItems.$inferSelect;

type PricingSnapshot = Readonly<{
  currentSet: PricingSetRow;
  currentItems: readonly PricingItemRow[];
}>;

const readDatabaseFailure = (cause: unknown): AppError =>
  databaseError({
    code: 'pricing_read_failed',
    message: 'Failed to read pricing.',
    safeMessage: 'Pricing is temporarily unavailable.',
    status: 503,
    cause,
  });

const activePricingSetPredicate = (serviceId: string) =>
  and(
    eq(pricing.pricingSets.serviceId, serviceId),
    eq(pricing.pricingSets.status, 'active'),
    lte(pricing.pricingSets.effectiveFrom, sql`now()`),
    or(
      isNull(pricing.pricingSets.effectiveTo),
      gt(pricing.pricingSets.effectiveTo, sql`now()`),
    ),
  );

const findPricingService = async (
  db: DatabaseExecutor,
  serviceSlug: PricingChangeCommand['serviceSlug'],
): Promise<Result<PricingServiceRow, PricingChangeReadFailure>> => {
  const [service] = await db
    .select()
    .from(pricing.pricingServices)
    .where(
      and(
        eq(pricing.pricingServices.slug, serviceSlug),
        eq(pricing.pricingServices.isActive, true),
      ),
    )
    .limit(1);

  return service === undefined
    ? result.err({ code: 'pricing_service_not_found', serviceSlug })
    : result.ok(service);
};

const findActivePricingSet = async (
  db: DatabaseExecutor,
  serviceId: string,
  serviceSlug: PricingChangeCommand['serviceSlug'],
): Promise<Result<PricingSetRow, PricingChangeReadFailure>> => {
  const sets = await db
    .select()
    .from(pricing.pricingSets)
    .where(activePricingSetPredicate(serviceId))
    .limit(2);

  if (sets.length === 0)
    return result.err({ code: 'active_pricing_set_not_found', serviceSlug });

  if (sets.length > 1)
    return result.err({ code: 'multiple_active_pricing_sets', serviceSlug });

  return result.ok(sets[0] as PricingSetRow);
};

const findPricingItems = async (
  db: DatabaseExecutor,
  pricingSetId: string,
): Promise<Result<readonly PricingItemRow[], PricingChangeReadFailure>> => {
  const items = await db
    .select()
    .from(pricing.pricingItems)
    .where(eq(pricing.pricingItems.pricingSetId, pricingSetId))
    .orderBy(pricing.pricingItems.sortOrder, pricing.pricingItems.name);

  return items.length === 0
    ? result.err({ code: 'active_pricing_set_has_no_items', pricingSetId })
    : result.ok(items);
};

const loadPricingSnapshot = async (
  db: DatabaseExecutor,
  serviceSlug: PricingChangeCommand['serviceSlug'],
): Promise<Result<PricingSnapshot, PricingChangeReadFailure>> => {
  const service = await findPricingService(db, serviceSlug);
  if (result.isErr(service)) return result.err(service.error);

  const currentSet = await findActivePricingSet(
    db,
    service.value.id,
    serviceSlug,
  );
  if (result.isErr(currentSet)) return result.err(currentSet.error);

  const currentItems = await findPricingItems(db, currentSet.value.id);
  if (result.isErr(currentItems)) return result.err(currentItems.error);

  return result.ok({
    currentSet: currentSet.value,
    currentItems: currentItems.value,
  });
};

export const makePostgresCurrentPricingReader =
  (db: Database): CurrentPricingReader =>
  async ({ serviceSlug }) => {
    try {
      const snapshot = await loadPricingSnapshot(db, serviceSlug);

      return result.isErr(snapshot)
        ? snapshot
        : result.ok(
            toCurrentPricing(
              snapshot.value.currentSet,
              snapshot.value.currentItems,
            ),
          );
    } catch (cause) {
      throw mapUnknownError(cause, readDatabaseFailure);
    }
  };
