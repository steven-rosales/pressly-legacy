import type { SchedulingInput } from './production-scheduling.model.ts';
import type { ScheduleProposal } from './schedule-proposal.entity.ts';

/**
 * A proposal is a lossless partition of its input orders: every snapshot order
 * appears exactly once, either in one batch or in the explicit unplaced set.
 */
export const scheduleCoversInputExactly = (
  schedule: Pick<ScheduleProposal, 'batches' | 'unplacedOrderIds'>,
  inputSnapshot: Pick<SchedulingInput, 'orders'>,
): boolean => {
  const snapshotOrderIds = inputSnapshot.orders.map((order) => order.id);
  const plannedOrderIds = [
    ...schedule.batches.flatMap((batch) => batch.orderIds),
    ...schedule.unplacedOrderIds,
  ];

  if (
    new Set(snapshotOrderIds).size !== snapshotOrderIds.length ||
    new Set(plannedOrderIds).size !== plannedOrderIds.length ||
    plannedOrderIds.length !== snapshotOrderIds.length
  )
    return false;

  const snapshotSet = new Set(snapshotOrderIds);
  return plannedOrderIds.every((orderId) => snapshotSet.has(orderId));
};
