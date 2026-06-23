import { result, type Result } from '@pressly/kernel';
import type { PublishPricingChangeResult } from '@pressly/contracts';
import {
  and,
  eq,
  gt,
  isNull,
  lte,
  or,
  pricing,
  sql,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import {
  conflictError,
  isAppError,
  makeAppError,
  notFoundError,
  type AppError,
} from '@pressly/errors';
import type {
  LoadCurrentPricingForPublishInput,
  PricingChangeStore,
  PublishPricingChangeCommand,
} from '../../../features/publish-pricing/publish-pricing-change.port.ts';

type PricingService = typeof pricing.pricingServices.$inferSelect;
type PricingSet = typeof pricing.pricingSets.$inferSelect;
type PricingItem = typeof pricing.pricingItems.$inferSelect;
type PricingLocation = typeof pricing.pricingLocations.$inferSelect;

const databaseFailure = (cause: unknown): AppError =>
  makeAppError({
    kind: 'DatabaseError',
    code: 'pricing_publish_failed',
    message: 'Failed to publish pricing change.',
    safeMessage: 'Pricing change could not be published.',
    status: 500,
    cause,
  });

const missingReturnedRow = (code: string, message: string): AppError =>
  makeAppError({
    kind: 'DatabaseError',
    code,
    message,
    safeMessage: 'Pricing change could not be published.',
    status: 500,
  });

const pricingStateChanged = (input: {
  expectedPricingSetId: string;
  actualPricingSetId: string;
}): AppError =>
  conflictError({
    code: 'pricing_state_changed',
    message: 'Pricing state changed before the publish could be committed.',
    safeMessage: 'Pricing changed while this publish was being prepared.',
    details: input,
  });

const toDatabaseResult = async <T>(
  work: () => Promise<T>,
): Promise<Result<T, AppError>> => {
  try {
    return result.ok(await work());
  } catch (error) {
    return result.err(isAppError(error) ? error : databaseFailure(error));
  }
};

const findService = async (
  db: DatabaseExecutor,
  serviceSlug: string,
): Promise<PricingService> => {
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

  if (service !== undefined) return service;

  throw notFoundError({
    code: 'pricing_service_not_found',
    message: `Pricing service not found: ${serviceSlug}`,
    safeMessage: 'Pricing service was not found.',
  });
};

const findLocation = async (
  db: DatabaseExecutor,
  locationSlug: string | undefined,
): Promise<PricingLocation | undefined> => {
  if (locationSlug === undefined) return undefined;

  const [location] = await db
    .select()
    .from(pricing.pricingLocations)
    .where(
      and(
        eq(pricing.pricingLocations.slug, locationSlug),
        eq(pricing.pricingLocations.isActive, true),
      ),
    )
    .limit(1);

  if (location !== undefined) return location;

  throw notFoundError({
    code: 'pricing_location_not_found',
    message: `Pricing location not found: ${locationSlug}.`,
    safeMessage: 'Pricing location was not found.',
  });
};

const activePricingSetPredicate = (
  serviceId: string,
  locationId: string | undefined,
) =>
  and(
    eq(pricing.pricingSets.serviceId, serviceId),
    locationId === undefined
      ? isNull(pricing.pricingSets.locationId)
      : eq(pricing.pricingSets.locationId, locationId),
    eq(pricing.pricingSets.status, 'active'),
    lte(pricing.pricingSets.effectiveFrom, sql`now()`),
    or(
      isNull(pricing.pricingSets.effectiveTo),
      gt(pricing.pricingSets.effectiveTo, sql`now()`),
    ),
  );

const findSingleActivePricingSet = async (
  db: DatabaseExecutor,
  serviceId: string,
  locationId: string | undefined,
): Promise<PricingSet> => {
  const sets = await db
    .select()
    .from(pricing.pricingSets)
    .where(activePricingSetPredicate(serviceId, locationId))
    .limit(2);

  if (sets.length === 1) return sets[0] as PricingSet;

  if (sets.length === 0)
    throw notFoundError({
      code: 'active_pricing_set_not_found',
      message: 'Active pricing set was not found.',
      safeMessage: 'Active pricing set was not found.',
    });

  throw conflictError({
    code: 'multiple_active_pricing_sets',
    message: 'Multiple active pricing sets exist for the same scope.',
    safeMessage: 'Pricing state is ambiguous.',
  });
};

const findPricingItems = async (
  db: DatabaseExecutor,
  pricingSetId: string,
): Promise<readonly PricingItem[]> => {
  const items = await db
    .select()
    .from(pricing.pricingItems)
    .where(eq(pricing.pricingItems.pricingSetId, pricingSetId))
    .orderBy(pricing.pricingItems.sortOrder, pricing.pricingItems.name);

  if (items.length > 0) return items as readonly PricingItem[];

  throw conflictError({
    code: 'active_pricing_set_has_no_items',
    message: `Pricing set has no items: ${pricingSetId}.`,
    safeMessage: 'Active pricing set has no items.',
  });
};

type PricingPlanReadModel = {
  service: PricingService;
  location: PricingLocation | undefined;
  currentSet: PricingSet;
  currentItems: readonly PricingItem[];
};

const loadPricingPlan = async (
  db: DatabaseExecutor,
  input: LoadCurrentPricingForPublishInput | PublishPricingChangeCommand,
): Promise<PricingPlanReadModel> => {
  const service = await findService(db, input.serviceSlug);
  const location = await findLocation(db, input.locationSlug);
  const currentSet = await findSingleActivePricingSet(
    db,
    service.id,
    location?.id,
  );
  const currentItems = await findPricingItems(db, currentSet.id);

  return {
    service,
    location,
    currentSet,
    currentItems,
  };
};

export const makePricingChangeStore = (input: {
  db: Database;
}): PricingChangeStore => ({
  loadCurrentPricingForPublish: async (scope) =>
    toDatabaseResult(async () => {
      const { currentSet, currentItems } = await loadPricingPlan(
        input.db,
        scope,
      );

      return {
        currentSet: {
          id: currentSet.id,
          currency: currentSet.currency,
        },
        currentItems: currentItems.map((item) => ({
          code: item.code,
          name: item.name,
          priceCents: item.priceCents,
        })),
      };
    }),

  commitPricingChangePlan: async (
    publish,
  ): Promise<Result<PublishPricingChangeResult, AppError>> =>
    toDatabaseResult(async () =>
      input.db.transaction(async (tx) => {
        const { command, plan, publishedAt } = publish;
        const lockKey = [
          'pricing',
          command.serviceSlug,
          command.locationSlug ?? 'global',
        ].join(':');

        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`,
        );

        const { service, location, currentSet, currentItems } =
          await loadPricingPlan(tx, command);

        if (currentSet.id !== plan.oldPricingSetId) {
          throw pricingStateChanged({
            expectedPricingSetId: plan.oldPricingSetId,
            actualPricingSetId: currentSet.id,
          });
        }

        const newPriceByCode = new Map(
          plan.changes.map((item) => [item.code, item.newPriceCents]),
        );

        await tx
          .update(pricing.pricingSets)
          .set({
            status: 'archived',
            effectiveTo: publishedAt,
            updatedAt: publishedAt,
          })
          .where(eq(pricing.pricingSets.id, currentSet.id));

        const [newSet] = await tx
          .insert(pricing.pricingSets)
          .values({
            serviceId: service.id,
            locationId: location?.id ?? null,
            status: 'active',
            currency: currentSet.currency,
            effectiveFrom: publishedAt,
            createdAt: publishedAt,
            updatedAt: publishedAt,
          })
          .returning();

        if (newSet === undefined) {
          throw missingReturnedRow(
            'new_pricing_set_not_returned',
            'New pricing set was not returned.',
          );
        }

        await tx.insert(pricing.pricingItems).values(
          currentItems.map((item) => ({
            pricingSetId: newSet.id,
            code: item.code,
            service: item.service,
            category: item.category,
            name: item.name,
            unit: item.unit,
            priceCents: newPriceByCode.get(item.code) ?? item.priceCents,
            sortOrder: item.sortOrder,
            metadata: item.metadata,
            createdAt: publishedAt,
            updatedAt: publishedAt,
          })),
        );

        const [auditEvent] = await tx
          .insert(pricing.pricingChangeEvents)
          .values({
            kind: 'pricing.publish',
            actorId: command.requestedBy.id,
            actorKind: command.requestedBy.kind,
            actorDisplayName: command.requestedBy.displayName,
            serviceSlug: command.serviceSlug,
            ...(command.locationSlug === undefined
              ? {}
              : { locationSlug: command.locationSlug }),
            reason: command.reason,
            oldPricingSetId: currentSet.id,
            newPricingSetId: newSet.id,
            input: command,
            createdAt: publishedAt,
          })
          .returning();

        if (auditEvent === undefined) {
          throw missingReturnedRow(
            'pricing_audit_event_not_returned',
            'Pricing audit event was not returned.',
          );
        }

        return {
          oldPricingSetId: currentSet.id,
          newPricingSetId: newSet.id,
          auditEventId: auditEvent.id,
          changeItemCount: plan.changes.length,
        };
      }),
    ),
});
