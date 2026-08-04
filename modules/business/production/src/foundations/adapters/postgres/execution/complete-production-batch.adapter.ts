import { type DatabaseExecutor } from '@pressly/db/client';
import { and, eq, inArray, sql } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import {
  conflictError,
  invariantViolationError,
} from '@pressly/errors/factories';
import type { ProductionTerminalLifecycleDecisions } from '../../../language/execution/production-lifecycle.model.ts';

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

export type ProductionBatchTerminalization = Readonly<{
  finishedOrderCount: number;
  finishedBagCount: number;
  runCompleted: boolean;
  shiftClosed: boolean;
}>;

export const completeProductionBatch = async (
  db: DatabaseExecutor,
  input: Readonly<{
    locationId: string;
    productionBatchId: string;
    productionRunId: string;
    lifecycle: ProductionTerminalLifecycleDecisions;
    now: Date;
  }>,
): Promise<ProductionBatchTerminalization> => {
  const activeOrderLinks = await db
    .select({
      productionOrderId:
        laundryProduction.productionBatchOrders.productionOrderId,
    })
    .from(laundryProduction.productionBatchOrders)
    .where(
      and(
        eq(
          laundryProduction.productionBatchOrders.locationId,
          input.locationId,
        ),
        eq(
          laundryProduction.productionBatchOrders.productionBatchId,
          input.productionBatchId,
        ),
        eq(laundryProduction.productionBatchOrders.active, true),
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
    const lifecycle = lifecycleByOrderId.get(orderId)!;
    const [finishedOrder] = await db
      .update(laundryProduction.productionOrders)
      .set({
        operationalStatus: lifecycle.lifecycle.state,
        executionStatus: lifecycle.lifecycle.state,
        finishedAt: input.now,
        version: lifecycle.expectedVersion + 1,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(laundryProduction.productionOrders.locationId, input.locationId),
          eq(laundryProduction.productionOrders.id, orderId),
          eq(
            laundryProduction.productionOrders.operationalStatus,
            lifecycle.lifecycle.from,
          ),
          eq(
            laundryProduction.productionOrders.executionStatus,
            lifecycle.persistedState,
          ),
          eq(
            laundryProduction.productionOrders.version,
            lifecycle.expectedVersion,
          ),
          eq(laundryProduction.productionOrders.resolutionState, 'open'),
        ),
      )
      .returning({
        id: laundryProduction.productionOrders.id,
        bagCount: laundryProduction.productionOrders.bagCount,
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
    (total, order) => total + order.bagCount!,
    0,
  );
  const finishedBags = await db
    .update(laundryProduction.bags)
    .set({ status: 'finished' })
    .where(inArray(laundryProduction.bags.productionOrderId, orderIds))
    .returning({ id: laundryProduction.bags.id });
  if (finishedBags.length !== expectedBagCount)
    throw productionInvariantViolation(
      'production_batch_completion_bag_count_invalid',
      'Finished production order bag count is inconsistent.',
    );

  const deactivatedOrderLinks = await db
    .update(laundryProduction.productionBatchOrders)
    .set({ active: false })
    .where(
      and(
        eq(
          laundryProduction.productionBatchOrders.locationId,
          input.locationId,
        ),
        eq(
          laundryProduction.productionBatchOrders.productionBatchId,
          input.productionBatchId,
        ),
        eq(laundryProduction.productionBatchOrders.active, true),
      ),
    )
    .returning({
      productionOrderId:
        laundryProduction.productionBatchOrders.productionOrderId,
    });
  if (deactivatedOrderLinks.length !== orderIds.length)
    throw productionConcurrencyConflict(
      'production_batch_completion_membership_version_conflict',
      'Production batch order links changed concurrently.',
    );

  const runBatches = await db
    .select({ status: laundryProduction.productionBatches.status })
    .from(laundryProduction.productionBatches)
    .where(
      and(
        eq(laundryProduction.productionBatches.locationId, input.locationId),
        eq(
          laundryProduction.productionBatches.productionRunId,
          input.productionRunId,
        ),
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
    .from(laundryProduction.productionRuns)
    .where(
      and(
        eq(laundryProduction.productionRuns.locationId, input.locationId),
        eq(laundryProduction.productionRuns.id, input.productionRunId),
      ),
    )
    .limit(1);
  if (run === undefined)
    throw productionInvariantViolation(
      'production_batch_completion_run_missing',
      'Production run not found.',
    );
  const [completedRun] = await db
    .update(laundryProduction.productionRuns)
    .set({
      status: input.lifecycle.run.state,
      completedAt: input.now,
      version: run.version + 1,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(laundryProduction.productionRuns.locationId, input.locationId),
        eq(laundryProduction.productionRuns.id, run.id),
        eq(laundryProduction.productionRuns.status, input.lifecycle.run.from),
        eq(laundryProduction.productionRuns.version, run.version),
      ),
    )
    .returning({ id: laundryProduction.productionRuns.id });
  if (completedRun === undefined)
    throw productionConcurrencyConflict(
      'production_batch_completion_run_version_conflict',
      'Production run changed during completion.',
    );

  const siblingRuns = await db
    .select({ status: laundryProduction.productionRuns.status })
    .from(laundryProduction.productionRuns)
    .where(
      and(
        eq(laundryProduction.productionRuns.locationId, input.locationId),
        eq(
          laundryProduction.productionRuns.productionShiftId,
          run.productionShiftId,
        ),
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
    .update(laundryProduction.productionShifts)
    .set({
      status: input.lifecycle.shift.state,
      version: sql`${laundryProduction.productionShifts.version} + 1`,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(laundryProduction.productionShifts.locationId, input.locationId),
        eq(laundryProduction.productionShifts.id, run.productionShiftId),
        eq(
          laundryProduction.productionShifts.status,
          input.lifecycle.shift.from,
        ),
      ),
    )
    .returning({ id: laundryProduction.productionShifts.id });
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
