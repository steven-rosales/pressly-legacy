import type {
  OnlinePlacementResult,
  RemainingDayActiveRun,
  RemainingDayForecastDecision,
  RemainingDayForecastScheduler,
  RemainingDayPlacementBatch,
  RemainingDayPlacementProjection,
  RemainingDayReadyOrder,
} from './types.ts';

const canonicalReadyOrder = (
  left: RemainingDayReadyOrder,
  right: RemainingDayReadyOrder,
): number =>
  Number(right.priority) - Number(left.priority) ||
  Date.parse(left.dueAt) - Date.parse(right.dueAt) ||
  left.id.localeCompare(right.id);

const needsShift = (
  order: RemainingDayReadyOrder,
  reason: Exclude<RemainingDayForecastDecision['reason'], null>,
): RemainingDayForecastDecision => ({
  productionOrderId: order.id,
  disposition: 'needs_shift',
  reason,
});

type AffectedBatch = Extract<
  OnlinePlacementResult,
  { kind: 'proposed' }
>['affectedBatches'][number];

const toEphemeralBatch = (
  projection: AffectedBatch,
  acceptedIndex: number,
): RemainingDayPlacementBatch => ({
  id:
    projection.sourceBatchId ??
    `forecast-batch-${acceptedIndex}-${projection.sequence}`,
  sequence: projection.sequence,
  status: projection.status,
  membershipFrozen: projection.membershipFrozen,
  orderIds: [...projection.orderIds],
  priorityOrderIds: [...projection.priorityOrderIds],
  derivedWeightLbs: projection.derivedWeightLbs,
  bagCount: projection.bagCount,
  stages: projection.stages.map((stage) => ({
    ...stage,
    machineIds: [...stage.machineIds],
  })),
});

const cloneBatch = (
  batch: RemainingDayPlacementBatch,
): RemainingDayPlacementBatch => ({
  ...batch,
  orderIds: [...batch.orderIds],
  priorityOrderIds: [...batch.priorityOrderIds],
  stages: batch.stages.map((stage) => ({
    ...stage,
    machineIds: [...stage.machineIds],
  })),
});

const mergeAcceptedProjection = (
  current: readonly RemainingDayPlacementBatch[],
  affectedFromSequence: number,
  affected: readonly AffectedBatch[],
  acceptedIndex: number,
): readonly RemainingDayPlacementBatch[] => [
  ...current
    .filter((batch) => batch.sequence < affectedFromSequence)
    .map(cloneBatch),
  ...affected.map((batch) => toEphemeralBatch(batch, acceptedIndex)),
];

const projectAgainstRun = (
  scheduler: RemainingDayForecastScheduler,
  run: RemainingDayActiveRun,
  orders: readonly RemainingDayReadyOrder[],
): readonly RemainingDayForecastDecision[] => {
  let batches: readonly RemainingDayPlacementBatch[] =
    run.batches.map(cloneBatch);
  let queueVersion = run.run.queueVersion;
  let acceptedIndex = 0;
  const decisions: RemainingDayForecastDecision[] = [];

  for (const order of orders) {
    const proposal = scheduler.proposeOnlinePlacement({
      order: {
        id: order.id,
        priority: order.priority,
        derivedWeightLbs: order.derivedWeightLbs,
        bagCount: order.bagCount,
        version: order.version,
      },
      run: { ...run.run, queueVersion },
      machines: run.machines,
      batches,
      mode: { type: 'automatic' },
    });
    if (proposal.kind === 'rejected') {
      decisions.push(needsShift(order, 'placement_rejected'));
      continue;
    }
    if (proposal.overtime.required) {
      decisions.push(needsShift(order, 'current_run_window_exceeded'));
      continue;
    }
    decisions.push({
      productionOrderId: order.id,
      disposition: 'ready_to_place',
      reason: null,
    });
    batches = mergeAcceptedProjection(
      batches,
      proposal.affectedFromSequence,
      proposal.affectedBatches,
      acceptedIndex,
    );
    queueVersion += 1;
    acceptedIndex += 1;
  }
  return decisions;
};

export const projectRemainingDayPlacements = (input: {
  activeRuns: readonly RemainingDayActiveRun[];
  readyOrders: readonly RemainingDayReadyOrder[];
  scheduler: RemainingDayForecastScheduler;
}): RemainingDayPlacementProjection => {
  const orders = [...input.readyOrders].sort(canonicalReadyOrder);
  const activeRun = input.activeRuns[0];
  if (activeRun === undefined)
    return {
      algorithmVersion: 'online-stable-insertion-v1',
      decisions: orders.map((order) => needsShift(order, 'no_active_run')),
    };
  if (input.activeRuns.length > 1)
    return {
      algorithmVersion: 'online-stable-insertion-v1',
      decisions: orders.map((order) =>
        needsShift(order, 'ambiguous_active_run'),
      ),
    };
  return {
    algorithmVersion: 'online-stable-insertion-v1',
    decisions: projectAgainstRun(input.scheduler, activeRun, orders),
  };
};
