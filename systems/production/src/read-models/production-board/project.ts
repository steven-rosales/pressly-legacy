import type { ProductionBoard as ProductionBoardResult } from './contract.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import type { StageNextAction } from '../../model/public.ts';
import type {
  BoardAssignmentRow,
  BoardBatch,
  BoardBatchOrder,
  BoardDueBucket,
  BoardOrderListItem,
  BoardOrderRow,
  BoardOrderSummary,
  BoardPendingOrder,
  BoardPendingPlacement,
  BoardPlacementPreview,
  BoardPlacementTarget,
  BoardProjection,
  BoardProjectionInput,
  BoardRun,
  BoardRunRow,
  BoardShift,
  BoardShiftRow,
  BoardStage,
  BoardStageNextAction,
  BoardStageNextActionReadContext,
  BoardStageRow,
  BoardPolicy,
  ProductionBoard,
  UnevaluatedBoardBatch,
  UnevaluatedBoardStage,
} from './model.ts';

const stageRank: Readonly<Record<string, number>> = {
  sorting: 0,
  washing: 1,
  drying: 2,
  folding_packaging: 3,
};

const storedBoardInvariant = (
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

const storedOrderInvariant = (
  code: string,
  message: string,
  details?: unknown,
) =>
  invariantViolationError({
    code: code.toLowerCase(),
    message,
    safeMessage: 'Stored production order data is inconsistent.',
    ...(details === undefined ? {} : { details }),
  });

const boardInvariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
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

const utcIsoPattern =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<millisecond>\d{1,3}))?Z$/;

const isUtcIso = (value: string): boolean => {
  const match = utcIsoPattern.exec(value);
  if (match?.groups === undefined) return false;
  const millisecond = Number(
    (match.groups['millisecond'] ?? '0').padEnd(3, '0'),
  );
  const parsed = new Date(
    Date.UTC(
      Number(match.groups['year']),
      Number(match.groups['month']) - 1,
      Number(match.groups['day']),
      Number(match.groups['hour']),
      Number(match.groups['minute']),
      Number(match.groups['second']),
      millisecond,
    ),
  );
  return (
    parsed.getUTCFullYear() === Number(match.groups['year']) &&
    parsed.getUTCMonth() + 1 === Number(match.groups['month']) &&
    parsed.getUTCDate() === Number(match.groups['day']) &&
    parsed.getUTCHours() === Number(match.groups['hour']) &&
    parsed.getUTCMinutes() === Number(match.groups['minute']) &&
    parsed.getUTCSeconds() === Number(match.groups['second']) &&
    parsed.getUTCMilliseconds() === millisecond
  );
};

type CalendarDate = Readonly<{ year: number; month: number; day: number }>;

const calendarDateAt = (timezone: string, instant: Date): CalendarDate => {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day') };
};

const calendarOrdinal = (date: CalendarDate): number =>
  Date.UTC(date.year, date.month - 1, date.day);

const dueBucket = (
  dueAt: Date,
  now: Date,
  timezone: string,
): BoardDueBucket => {
  const distance = Math.round(
    (calendarOrdinal(calendarDateAt(timezone, dueAt)) -
      calendarOrdinal(calendarDateAt(timezone, now))) /
      86_400_000,
  );

  if (distance < 0) return 'overdue';
  if (distance === 0) return 'today';
  if (distance === 1) return 'tomorrow';
  return 'later';
};

const decodePlacementTarget = (value: unknown): BoardPlacementTarget | null => {
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
): BoardPlacementPreview | null => {
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
  BoardPendingPlacement,
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

const decodePendingPlacement = (
  value: unknown,
): BoardPendingPlacement | null => {
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
  row: BoardOrderRow,
  now: Date,
  timezone: string,
): BoardOrderSummary => {
  if (row.bagCount === null)
    throw storedBoardInvariant(
      'PRODUCTION_BOARD_INTAKE_MISSING',
      'A production board order is missing completed intake.',
      { productionOrderId: row.id },
    );
  return {
    id: row.id,
    externalOrderId: row.externalOrderId,
    dueAt: row.dueAt,
    dueBucket: dueBucket(row.dueAt, now, timezone),
    priority: row.priority,
    derivedWeightLbs: row.derivedWeightLbs,
    bagCount: row.bagCount,
    version: row.version,
  };
};

const mapOrderStatus = (value: string): BoardOrderListItem['status'] => {
  switch (value) {
    case 'release_pending':
    case 'intake_pending':
    case 'eligible':
    case 'ineligible':
    case 'scheduled':
    case 'finished':
      return value;
    default:
      throw storedOrderInvariant(
        'PRODUCTION_ORDER_STATUS_INVALID',
        `Unknown production order status: ${value}.`,
        { status: value },
      );
  }
};

const mapBagCountProvenance = (
  value: string | null,
): BoardOrderListItem['bagCountProvenance'] => {
  if (
    value === null ||
    value === 'external_source' ||
    value === 'operator_intake'
  )
    return value;
  throw storedOrderInvariant(
    'PRODUCTION_BAG_COUNT_PROVENANCE_INVALID',
    `Unknown bag-count provenance: ${value}.`,
    { provenance: value },
  );
};

export const projectBoardOrderListItem = (
  row: BoardOrderRow,
  now: Date,
  timezone: string,
): BoardOrderListItem => {
  const status = mapOrderStatus(row.status);
  const bagCountProvenance = mapBagCountProvenance(row.bagCountSource);

  if ((row.bagCount === null) !== (bagCountProvenance === null))
    throw storedOrderInvariant(
      'PRODUCTION_BAG_COUNT_STATE_INVALID',
      'Bag count and provenance disagree in persistence.',
      { bagCount: row.bagCount, bagCountProvenance },
    );
  if (row.bagCount === null && row.intakeVersion !== 0)
    throw storedOrderInvariant(
      'PRODUCTION_BAG_INTAKE_VERSION_INVALID',
      'Missing bag intake must have persistence version zero.',
      { bagCount: row.bagCount, intakeVersion: row.intakeVersion },
    );
  if (row.bagCount !== null && row.intakeVersion <= 0)
    throw storedOrderInvariant(
      'PRODUCTION_BAG_INTAKE_VERSION_INVALID',
      'Recorded bag intake requires a positive version.',
      { bagCount: row.bagCount, intakeVersion: row.intakeVersion },
    );
  if (status === 'intake_pending' && row.bagCount !== null)
    throw storedOrderInvariant(
      'PRODUCTION_BAG_INTAKE_STATE_INVALID',
      'An intake-pending order already has bag intake.',
      { status, bagCount: row.bagCount },
    );
  if (
    status !== 'release_pending' &&
    status !== 'intake_pending' &&
    status !== 'ineligible' &&
    row.bagCount === null
  )
    throw storedOrderInvariant(
      'PRODUCTION_BAG_INTAKE_STATE_INVALID',
      'A non-pending order is missing bag intake.',
      { status, bagCount: row.bagCount },
    );

  return {
    id: row.id,
    locationId: row.locationId,
    externalOrderId: row.externalOrderId,
    dueAt: row.dueAt,
    dueBucket: dueBucket(row.dueAt, now, timezone),
    priority: row.priority,
    status,
    derivedWeightLbs: row.derivedWeightLbs,
    bagCount: row.bagCount,
    bagCountProvenance,
    intakeVersion: row.bagCount === null ? null : row.intakeVersion,
    version: row.version,
  };
};

const mapShift = (row: BoardShiftRow): BoardShift => {
  if (
    row.status !== 'draft' &&
    row.status !== 'open' &&
    row.status !== 'closed'
  )
    throw storedBoardInvariant(
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

const mapRun = (row: BoardRunRow): BoardRun => {
  if (
    row.status !== 'planned' &&
    row.status !== 'started' &&
    row.status !== 'completed'
  )
    throw storedBoardInvariant(
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

const mapBatchStatus = (value: string): BoardBatch['status'] => {
  switch (value) {
    case 'queued':
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
    case 'finished':
      return value;
    default:
      throw storedBoardInvariant(
        'PRODUCTION_BATCH_STATUS_INVALID',
        `Unknown production batch status: ${value}.`,
        { status: value },
      );
  }
};

const mapPlacementProvenance = (
  value: string,
): BoardBatchOrder['placementProvenance'] => {
  switch (value) {
    case 'initial_schedule':
    case 'automatic':
    case 'manager_exact':
    case 'manual_rebatch':
    case 'exception_route':
      return value;
    default:
      throw storedBoardInvariant(
        'PRODUCTION_PLACEMENT_PROVENANCE_INVALID',
        `Unknown placement provenance: ${value}.`,
        { provenance: value },
      );
  }
};

const mapStage = (
  row: BoardStageRow,
  machineIds: readonly string[],
): UnevaluatedBoardStage => {
  if (
    row.stageKind !== 'sorting' &&
    row.stageKind !== 'washing' &&
    row.stageKind !== 'drying' &&
    row.stageKind !== 'folding_packaging'
  )
    throw storedBoardInvariant(
      'PRODUCTION_STAGE_KIND_INVALID',
      `Unknown production stage kind: ${row.stageKind}.`,
      { stageKind: row.stageKind, stageRunId: row.id },
    );
  if (
    row.status !== 'planned' &&
    row.status !== 'started' &&
    row.status !== 'completed'
  )
    throw storedBoardInvariant(
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
): BoardPendingPlacement => {
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
  row: BoardOrderRow,
  now: Date,
  timezone: string,
  activeProductionRunIds: readonly string[],
): BoardPendingOrder => {
  const placement = decodePendingPlacement(row.pendingPlacement);
  if (row.pendingPlacement !== null && placement === null)
    throw storedBoardInvariant(
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
  left: BoardAssignmentRow,
  right: BoardAssignmentRow,
): boolean =>
  left.plannedStartAt < right.plannedEndAt &&
  left.plannedEndAt > right.plannedStartAt;

export const projectBoardSnapshot = (
  input: BoardProjectionInput,
): BoardProjection => {
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

  const stageNextActionContexts: BoardStageNextActionReadContext[] = [];
  const batches = input.batches.map((batch): UnevaluatedBoardBatch => {
    const memberships = (membershipsByBatch.get(batch.id) ?? []).filter(
      (membership) => membership.active || batch.status === 'finished',
    );
    const batchStages = stagesByBatch.get(batch.id) ?? [];
    const stages = batchStages.map((stage, index): UnevaluatedBoardStage => {
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
    });

    const orders = memberships.map((membership): BoardBatchOrder => {
      const order = orderById.get(membership.productionOrderId);
      if (order === undefined)
        throw storedBoardInvariant(
          'PRODUCTION_BATCH_ORDER_MISSING',
          'A production batch references a missing order.',
          {
            productionBatchId: membership.productionBatchId,
            productionOrderId: membership.productionOrderId,
          },
        );
      return {
        ...mapOrderSummary(order, input.now, input.shift.timezone),
        placementProvenance: mapPlacementProvenance(
          membership.placementProvenance,
        ),
        pinnedAt: membership.pinnedAt,
        pinnedBy: membership.pinnedBy,
      };
    });

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
      asOf: input.now,
    },
    stageNextActionContexts,
    // This validation side effect is intentionally retained even though the
    // dedicated board result currently consumes only the board projection.
    orders: input.orders.map((order) =>
      projectBoardOrderListItem(order, input.now, input.shift.timezone),
    ),
  };
};

const policyDate = (value: string, field: string): Date => {
  if (!isUtcIso(value))
    throw boardInvariant(
      'production_board_stage_next_action_time_invalid',
      `Stage next-action ${field} is not a UTC timestamp.`,
    );
  return new Date(value);
};

const toBoardStageNextAction = (
  action: StageNextAction,
): BoardStageNextAction => {
  switch (action.state) {
    case 'available':
    case 'terminal':
      return action;
    case 'blocked':
      return {
        ...action,
        availableAt:
          action.availableAt === null
            ? null
            : policyDate(action.availableAt, 'availableAt'),
      };
    case 'confirmation_required':
      return action.action === 'start'
        ? {
            ...action,
            availableAt: policyDate(action.availableAt, 'availableAt'),
            timing: {
              plannedStartAt: policyDate(
                action.timing.plannedStartAt,
                'timing.plannedStartAt',
              ),
              plannedEndAt: policyDate(
                action.timing.plannedEndAt,
                'timing.plannedEndAt',
              ),
              observedAt: policyDate(
                action.timing.observedAt,
                'timing.observedAt',
              ),
              remainingMilliseconds: action.timing.remainingMilliseconds,
            },
          }
        : {
            ...action,
            availableAt: policyDate(action.availableAt, 'availableAt'),
            timing: {
              actualStartAt: policyDate(
                action.timing.actualStartAt,
                'timing.actualStartAt',
              ),
              plannedEndAt: policyDate(
                action.timing.plannedEndAt,
                'timing.plannedEndAt',
              ),
              completionBoundaryAt: policyDate(
                action.timing.completionBoundaryAt,
                'timing.completionBoundaryAt',
              ),
              observedAt: policyDate(
                action.timing.observedAt,
                'timing.observedAt',
              ),
              plannedDurationMilliseconds:
                action.timing.plannedDurationMilliseconds,
              elapsedMilliseconds: action.timing.elapsedMilliseconds,
              remainingMilliseconds: action.timing.remainingMilliseconds,
            },
          };
  }
};

export const evaluateBoardProjection = (
  projection: BoardProjection,
  policy: BoardPolicy,
): ProductionBoard => {
  const contextByStageId = new Map(
    projection.stageNextActionContexts.map((context) => [
      context.stageRunId,
      context,
    ]),
  );
  return {
    ...projection.board,
    batches: projection.board.batches.map(
      (batch): BoardBatch => ({
        ...batch,
        stages: batch.stages.map((stage): BoardStage => {
          const evaluation = contextByStageId.get(stage.id);
          if (evaluation === undefined)
            throw boardInvariant(
              'production_board_stage_context_missing',
              `Stage ${stage.id} is missing next-action context.`,
            );
          const decision = policy.evaluateStageNextAction(
            evaluation.entity,
            evaluation.context,
          );
          if (decision.tag === 'err')
            throw boardInvariant(
              'production_board_stage_next_action_invalid',
              `Stage ${stage.id} next action could not be evaluated: ${decision.error.code}.`,
            );
          const nextAction = toBoardStageNextAction(decision.value);
          return {
            ...stage,
            nextAction,
          };
        }),
      }),
    ),
  };
};

const serializeStageNextAction = (
  action: BoardStageNextAction,
): ProductionBoardResult['batches'][number]['stages'][number]['nextAction'] => {
  switch (action.state) {
    case 'available':
    case 'terminal':
      return action;
    case 'blocked':
      return {
        ...action,
        availableAt: action.availableAt?.toISOString() ?? null,
      };
    case 'confirmation_required':
      return action.action === 'start'
        ? {
            ...action,
            availableAt: action.availableAt.toISOString(),
            timing: {
              ...action.timing,
              plannedStartAt: action.timing.plannedStartAt.toISOString(),
              plannedEndAt: action.timing.plannedEndAt.toISOString(),
              observedAt: action.timing.observedAt.toISOString(),
            },
          }
        : {
            ...action,
            availableAt: action.availableAt.toISOString(),
            timing: {
              ...action.timing,
              actualStartAt: action.timing.actualStartAt.toISOString(),
              plannedEndAt: action.timing.plannedEndAt.toISOString(),
              completionBoundaryAt:
                action.timing.completionBoundaryAt.toISOString(),
              observedAt: action.timing.observedAt.toISOString(),
            },
          };
  }
};

const serializePendingPlacement = (
  placement: BoardPendingPlacement,
): ProductionBoardResult['eligibleOrders'][number]['placement'] => {
  switch (placement.status) {
    case 'awaiting_run':
      return { ...placement };
    case 'ambiguous_run':
      return {
        ...placement,
        candidateProductionRunIds: [...placement.candidateProductionRunIds],
      };
    case 'confirmation_required':
      return {
        ...placement,
        target: { ...placement.target },
        affectedBatchIds: [...placement.affectedBatchIds],
        projectedCompletionAt: placement.projectedCompletionAt.toISOString(),
      };
    case 'not_placed':
      return {
        ...placement,
        preview:
          placement.preview === null
            ? null
            : {
                ...placement.preview,
                target: { ...placement.preview.target },
                affectedBatchIds: [...placement.preview.affectedBatchIds],
                projectedCompletionAt:
                  placement.preview.projectedCompletionAt.toISOString(),
              },
      };
  }
};

export const serializeBoard = (
  board: ProductionBoard,
): ProductionBoardResult => ({
  productionShift: {
    ...board.productionShift,
    startsAt: board.productionShift.startsAt.toISOString(),
    endsAt: board.productionShift.endsAt.toISOString(),
  },
  productionRun: {
    ...board.productionRun,
    plannedCompletionAt: board.productionRun.plannedCompletionAt.toISOString(),
    overtimeAcknowledgement:
      board.productionRun.overtimeAcknowledgement === null
        ? null
        : {
            ...board.productionRun.overtimeAcknowledgement,
            acknowledgedAt:
              board.productionRun.overtimeAcknowledgement.acknowledgedAt.toISOString(),
          },
  },
  batches: board.batches.map((batch) => ({
    ...batch,
    membership:
      batch.membership.state === 'mutable'
        ? { state: 'mutable' as const }
        : {
            ...batch.membership,
            frozenAt: batch.membership.frozenAt.toISOString(),
          },
    orders: batch.orders.map((order) => ({
      ...order,
      dueAt: order.dueAt.toISOString(),
      pinnedAt: order.pinnedAt?.toISOString() ?? null,
    })),
    stages: batch.stages.map((stage) => ({
      ...stage,
      plannedStartAt: stage.plannedStartAt.toISOString(),
      plannedEndAt: stage.plannedEndAt.toISOString(),
      actualStartAt: stage.actualStartAt?.toISOString() ?? null,
      actualEndAt: stage.actualEndAt?.toISOString() ?? null,
      machineIds: [...stage.machineIds],
      nextAction: serializeStageNextAction(stage.nextAction),
    })),
  })),
  eligibleOrders: board.eligibleOrders.map((order) => ({
    ...order,
    dueAt: order.dueAt.toISOString(),
    placement: serializePendingPlacement(order.placement),
  })),
  asOf: board.asOf.toISOString(),
});
