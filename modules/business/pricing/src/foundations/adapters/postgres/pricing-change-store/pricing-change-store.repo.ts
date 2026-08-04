import { type Database, type DatabaseExecutor } from '@pressly/db/client';
import { and, eq, gt, isNull, lte, or, sql } from '@pressly/db/query';
import * as pricing from '@pressly/db/schema/pricing';
import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import {
  databaseError,
  invariantViolationError,
} from '@pressly/errors/factories';
import { result, type Result } from '@pressly/kernel';
import type {
  PricingChangeCommitFailure,
  PricingChangeReadFailure,
} from '../../../language/pricing-change/pricing-change.failure.ts';
import type {
  PricingChangeCommand,
  PublishedPricingChange,
} from '../../../language/pricing-change/pricing-change.model.ts';
import type {
  CommitPricingChangeInput,
  PricingChangeStore,
} from '../../../ports/pricing-change-store/pricing-change-store.port.ts';
import {
  toCurrentPricing,
  toReplacementPricingItems,
} from './pricing-change-store.persistence.mapper.ts';

type PricingServiceRow = typeof pricing.pricingServices.$inferSelect;
type PricingSetRow = typeof pricing.pricingSets.$inferSelect;
type PricingItemRow = typeof pricing.pricingItems.$inferSelect;

type PricingSnapshot = Readonly<{
  service: PricingServiceRow;
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

const publishDatabaseFailure = (cause: unknown): AppError =>
  databaseError({
    code: 'pricing_publish_failed',
    message: 'Failed to publish pricing change.',
    safeMessage: 'Pricing change could not be published.',
    status: 503,
    cause,
  });

const withDatabaseFailure = async <Value>(
  work: () => Promise<Value>,
  normalize: (cause: unknown) => AppError,
): Promise<Value> => {
  try {
    return await work();
  } catch (cause) {
    throw mapUnknownError(cause, normalize);
  }
};

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
    ? result.err({
        code: 'active_pricing_set_has_no_items',
        pricingSetId,
      })
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
    service: service.value,
    currentSet: currentSet.value,
    currentItems: currentItems.value,
  });
};

const missingReturnedRow = (code: string, message: string): AppError =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Pricing change could not be published.',
  });

const commitPricingChange = async (
  db: Database,
  input: CommitPricingChangeInput,
): Promise<Result<PublishedPricingChange, PricingChangeCommitFailure>> =>
  db.transaction(async (tx) => {
    const { command, plan, publishedAt } = input;
    const lockKey = ['pricing', command.serviceSlug].join(':');

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`,
    );

    const snapshot = await loadPricingSnapshot(tx, command.serviceSlug);
    if (result.isErr(snapshot)) return result.err(snapshot.error);

    const { service, currentSet, currentItems } = snapshot.value;
    if (currentSet.id !== plan.oldPricingSetId)
      return result.err({
        code: 'pricing_state_changed',
        expectedPricingSetId: plan.oldPricingSetId,
        actualPricingSetId: currentSet.id,
      });

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
        status: 'active',
        currency: currentSet.currency,
        effectiveFrom: publishedAt,
        createdAt: publishedAt,
        updatedAt: publishedAt,
      })
      .returning();

    if (newSet === undefined)
      throw missingReturnedRow(
        'new_pricing_set_not_returned',
        'New pricing set was not returned.',
      );

    await tx.insert(pricing.pricingItems).values(
      toReplacementPricingItems({
        currentItems,
        newPricingSetId: newSet.id,
        plan,
        publishedAt,
      }),
    );

    const [auditEvent] = await tx
      .insert(pricing.pricingChangeEvents)
      .values({
        kind: 'pricing.publish',
        actorId: command.requestedBy.id,
        actorKind: command.requestedBy.kind,
        actorDisplayName: command.requestedBy.displayName,
        serviceSlug: command.serviceSlug,
        reason: command.reason,
        oldPricingSetId: currentSet.id,
        newPricingSetId: newSet.id,
        input: command,
        createdAt: publishedAt,
      })
      .returning();

    if (auditEvent === undefined)
      throw missingReturnedRow(
        'pricing_audit_event_not_returned',
        'Pricing audit event was not returned.',
      );

    return result.ok({
      oldPricingSetId: currentSet.id,
      newPricingSetId: newSet.id,
      auditEventId: auditEvent.id,
      changeItemCount: plan.changes.length,
    });
  });

export const makePostgresPricingChangeStore = (input: {
  db: Database;
}): PricingChangeStore => ({
  loadCurrentPricing: async ({ serviceSlug }) =>
    withDatabaseFailure(async () => {
      const snapshot = await loadPricingSnapshot(input.db, serviceSlug);

      return result.isErr(snapshot)
        ? snapshot
        : result.ok(
            toCurrentPricing(
              snapshot.value.currentSet,
              snapshot.value.currentItems,
            ),
          );
    }, readDatabaseFailure),
  commitPricingChange: async (command) =>
    withDatabaseFailure(
      () => commitPricingChange(input.db, command),
      publishDatabaseFailure,
    ),
});
