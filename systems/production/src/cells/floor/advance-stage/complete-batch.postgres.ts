import type { PostgresExecutor } from '@pressly/postgres/client';
import { and, eq, inArray, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import {
  conflictError,
  invariantViolationError,
} from '@pressly/errors/factories';
import type { AdvanceStageTerminalLifecycle } from './types.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const productionConcurrencyConflict = (code: string, message: string) =>
  conflictError({
    code,
    message,
    safeMessage: 'Production state changed. Refresh and try again.',
  });

export type AdvanceStageBatchTerminalization = Readonly<{
  finishedOrderCount: number;
  finishedBagCount: number;
  runCompleted: boolean;
  shiftClosed: boolean;
}>;

export const completeAdvanceStageBatch = async (
  db: PostgresExecutor,
  input: Readonly<{
    locationId: string;
    productionBatchId: string;
    productionRunId: string;
    lifecycle: AdvanceStageTerminalLifecycle;
    now: Date;
  }>,
  schema: ProductionSchema,
): Promise<AdvanceStageBatchTerminalization> => {
  const activeOrderLinks = await db
    .select({
      productionOrderId: schema.productionBatchOrders.productionOrderId,
    })
    .from(schema.productionBatchOrders)
    .where(
      and(
        eq(schema.productionBatchOrders.locationId, input.locationId),
        eq(
          schema.productionBatchOrders.productionBatchId,
          input.productionBatchId,
        ),
        eq(schema.productionBatchOrders.active, true),
      ),
    );
  const orderIds = activeOrderLinks.map((link) => link.productionOrderId);
  if (orderIds.length === 0)
    throw productionInvariantViolation(
      'production_batch_completion_active_orders_missing',
      'Finished batch has no active production orders.',
    );

  const lifecycleByOrderId = new Map(
    input.lifecycle.orders.map((order) => [order.productionOrderId, order]),
  );
  if (
    lifecycleByOrderId.size !== orderIds.length ||
    orderIds.some((orderId) => !lifecycleByOrderId.has(orderId)) ||
    input.lifecycle.orders.some(
      (order) =>
        order.lifecycle.from !== 'scheduled' ||
        order.lifecycle.state !== 'finished',
    )
  )
    throw productionInvariantViolation(
      'production_batch_completion_lifecycle_incomplete',
      'Production-order lifecycle decisions are incomplete.',
    );

  const finishedOrders: { id: string; bagCount: number | null }[] = [];
  for (const orderId of orderIds) {
    const lifecycle = lifecycleByOrderId.get(orderId);
    if (lifecycle === undefined)
      throw productionInvariantViolation(
        'production_batch_completion_lifecycle_incomplete',
        'Production-order lifecycle decisions are incomplete.',
      );
    const [finishedOrder] = await db
      .update(schema.productionOrders)
      .set({
        operationalStatus: lifecycle.lifecycle.state,
        executionStatus: lifecycle.lifecycle.state,
        finishedAt: input.now,
        version: lifecycle.expectedVersion + 1,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(schema.productionOrders.locationId, input.locationId),
          eq(schema.productionOrders.id, orderId),
          eq(
            schema.productionOrders.operationalStatus,
            lifecycle.lifecycle.from,
          ),
          eq(schema.productionOrders.executionStatus, lifecycle.persistedState),
          eq(schema.productionOrders.version, lifecycle.expectedVersion),
          eq(schema.productionOrders.resolutionState, 'open'),
        ),
      )
      .returning({
        id: schema.productionOrders.id,
        bagCount: schema.productionOrders.bagCount,
      });
    if (finishedOrder === undefined)
      throw productionConcurrencyConflict(
        'production_batch_completion_order_version_conflict',
        'Finished batch contains an order outside scheduled production.',
      );
    finishedOrders.push(finishedOrder);
  }

  if (finishedOrders.some((order) => order.bagCount === null))
    throw productionInvariantViolation(
      'production_batch_completion_bag_intake_missing',
      'Finished production order is missing bag intake.',
    );
  const expectedBagCount = finishedOrders.reduce(
    (total, order) => total + (order.bagCount ?? 0),
    0,
  );
  const finishedBags = await db
    .update(schema.bags)
    .set({ status: 'finished' })
    .where(inArray(schema.bags.productionOrderId, orderIds))
    .returning({ id: schema.bags.id });
  if (finishedBags.length !== expectedBagCount)
    throw productionInvariantViolation(
      'production_batch_completion_bag_count_invalid',
      'Finished production order bag count is inconsistent.',
    );

  const deactivatedOrderLinks = await db
    .update(schema.productionBatchOrders)
    .set({ active: false })
    .where(
      and(
        eq(schema.productionBatchOrders.locationId, input.locationId),
        eq(
          schema.productionBatchOrders.productionBatchId,
          input.productionBatchId,
        ),
        eq(schema.productionBatchOrders.active, true),
      ),
    )
    .returning({
      productionOrderId: schema.productionBatchOrders.productionOrderId,
    });
  if (deactivatedOrderLinks.length !== orderIds.length)
    throw productionConcurrencyConflict(
      'production_batch_completion_membership_version_conflict',
      'Production batch order links changed concurrently.',
    );

  const runBatches = await db
    .select({ status: schema.productionBatches.status })
    .from(schema.productionBatches)
    .where(
      and(
        eq(schema.productionBatches.locationId, input.locationId),
        eq(schema.productionBatches.productionRunId, input.productionRunId),
      ),
    );
  if (!runBatches.every((candidate) => candidate.status === 'finished'))
    return {
      finishedOrderCount: finishedOrders.length,
      finishedBagCount: finishedBags.length,
      runCompleted: false,
      shiftClosed: false,
    };

  const [run] = await db
    .select()
    .from(schema.productionRuns)
    .where(
      and(
        eq(schema.productionRuns.locationId, input.locationId),
        eq(schema.productionRuns.id, input.productionRunId),
      ),
    )
    .limit(1);
  if (run === undefined)
    throw productionInvariantViolation(
      'production_batch_completion_run_missing',
      'Production run not found.',
    );

  const [completedRun] = await db
    .update(schema.productionRuns)
    .set({
      status: input.lifecycle.run.state,
      completedAt: input.now,
      version: run.version + 1,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.productionRuns.locationId, input.locationId),
        eq(schema.productionRuns.id, run.id),
        eq(schema.productionRuns.status, input.lifecycle.run.from),
        eq(schema.productionRuns.version, run.version),
      ),
    )
    .returning({ id: schema.productionRuns.id });
  if (completedRun === undefined)
    throw productionConcurrencyConflict(
      'production_batch_completion_run_version_conflict',
      'Production run changed during completion.',
    );

  const siblingRuns = await db
    .select({ status: schema.productionRuns.status })
    .from(schema.productionRuns)
    .where(
      and(
        eq(schema.productionRuns.locationId, input.locationId),
        eq(schema.productionRuns.productionShiftId, run.productionShiftId),
      ),
    );
  if (!siblingRuns.every((candidate) => candidate.status === 'completed'))
    return {
      finishedOrderCount: finishedOrders.length,
      finishedBagCount: finishedBags.length,
      runCompleted: true,
      shiftClosed: false,
    };

  const [closedShift] = await db
    .update(schema.productionShifts)
    .set({
      status: input.lifecycle.shift.state,
      version: sql`${schema.productionShifts.version} + 1`,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.productionShifts.locationId, input.locationId),
        eq(schema.productionShifts.id, run.productionShiftId),
        eq(schema.productionShifts.status, input.lifecycle.shift.from),
      ),
    )
    .returning({ id: schema.productionShifts.id });
  if (closedShift === undefined)
    throw productionConcurrencyConflict(
      'production_batch_completion_shift_version_conflict',
      'Production shift changed during completion.',
    );

  return {
    finishedOrderCount: finishedOrders.length,
    finishedBagCount: finishedBags.length,
    runCompleted: true,
    shiftClosed: true,
  };
};
