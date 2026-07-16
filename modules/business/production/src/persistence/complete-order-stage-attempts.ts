import { and, eq, laundryProduction, type DatabaseExecutor } from '@pressly/db';

export const completeAssignedOrderStageAttempts = async (
  db: DatabaseExecutor,
  input: Readonly<{
    locationId: string;
    stageRunId: string;
    actorId: string;
    now: Date;
  }>,
): Promise<number> => {
  const completed = await db
    .update(laundryProduction.productionOrderStageAttempts)
    .set({
      status: 'completed',
      completedAt: input.now,
      completedBy: input.actorId,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(
          laundryProduction.productionOrderStageAttempts.locationId,
          input.locationId,
        ),
        eq(
          laundryProduction.productionOrderStageAttempts.stageRunId,
          input.stageRunId,
        ),
        eq(laundryProduction.productionOrderStageAttempts.status, 'assigned'),
      ),
    )
    .returning({ id: laundryProduction.productionOrderStageAttempts.id });

  if (completed.length === 0)
    throw new Error('Completed stage has no assigned order-stage attempts.');

  return completed.length;
};
