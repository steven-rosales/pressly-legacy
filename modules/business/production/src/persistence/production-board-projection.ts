import {
  productionPendingPlacementSchema,
  type ProductionBatch,
  type ProductionOrderListItem,
  type ProductionOrderSummary,
  type ProductionPendingOrder,
  type ProductionPendingPlacement,
  type ProductionRunSummary,
  type ProductionShift,
} from '@pressly/contracts';
import type {
  ProductionBoardProjection,
  StageNextActionReadContext,
  UnevaluatedProductionBatch,
  UnevaluatedStageRun,
} from '../production-board-read.policy.ts';
import { productionDueBucket } from './production-due-bucket.policy.ts';

export type ProductionBoardShiftRow = Readonly<{
  id: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  effectiveFolderCount: number;
  status: string;
  version: number;
}>;

export type ProductionBoardRunRow = Readonly<{
  id: string;
  productionShiftId: string;
  status: string;
  queueVersion: number;
  plannedCompletionAt: Date;
  overtimeProposalHash: string | null;
  overtimeQueueVersion: number | null;
  overtimeAcknowledgedBy: string | null;
  overtimeAcknowledgedAt: Date | null;
  version: number;
}>;

export type ProductionBoardOrderRow = Readonly<{
  id: string;
  locationId: string;
  orderDemandId: string;
  externalOrderId: string;
  dueAt: Date;
  priority: boolean;
  status: string;
  derivedWeightLbs: number;
  bagCount: number | null;
  bagCountSource: string | null;
  intakeVersion: number;
  pendingPlacement: unknown;
  version: number;
}>;

export type ProductionBoardBatchRow = Readonly<{
  id: string;
  sequenceIndex: number;
  status: string;
  derivedWeightLbs: number;
  pulseCapacityLbs: number;
  pulseMinutes: number;
  membershipFrozenAt: Date | null;
  membershipFrozenBy: string | null;
  version: number;
}>;

export type ProductionBoardBatchOrderRow = Readonly<{
  productionBatchId: string;
  productionOrderId: string;
  active: boolean;
  placementProvenance: string;
  pinnedAt: Date | null;
  pinnedBy: string | null;
}>;

export type ProductionBoardStageRow = Readonly<{
  id: string;
  productionBatchId: string;
  stageKind: string;
  status: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  actualStartProvenance: 'live_observed' | 'operator_reported' | 'not_recorded';
  actualEndProvenance: 'live_observed' | 'operator_reported' | 'not_recorded';
  version: number;
}>;

export type ProductionBoardAssignmentRow = Readonly<{
  stageRunId: string;
  machineId: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
}>;

export type ProductionBoardActiveStageRow = Readonly<{
  id: string;
  stageKind: string;
}>;

const stageRank: Readonly<Record<string, number>> = {
  sorting: 0,
  washing: 1,
  drying: 2,
  folding_packaging: 3,
};

const groupBy = <Row, Key>(
  rows: readonly Row[],
  keyOf: (row: Row) => Key,
): Map<Key, Row[]> => {
  const groups = new Map<Key, Row[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [row]);
    else group.push(row);
  }
  return groups;
};

const mapOrderStatus = (value: string): ProductionOrderListItem['status'] => {
  switch (value) {
    case 'release_pending':
    case 'intake_pending':
    case 'eligible':
    case 'ineligible':
    case 'scheduled':
    case 'finished':
      return value;
    default:
      throw new Error(`Unknown production order status: ${value}.`);
  }
};

const mapBagCountProvenance = (
  value: string | null,
): ProductionOrderListItem['bagCountProvenance'] => {
  if (
    value === null ||
    value === 'external_source' ||
    value === 'operator_intake'
  )
    return value;
  throw new Error(`Unknown bag-count provenance: ${value}.`);
};

export const mapProductionOrderListItem = (
  row: ProductionBoardOrderRow,
  now: Date,
  timezone: string,
): ProductionOrderListItem => {
  const status = mapOrderStatus(row.status);
  const bagCountProvenance = mapBagCountProvenance(row.bagCountSource);
  if ((row.bagCount === null) !== (bagCountProvenance === null))
    throw new Error('Bag count and provenance disagree in persistence.');
  if (row.bagCount === null && row.intakeVersion !== 0)
    throw new Error('Missing bag intake must have persistence version zero.');
  if (row.bagCount !== null && row.intakeVersion <= 0)
    throw new Error('Recorded bag intake requires a positive version.');
  if (status === 'intake_pending' && row.bagCount !== null)
    throw new Error('An intake-pending order already has bag intake.');
  if (
    status !== 'release_pending' &&
    status !== 'intake_pending' &&
    status !== 'ineligible' &&
    row.bagCount === null
  )
    throw new Error('A non-pending order is missing bag intake.');

  return {
    id: row.id,
    locationId: row.locationId,
    externalOrderId: row.externalOrderId,
    dueAt: row.dueAt.toISOString(),
    dueBucket: productionDueBucket(row.dueAt, now, timezone),
    priority: row.priority,
    status,
    derivedWeightLbs: row.derivedWeightLbs,
    bagCount: row.bagCount,
    bagCountProvenance,
    intakeVersion: row.bagCount === null ? null : row.intakeVersion,
    version: row.version,
  };
};

const mapOrderSummary = (
  row: ProductionBoardOrderRow,
  now: Date,
  timezone: string,
): ProductionOrderSummary => {
  if (row.bagCount === null)
    throw new Error('A production board order is missing completed intake.');
  return {
    id: row.id,
    externalOrderId: row.externalOrderId,
    dueAt: row.dueAt.toISOString(),
    dueBucket: productionDueBucket(row.dueAt, now, timezone),
    priority: row.priority,
    derivedWeightLbs: row.derivedWeightLbs,
    bagCount: row.bagCount,
    version: row.version,
  };
};

const mapShift = (row: ProductionBoardShiftRow): ProductionShift => {
  if (
    row.status !== 'draft' &&
    row.status !== 'open' &&
    row.status !== 'closed'
  )
    throw new Error(`Unknown production shift status: ${row.status}.`);
  return {
    id: row.id,
    locationId: row.locationId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timezone: row.timezone,
    effectiveFolderCount: row.effectiveFolderCount,
    status: row.status,
    version: row.version,
  };
};

const mapRun = (row: ProductionBoardRunRow): ProductionRunSummary => {
  if (
    row.status !== 'planned' &&
    row.status !== 'started' &&
    row.status !== 'completed'
  )
    throw new Error(`Unknown production run status: ${row.status}.`);
  return {
    id: row.id,
    productionShiftId: row.productionShiftId,
    status: row.status,
    queueVersion: row.queueVersion,
    plannedCompletionAt: row.plannedCompletionAt.toISOString(),
    overtimeAcknowledgement:
      row.overtimeProposalHash === null ||
      row.overtimeQueueVersion === null ||
      row.overtimeAcknowledgedBy === null ||
      row.overtimeAcknowledgedAt === null
        ? null
        : {
            proposalHash: row.overtimeProposalHash,
            queueVersion: row.overtimeQueueVersion,
            acknowledgedBy: row.overtimeAcknowledgedBy,
            acknowledgedAt: row.overtimeAcknowledgedAt.toISOString(),
          },
    version: row.version,
  };
};

const mapBatchStatus = (value: string): ProductionBatch['status'] => {
  switch (value) {
    case 'queued':
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
    case 'finished':
      return value;
    default:
      throw new Error(`Unknown production batch status: ${value}.`);
  }
};

const mapStage = (row: ProductionBoardStageRow): UnevaluatedStageRun => {
  if (
    row.stageKind !== 'sorting' &&
    row.stageKind !== 'washing' &&
    row.stageKind !== 'drying' &&
    row.stageKind !== 'folding_packaging'
  )
    throw new Error(`Unknown production stage kind: ${row.stageKind}.`);
  if (
    row.status !== 'planned' &&
    row.status !== 'started' &&
    row.status !== 'completed'
  )
    throw new Error(`Unknown production stage status: ${row.status}.`);
  return {
    id: row.id,
    productionBatchId: row.productionBatchId,
    stage: row.stageKind,
    status: row.status,
    plannedStartAt: row.plannedStartAt.toISOString(),
    plannedEndAt: row.plannedEndAt.toISOString(),
    actualStartAt: row.actualStartAt?.toISOString() ?? null,
    actualEndAt: row.actualEndAt?.toISOString() ?? null,
    actualStartProvenance: row.actualStartProvenance,
    actualEndProvenance: row.actualEndProvenance,
    machineIds: [],
    version: row.version,
  };
};

const defaultPendingPlacement = (
  activeProductionRunIds: readonly string[],
): ProductionPendingPlacement => {
  if (activeProductionRunIds.length > 1)
    return {
      status: 'ambiguous_run',
      reason: 'multiple_started_runs',
      message:
        'More than one production run is active; choose the intended run before placing this order.',
      candidateProductionRunIds: [...activeProductionRunIds].sort(),
    };
  if (activeProductionRunIds.length === 0)
    return {
      status: 'awaiting_run',
      reason: 'no_started_run',
      message: 'This order is waiting for a production run to start.',
    };
  return {
    status: 'awaiting_run',
    reason: 'automatic_placement_not_attempted',
    message: 'Automatic placement has not completed; it can be retried.',
  };
};

const mapPendingOrder = (
  row: ProductionBoardOrderRow,
  now: Date,
  timezone: string,
  activeProductionRunIds: readonly string[],
): ProductionPendingOrder => {
  const parsed = productionPendingPlacementSchema.safeParse(
    row.pendingPlacement,
  );
  if (row.pendingPlacement !== null && !parsed.success)
    throw new Error('An eligible order has invalid pending placement state.');
  return {
    ...mapOrderSummary(row, now, timezone),
    placement:
      parsed.success &&
      parsed.data.status !== 'awaiting_run' &&
      parsed.data.status !== 'ambiguous_run'
        ? parsed.data
        : defaultPendingPlacement(activeProductionRunIds),
  };
};

const overlaps = (
  left: ProductionBoardAssignmentRow,
  right: ProductionBoardAssignmentRow,
): boolean =>
  left.plannedStartAt < right.plannedEndAt &&
  left.plannedEndAt > right.plannedStartAt;

export const projectProductionBoard = (input: {
  shift: ProductionBoardShiftRow;
  run: ProductionBoardRunRow;
  orders: readonly ProductionBoardOrderRow[];
  batches: readonly ProductionBoardBatchRow[];
  batchOrders: readonly ProductionBoardBatchOrderRow[];
  stages: readonly ProductionBoardStageRow[];
  assignments: readonly ProductionBoardAssignmentRow[];
  activeStages: readonly ProductionBoardActiveStageRow[];
  activeProductionRunIds: readonly string[];
  now: Date;
}): ProductionBoardProjection => {
  const orderById = new Map(input.orders.map((order) => [order.id, order]));
  const membershipsByBatch = groupBy(
    input.batchOrders,
    (membership) => membership.productionBatchId,
  );
  const stagesByBatch = groupBy(
    input.stages,
    (stage) => stage.productionBatchId,
  );
  const assignmentsByStage = groupBy(
    input.assignments,
    (assignment) => assignment.stageRunId,
  );
  const assignmentsByMachine = groupBy(
    input.assignments,
    (assignment) => assignment.machineId,
  );

  for (const stages of stagesByBatch.values())
    stages.sort(
      (left, right) =>
        left.plannedStartAt.getTime() - right.plannedStartAt.getTime() ||
        (stageRank[left.stageKind] ?? Number.MAX_SAFE_INTEGER) -
          (stageRank[right.stageKind] ?? Number.MAX_SAFE_INTEGER),
    );

  const stageNextActionContexts: StageNextActionReadContext[] = [];
  const batches = input.batches.map((batch): UnevaluatedProductionBatch => {
    const memberships = (membershipsByBatch.get(batch.id) ?? []).filter(
      (membership) => membership.active || batch.status === 'finished',
    );
    const batchStages = stagesByBatch.get(batch.id) ?? [];
    const stages = batchStages.map((stage, index): UnevaluatedStageRun => {
      const mapped = mapStage(stage);
      const assigned = assignmentsByStage.get(stage.id) ?? [];
      const overlappingMachineIds = assigned.flatMap((assignment) =>
        (assignmentsByMachine.get(assignment.machineId) ?? []).some(
          (candidate) =>
            candidate.stageRunId !== stage.id &&
            overlaps(candidate, assignment),
        )
          ? [assignment.machineId]
          : [],
      );
      const previous = index === 0 ? undefined : batchStages[index - 1];
      mapped.machineIds.push(
        ...assigned.map((assignment) => assignment.machineId),
      );
      stageNextActionContexts.push({
        stageRunId: stage.id,
        entity: {
          state: stage.status,
          plannedStartAt: stage.plannedStartAt,
          plannedEndAt: stage.plannedEndAt,
          actualStartAt: stage.actualStartAt,
        },
        context: {
          now: input.now,
          productionRunStarted: input.run.status === 'started',
          previousStageCompleted:
            previous === undefined || previous.status === 'completed',
          sameKindAlreadyActive: input.activeStages.some(
            (candidate) =>
              candidate.id !== stage.id &&
              candidate.stageKind === stage.stageKind,
          ),
          machinesRequired:
            stage.stageKind === 'washing' || stage.stageKind === 'drying',
          assignedMachineIds: assigned.map(
            (assignment) => assignment.machineId,
          ),
          overlappingMachineIds,
        },
      });
      return mapped;
    });

    const orders = memberships.map(
      (membership): ProductionBatch['orders'][number] => {
        const order = orderById.get(membership.productionOrderId);
        if (order === undefined)
          throw new Error('A production batch references a missing order.');
        if (
          membership.placementProvenance !== 'initial_schedule' &&
          membership.placementProvenance !== 'automatic' &&
          membership.placementProvenance !== 'manager_exact'
        )
          throw new Error(
            `Unknown placement provenance: ${membership.placementProvenance}.`,
          );
        return {
          ...mapOrderSummary(order, input.now, input.shift.timezone),
          placementProvenance: membership.placementProvenance,
          pinnedAt: membership.pinnedAt?.toISOString() ?? null,
          pinnedBy: membership.pinnedBy,
        };
      },
    );

    return {
      id: batch.id,
      sequence: batch.sequenceIndex,
      status: mapBatchStatus(batch.status),
      derivedWeightLbs: batch.derivedWeightLbs,
      pulseCapacityLbs: batch.pulseCapacityLbs,
      pulseMinutes: batch.pulseMinutes,
      membership:
        batch.membershipFrozenAt === null || batch.membershipFrozenBy === null
          ? { state: 'mutable' }
          : {
              state: 'frozen',
              frozenAt: batch.membershipFrozenAt.toISOString(),
              frozenBy: batch.membershipFrozenBy,
            },
      orders,
      stages,
      version: batch.version,
    };
  });

  return {
    board: {
      productionShift: mapShift(input.shift),
      productionRun: mapRun(input.run),
      batches,
      eligibleOrders: input.orders
        .filter(
          (order) => order.status === 'eligible' && order.bagCount !== null,
        )
        .map((order) =>
          mapPendingOrder(
            order,
            input.now,
            input.shift.timezone,
            input.activeProductionRunIds,
          ),
        ),
      asOf: input.now.toISOString(),
    },
    stageNextActionContexts,
    orders: input.orders.map((order) =>
      mapProductionOrderListItem(order, input.now, input.shift.timezone),
    ),
  };
};
