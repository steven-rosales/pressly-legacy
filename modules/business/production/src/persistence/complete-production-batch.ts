import {
  and,
  eq,
  inArray,
  laundryProduction,
  sql,
  type DatabaseExecutor,
} from '@pressly/db';

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
    throw new Error('Finished batch has no active production orders.');

  const finishedOrders = await db
    .update(laundryProduction.productionOrders)
    .set({
      status: 'finished',
      finishedAt: input.now,
      version: sql`${laundryProduction.productionOrders.version} + 1`,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(laundryProduction.productionOrders.locationId, input.locationId),
        inArray(laundryProduction.productionOrders.id, orderIds),
        eq(laundryProduction.productionOrders.status, 'scheduled'),
      ),
    )
    .returning({
      id: laundryProduction.productionOrders.id,
      bagCount: laundryProduction.productionOrders.bagCount,
    });
  if (finishedOrders.length !== orderIds.length)
    throw new Error(
      'Finished batch contains an order outside scheduled production.',
    );

  if (finishedOrders.some((order) => order.bagCount === null))
    throw new Error('Finished production order is missing bag intake.');
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
    throw new Error('Finished production order bag count is inconsistent.');

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
    throw new Error('Production batch order links changed concurrently.');

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
  if (run === undefined) throw new Error('Production run not found.');
  const [completedRun] = await db
    .update(laundryProduction.productionRuns)
    .set({
      status: 'completed',
      completedAt: input.now,
      version: run.version + 1,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(laundryProduction.productionRuns.locationId, input.locationId),
        eq(laundryProduction.productionRuns.id, run.id),
        eq(laundryProduction.productionRuns.status, 'started'),
        eq(laundryProduction.productionRuns.version, run.version),
      ),
    )
    .returning({ id: laundryProduction.productionRuns.id });
  if (completedRun === undefined)
    throw new Error('Production run changed during completion.');

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
      status: 'closed',
      version: sql`${laundryProduction.productionShifts.version} + 1`,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(laundryProduction.productionShifts.locationId, input.locationId),
        eq(laundryProduction.productionShifts.id, run.productionShiftId),
        eq(laundryProduction.productionShifts.status, 'open'),
      ),
    )
    .returning({ id: laundryProduction.productionShifts.id });
  if (closedShift === undefined)
    throw new Error('Production shift changed during completion.');

  return {
    finishedOrderCount: finishedOrders.length,
    finishedBagCount: finishedBags.length,
    runCompleted: true,
    shiftClosed: true,
  };
};
