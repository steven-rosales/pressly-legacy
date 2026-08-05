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
} from '../../../foundations/language/pricing-change/pricing-change.failure.ts';
import type {
  PricingChangeCommand,
  PublishedPricingChange,
} from '../../../foundations/language/pricing-change/pricing-change.model.ts';
import type {
  CommitPricingChangeInput,
  PricingChangePublisher,
} from './publish-pricing-change.port.ts';
import { toReplacementPricingItems } from './publish-pricing-change.persistence.mapper.ts';

type PricingServiceRow = typeof pricing.pricingServices.$inferSelect;
type PricingSetRow = typeof pricing.pricingSets.$inferSelect;
type PricingItemRow = typeof pricing.pricingItems.$inferSelect;

type PricingSnapshot = Readonly<{
  service: PricingServiceRow;
  currentSet: PricingSetRow;
  currentItems: readonly PricingItemRow[];
}>;

const publishDatabaseFailure = (cause: unknown): AppError =>
  databaseError({
    code: 'pricing_publish_failed',
    message: 'Failed to publish pricing change.',
    safeMessage: 'Pricing change could not be published.',
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

const loadPricingSnapshot = async (
  db: DatabaseExecutor,
  serviceSlug: PricingChangeCommand['serviceSlug'],
): Promise<Result<PricingSnapshot, PricingChangeReadFailure>> => {
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
  if (service === undefined)
    return result.err({ code: 'pricing_service_not_found', serviceSlug });

  const sets = await db
    .select()
    .from(pricing.pricingSets)
    .where(activePricingSetPredicate(service.id))
    .limit(2);
  if (sets.length === 0)
    return result.err({ code: 'active_pricing_set_not_found', serviceSlug });
  if (sets.length > 1)
    return result.err({ code: 'multiple_active_pricing_sets', serviceSlug });

  const currentSet = sets[0] as PricingSetRow;
  const currentItems = await db
    .select()
    .from(pricing.pricingItems)
    .where(eq(pricing.pricingItems.pricingSetId, currentSet.id))
    .orderBy(pricing.pricingItems.sortOrder, pricing.pricingItems.name);
  if (currentItems.length === 0)
    return result.err({
      code: 'active_pricing_set_has_no_items',
      pricingSetId: currentSet.id,
    });

  return result.ok({ service, currentSet, currentItems });
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

export const makePostgresPricingChangePublisher =
  (db: Database): PricingChangePublisher =>
  async (input) => {
    try {
      return await commitPricingChange(db, input);
    } catch (cause) {
      throw mapUnknownError(cause, publishDatabaseFailure);
    }
  };
