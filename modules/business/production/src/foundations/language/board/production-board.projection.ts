import { invariantViolationError } from '@pressly/errors/factories';
import { isUtcIso } from '@pressly/time';
import type {
  ProductionBoardBatch,
  ProductionBoardOrderSummary,
  ProductionBoardPendingOrder,
  ProductionBoardPendingPlacement,
  ProductionBoardPlacementPreview,
  ProductionBoardPlacementTarget,
  ProductionBoardProjection,
  ProductionBoardRun,
  ProductionBoardShift,
  ProductionBoardStageNextActionReadContext,
  UnevaluatedProductionBoardBatch,
  UnevaluatedProductionBoardStage,
} from './production-board-read.model.ts';
import { productionDueBucket } from '../due-dates/production-due-bucket.policy.ts';
import { mapProductionOrderListItem } from '../orders/production-order-list-item.projection.ts';

export { mapProductionOrderListItem } from '../orders/production-order-list-item.projection.ts';

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

const storedProductionInvariant = (
  code: string,
  message: string,
  details?: unknown,
) =>
  invariantViolationError({
    code: code.toLowerCase(),
    message,
    safeMessage: 'Stored production board data is inconsistent.',
    ...(details === undefined ? {} : { details }),
  });

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

type UnknownRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: UnknownRecord, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

const isNonemptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isProductionId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );

const isProductionHash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

const isPositiveInteger = (value: unknown): value is number =>
  Number.isInteger(value) && typeof value === 'number' && value > 0;

const isNonnegativeInteger = (value: unknown): value is number =>
  Number.isInteger(value) && typeof value === 'number' && value >= 0;

const areProductionIds = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(isProductionId);

const dateFromStoredUtcIso = (value: unknown): Date | null =>
  typeof value === 'string' && isUtcIso(value) ? new Date(value) : null;

const decodePlacementTarget = (
  value: unknown,
): ProductionBoardPlacementTarget | null => {
  if (!isRecord(value)) return null;
  if (
    value['kind'] === 'existing_batch' &&
    hasExactKeys(value, ['kind', 'productionBatchId', 'sequence']) &&
    isProductionId(value['productionBatchId']) &&
    isNonnegativeInteger(value['sequence'])
  )
    return {
      kind: 'existing_batch',
      productionBatchId: value['productionBatchId'],
      sequence: value['sequence'],
    };
  if (
    value['kind'] === 'new_batch' &&
    hasExactKeys(value, ['kind', 'sequence']) &&
    isNonnegativeInteger(value['sequence'])
  )
    return { kind: 'new_batch', sequence: value['sequence'] };
  return null;
};

const decodePlacementPreview = (
  value: unknown,
): ProductionBoardPlacementPreview | null => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'target',
      'affectedBatchIds',
      'queueVersion',
      'proposalHash',
      'projectedCompletionAt',
      'overtimeMinutes',
    ])
  )
    return null;
  const target = decodePlacementTarget(value['target']);
  const projectedCompletionAt = dateFromStoredUtcIso(
    value['projectedCompletionAt'],
  );
  if (
    target === null ||
    !areProductionIds(value['affectedBatchIds']) ||
    !isPositiveInteger(value['queueVersion']) ||
    !isProductionHash(value['proposalHash']) ||
    projectedCompletionAt === null ||
    !isNonnegativeInteger(value['overtimeMinutes'])
  )
    return null;
  return {
    target,
    affectedBatchIds: value['affectedBatchIds'],
    queueVersion: value['queueVersion'],
    proposalHash: value['proposalHash'],
    projectedCompletionAt,
    overtimeMinutes: value['overtimeMinutes'],
  };
};

const isPlacementMode = (
  value: unknown,
): value is 'automatic' | 'manager_exact' =>
  value === 'automatic' || value === 'manager_exact';

const isPlacementFailureReason = (
  value: unknown,
): value is Extract<
  ProductionBoardPendingPlacement,
  Readonly<{ status: 'not_placed' }>
>['reason'] =>
  value === 'hard_capacity_exceeded' ||
  value === 'run_not_started' ||
  value === 'run_completed' ||
  value === 'order_not_eligible' ||
  value === 'order_already_scheduled' ||
  value === 'no_mutable_position' ||
  value === 'queue_conflict' ||
  value === 'proposal_stale';

const decodeProductionBoardPendingPlacement = (
  value: unknown,
): ProductionBoardPendingPlacement | null => {
  if (!isRecord(value)) return null;

  if (
    value['status'] === 'awaiting_run' &&
    hasExactKeys(value, ['status', 'reason', 'message']) &&
    (value['reason'] === 'no_started_run' ||
      value['reason'] === 'automatic_placement_not_attempted') &&
    isNonemptyString(value['message'])
  )
    return {
      status: 'awaiting_run',
      reason: value['reason'],
      message: value['message'],
    };

  if (
    value['status'] === 'ambiguous_run' &&
    hasExactKeys(value, [
      'status',
      'reason',
      'message',
      'candidateProductionRunIds',
    ]) &&
    value['reason'] === 'multiple_started_runs' &&
    isNonemptyString(value['message']) &&
    areProductionIds(value['candidateProductionRunIds']) &&
    value['candidateProductionRunIds'].length >= 2
  )
    return {
      status: 'ambiguous_run',
      reason: 'multiple_started_runs',
      message: value['message'],
      candidateProductionRunIds: value['candidateProductionRunIds'],
    };

  if (
    value['status'] === 'confirmation_required' &&
    hasExactKeys(value, [
      'status',
      'mode',
      'productionRunId',
      'target',
      'affectedBatchIds',
      'queueVersion',
      'proposalHash',
      'projectedCompletionAt',
      'overtimeMinutes',
    ]) &&
    isPlacementMode(value['mode']) &&
    isProductionId(value['productionRunId']) &&
    areProductionIds(value['affectedBatchIds']) &&
    isPositiveInteger(value['queueVersion']) &&
    isProductionHash(value['proposalHash']) &&
    isPositiveInteger(value['overtimeMinutes'])
  ) {
    const target = decodePlacementTarget(value['target']);
    const projectedCompletionAt = dateFromStoredUtcIso(
      value['projectedCompletionAt'],
    );
    if (target === null || projectedCompletionAt === null) return null;
    return {
      status: 'confirmation_required',
      mode: value['mode'],
      productionRunId: value['productionRunId'],
      target,
      affectedBatchIds: value['affectedBatchIds'],
      queueVersion: value['queueVersion'],
      proposalHash: value['proposalHash'],
      projectedCompletionAt,
      overtimeMinutes: value['overtimeMinutes'],
    };
  }

  if (
    value['status'] === 'not_placed' &&
    hasExactKeys(value, [
      'status',
      'mode',
      'productionRunId',
      'reason',
      'message',
      'queueVersion',
      'preview',
    ]) &&
    isPlacementMode(value['mode']) &&
    isProductionId(value['productionRunId']) &&
    isPlacementFailureReason(value['reason']) &&
    isNonemptyString(value['message']) &&
    isPositiveInteger(value['queueVersion'])
  ) {
    const preview =
      value['preview'] === null
        ? null
        : decodePlacementPreview(value['preview']);
    if (value['preview'] !== null && preview === null) return null;
    return {
      status: 'not_placed',
      mode: value['mode'],
      productionRunId: value['productionRunId'],
      reason: value['reason'],
      message: value['message'],
      queueVersion: value['queueVersion'],
      preview,
    };
  }

  return null;
};

const mapOrderSummary = (
  row: ProductionBoardOrderRow,
  now: Date,
  timezone: string,
): ProductionBoardOrderSummary => {
  if (row.bagCount === null)
    throw storedProductionInvariant(
      'PRODUCTION_BOARD_INTAKE_MISSING',
      'A production board order is missing completed intake.',
      { productionOrderId: row.id },
    );
  return {
    id: row.id,
    externalOrderId: row.externalOrderId,
    dueAt: row.dueAt,
    dueBucket: productionDueBucket(row.dueAt, now, timezone),
    priority: row.priority,
    derivedWeightLbs: row.derivedWeightLbs,
    bagCount: row.bagCount,
    version: row.version,
  };
};

const mapShift = (row: ProductionBoardShiftRow): ProductionBoardShift => {
  if (
    row.status !== 'draft' &&
    row.status !== 'open' &&
    row.status !== 'closed'
  )
    throw storedProductionInvariant(
      'PRODUCTION_SHIFT_STATUS_INVALID',
      `Unknown production shift status: ${row.status}.`,
      { status: row.status, productionShiftId: row.id },
    );
  return {
    id: row.id,
    locationId: row.locationId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.timezone,
    effectiveFolderCount: row.effectiveFolderCount,
    status: row.status,
    version: row.version,
  };
};

const mapRun = (row: ProductionBoardRunRow): ProductionBoardRun => {
  if (
    row.status !== 'planned' &&
    row.status !== 'started' &&
    row.status !== 'completed'
  )
    throw storedProductionInvariant(
      'PRODUCTION_RUN_STATUS_INVALID',
      `Unknown production run status: ${row.status}.`,
      { status: row.status, productionRunId: row.id },
    );
  return {
    id: row.id,
    productionShiftId: row.productionShiftId,
    status: row.status,
    queueVersion: row.queueVersion,
    plannedCompletionAt: row.plannedCompletionAt,
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
            acknowledgedAt: row.overtimeAcknowledgedAt,
          },
    version: row.version,
  };
};

const mapBatchStatus = (value: string): ProductionBoardBatch['status'] => {
  switch (value) {
    case 'queued':
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
    case 'finished':
      return value;
    default:
      throw storedProductionInvariant(
        'PRODUCTION_BATCH_STATUS_INVALID',
        `Unknown production batch status: ${value}.`,
        { status: value },
      );
  }
};

const mapPlacementProvenance = (
  value: string,
): ProductionBoardBatch['orders'][number]['placementProvenance'] => {
  switch (value) {
    case 'initial_schedule':
    case 'automatic':
    case 'manager_exact':
    case 'manual_rebatch':
    case 'exception_route':
      return value;
    default:
      throw storedProductionInvariant(
        'PRODUCTION_PLACEMENT_PROVENANCE_INVALID',
        `Unknown placement provenance: ${value}.`,
        { provenance: value },
      );
  }
};

const mapStage = (
  row: ProductionBoardStageRow,
  machineIds: readonly string[],
): UnevaluatedProductionBoardStage => {
  if (
    row.stageKind !== 'sorting' &&
    row.stageKind !== 'washing' &&
    row.stageKind !== 'drying' &&
    row.stageKind !== 'folding_packaging'
  )
    throw storedProductionInvariant(
      'PRODUCTION_STAGE_KIND_INVALID',
      `Unknown production stage kind: ${row.stageKind}.`,
      { stageKind: row.stageKind, stageRunId: row.id },
    );
  if (
    row.status !== 'planned' &&
    row.status !== 'started' &&
    row.status !== 'completed'
  )
    throw storedProductionInvariant(
      'PRODUCTION_STAGE_STATUS_INVALID',
      `Unknown production stage status: ${row.status}.`,
      { status: row.status, stageRunId: row.id },
    );
  return {
    id: row.id,
    productionBatchId: row.productionBatchId,
    stage: row.stageKind,
    status: row.status,
    plannedStartAt: row.plannedStartAt,
    plannedEndAt: row.plannedEndAt,
    actualStartAt: row.actualStartAt,
    actualEndAt: row.actualEndAt,
    actualStartProvenance: row.actualStartProvenance,
    actualEndProvenance: row.actualEndProvenance,
    machineIds,
    version: row.version,
  };
};

const defaultPendingPlacement = (
  activeProductionRunIds: readonly string[],
): ProductionBoardPendingPlacement => {
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
): ProductionBoardPendingOrder => {
  const placement = decodeProductionBoardPendingPlacement(row.pendingPlacement);
  if (row.pendingPlacement !== null && placement === null)
    throw storedProductionInvariant(
      'PRODUCTION_PENDING_PLACEMENT_INVALID',
      'An eligible order has invalid pending placement state.',
      { productionOrderId: row.id },
    );
  return {
    ...mapOrderSummary(row, now, timezone),
    placement:
      placement !== null &&
      placement.status !== 'awaiting_run' &&
      placement.status !== 'ambiguous_run'
        ? placement
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

  const stageNextActionContexts: ProductionBoardStageNextActionReadContext[] =
    [];
  const batches = input.batches.map(
    (batch): UnevaluatedProductionBoardBatch => {
      const memberships = (membershipsByBatch.get(batch.id) ?? []).filter(
        (membership) => membership.active || batch.status === 'finished',
      );
      const batchStages = stagesByBatch.get(batch.id) ?? [];
      const stages = batchStages.map(
        (stage, index): UnevaluatedProductionBoardStage => {
          const assigned = assignmentsByStage.get(stage.id) ?? [];
          const mapped = mapStage(
            stage,
            assigned.map((assignment) => assignment.machineId),
          );
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
        },
      );

      const orders = memberships.map(
        (membership): ProductionBoardBatch['orders'][number] => {
          const order = orderById.get(membership.productionOrderId);
          if (order === undefined)
            throw storedProductionInvariant(
              'PRODUCTION_BATCH_ORDER_MISSING',
              'A production batch references a missing order.',
              {
                productionBatchId: membership.productionBatchId,
                productionOrderId: membership.productionOrderId,
              },
            );
          const placementProvenance = mapPlacementProvenance(
            membership.placementProvenance,
          );
          return {
            ...mapOrderSummary(order, input.now, input.shift.timezone),
            placementProvenance,
            pinnedAt: membership.pinnedAt,
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
                frozenAt: batch.membershipFrozenAt,
                frozenBy: batch.membershipFrozenBy,
              },
        orders,
        stages,
        version: batch.version,
      };
    },
  );

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
      asOf: input.now,
    },
    stageNextActionContexts,
    orders: input.orders.map((order) =>
      mapProductionOrderListItem(order, input.now, input.shift.timezone),
    ),
  };
};
