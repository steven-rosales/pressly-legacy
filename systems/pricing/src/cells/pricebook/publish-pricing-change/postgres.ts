import type { PostgresDatabase } from '@pressly/postgres/client';
import { eq, sql } from '@pressly/postgres/query';
import { mapUnknownError } from '@pressly/errors/app-error';
import {
  databaseError,
  invariantViolationError,
} from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import { loadCurrentPricingSnapshot } from '../../../postgres/current-pricing.postgres.ts';
import type { PricingSchema } from '../../../schema/pricing.ts';
import type {
  CommitPricingChangeInput,
  PricingChangePublisher,
} from './types.ts';

type PublishPricingSchema = Pick<
  PricingSchema,
  'pricingChangeEvents' | 'pricingItems' | 'pricingServices' | 'pricingSets'
>;
type PricingItemRow = PublishPricingSchema['pricingItems']['$inferSelect'];

const missingReturnedRow = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Pricing change could not be published.',
  });

const replacementItems = (
  currentItems: readonly PricingItemRow[],
  input: Readonly<{
    newPricingSetId: string;
    plan: CommitPricingChangeInput['plan'];
    publishedAt: Date;
  }>,
) => {
  const newPriceByCode = new Map(
    input.plan.changes.map((item) => [item.code, item.newPriceCents]),
  );
  return currentItems.map((item) => ({
    pricingSetId: input.newPricingSetId,
    code: item.code,
    service: item.service,
    category: item.category,
    name: item.name,
    unit: item.unit,
    priceCents: newPriceByCode.get(item.code) ?? item.priceCents,
    sortOrder: item.sortOrder,
    metadata: item.metadata,
    createdAt: input.publishedAt,
    updatedAt: input.publishedAt,
  }));
};

const commitPricingChange = async (
  database: PostgresDatabase,
  pricing: PublishPricingSchema,
  input: CommitPricingChangeInput,
) =>
  database.transaction(async (transaction) => {
    const lockKey = `pricing:${input.command.serviceSlug}`;
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`,
    );

    const snapshot = await loadCurrentPricingSnapshot(
      transaction,
      pricing,
      input.command.serviceSlug,
    );
    if (result.isErr(snapshot)) return result.err(snapshot.error);
    if (snapshot.value.currentSet.id !== input.plan.oldPricingSetId)
      return result.err({
        code: 'pricing_state_changed' as const,
        expectedPricingSetId: input.plan.oldPricingSetId,
        actualPricingSetId: snapshot.value.currentSet.id,
      });

    await transaction
      .update(pricing.pricingSets)
      .set({
        status: 'archived',
        effectiveTo: input.publishedAt,
        updatedAt: input.publishedAt,
      })
      .where(eq(pricing.pricingSets.id, snapshot.value.currentSet.id));

    const [newSet] = await transaction
      .insert(pricing.pricingSets)
      .values({
        serviceId: snapshot.value.service.id,
        status: 'active',
        currency: snapshot.value.currentSet.currency,
        effectiveFrom: input.publishedAt,
        createdAt: input.publishedAt,
        updatedAt: input.publishedAt,
      })
      .returning();
    if (newSet === undefined)
      throw missingReturnedRow(
        'new_pricing_set_not_returned',
        'New pricing set was not returned.',
      );

    await transaction.insert(pricing.pricingItems).values(
      replacementItems(snapshot.value.currentItems, {
        newPricingSetId: newSet.id,
        plan: input.plan,
        publishedAt: input.publishedAt,
      }),
    );

    const [auditEvent] = await transaction
      .insert(pricing.pricingChangeEvents)
      .values({
        kind: 'pricing.publish',
        actorId: input.command.requestedBy.id,
        actorKind: input.command.requestedBy.kind,
        actorDisplayName: input.command.requestedBy.displayName,
        serviceSlug: input.command.serviceSlug,
        reason: input.command.reason,
        oldPricingSetId: snapshot.value.currentSet.id,
        newPricingSetId: newSet.id,
        input: input.command,
        createdAt: input.publishedAt,
      })
      .returning();
    if (auditEvent === undefined)
      throw missingReturnedRow(
        'pricing_audit_event_not_returned',
        'Pricing audit event was not returned.',
      );

    return result.ok({
      oldPricingSetId: snapshot.value.currentSet.id,
      newPricingSetId: newSet.id,
      auditEventId: auditEvent.id,
      changeItemCount: input.plan.changes.length,
    });
  });

export const makePostgresPricingChangePublisher = (
  database: PostgresDatabase,
  pricing: PublishPricingSchema,
): PricingChangePublisher =>
  async function publishPricingChange(input) {
    try {
      return await commitPricingChange(database, pricing, input);
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'pricing_publish_failed',
          message: 'Failed to publish pricing change.',
          safeMessage: 'Pricing change could not be published.',
          status: 503,
          cause,
        }),
      );
    }
  };
