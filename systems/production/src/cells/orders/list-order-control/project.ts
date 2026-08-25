import type { ListProductionOrderControlResult } from '../../../read-models/production-order-control/contract.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import { productionDueBucket } from './due.ts';
import type {
  ListOrderControlResult,
  OrderControlPersistenceRow,
  ProductionBagCountProvenance,
  ProductionOrder,
  ProductionOrderControlItem,
  ProductionOrderRouteAttempt,
  RoutableBatchStatus,
} from './types.ts';

const invariant = (code: string, message: string, details?: unknown) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Stored production order data is inconsistent.',
    ...(details === undefined ? {} : { details }),
  });

export const projectBatchStatus = (value: string): RoutableBatchStatus => {
  switch (value) {
    case 'queued':
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
    case 'finished':
      return value;
    default:
      throw invariant(
        'production_order_control_batch_status_invalid',
        `Unknown production batch status: ${value}.`,
      );
  }
};

export const projectStage = (
  value: string,
): ProductionOrderRouteAttempt['stage'] => {
  switch (value) {
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
      return value;
    default:
      throw invariant(
        'production_order_control_stage_invalid',
        `Unknown production stage: ${value}.`,
      );
  }
};

export const projectStageStatus = (
  value: string,
): ProductionOrderRouteAttempt['stageStatus'] => {
  if (value === 'planned' || value === 'started' || value === 'completed')
    return value;
  throw invariant(
    'production_order_control_stage_status_invalid',
    `Unknown stage-run status: ${value}.`,
  );
};

export const projectAttemptStatus = (
  value: string,
): ProductionOrderRouteAttempt['status'] => {
  if (value === 'assigned' || value === 'completed' || value === 'released')
    return value;
  throw invariant(
    'production_order_control_attempt_status_invalid',
    `Unknown order-stage attempt status: ${value}.`,
  );
};

export const projectAssignmentReason = (
  value: string,
): ProductionOrderRouteAttempt['assignmentReason'] => {
  switch (value) {
    case 'initial_schedule':
    case 'automatic':
    case 'manager_exact':
    case 'manual_rebatch':
    case 'needs_more_drying':
    case 'rewash_required':
    case 'sorting_incomplete':
    case 'stage_incomplete':
    case 'other':
      return value;
    default:
      throw invariant(
        'production_order_control_assignment_reason_invalid',
        `Unknown order-stage assignment reason: ${value}.`,
      );
  }
};

export const projectRouteReason = (
  value: string | null,
): ProductionOrderRouteAttempt['releaseReason'] => {
  if (value === null) return null;
  switch (value) {
    case 'manual_rebatch':
    case 'needs_more_drying':
    case 'rewash_required':
    case 'sorting_incomplete':
    case 'stage_incomplete':
    case 'other':
      return value;
    default:
      throw invariant(
        'production_order_control_release_reason_invalid',
        `Unknown order-stage release reason: ${value}.`,
      );
  }
};

export const projectPlacementProvenance = (
  value: string,
): NonNullable<
  ProductionOrderControlItem['currentPlacement']
>['placementProvenance'] => {
  switch (value) {
    case 'initial_schedule':
    case 'automatic':
    case 'manager_exact':
    case 'manual_rebatch':
    case 'exception_route':
      return value;
    default:
      throw invariant(
        'production_order_control_placement_provenance_invalid',
        `Unknown production placement provenance: ${value}.`,
      );
  }
};

export const projectSourceAdmissionState = (
  value: string,
): 'unreleased' | 'released' | 'withdrawn' => {
  if (value === 'unreleased' || value === 'released' || value === 'withdrawn')
    return value;
  throw invariant(
    'production_order_control_admission_state_invalid',
    `Unknown source admission state: ${value}.`,
  );
};

export const projectAdmissionOverride = (
  value: string | null,
): 'released' | null => {
  if (value === null || value === 'released') return value;
  throw invariant(
    'production_order_control_admission_override_invalid',
    `Unknown production admission override: ${value}.`,
  );
};

const orderStatus = (value: string): ProductionOrder['status'] => {
  switch (value) {
    case 'release_pending':
    case 'intake_pending':
    case 'eligible':
    case 'ineligible':
    case 'scheduled':
    case 'finished':
      return value;
    default:
      throw invariant(
        'production_order_status_invalid',
        `Unknown production order status: ${value}.`,
        { status: value },
      );
  }
};

const bagCountProvenance = (
  value: string | null,
): ProductionBagCountProvenance | null => {
  if (
    value === null ||
    value === 'external_source' ||
    value === 'operator_intake'
  )
    return value;
  throw invariant(
    'production_bag_count_provenance_invalid',
    `Unknown bag-count provenance: ${value}.`,
    { provenance: value },
  );
};

export const projectProductionOrder = (
  row: OrderControlPersistenceRow,
  asOf: Date,
  timezone: string,
): ProductionOrder => {
  const status = orderStatus(row.status);
  const provenance = bagCountProvenance(row.bagCountSource);
  if ((row.bagCount === null) !== (provenance === null))
    throw invariant(
      'production_bag_count_state_invalid',
      'Bag count and provenance disagree in persistence.',
      { bagCount: row.bagCount, bagCountProvenance: provenance },
    );
  if (row.bagCount === null && row.intakeVersion !== 0)
    throw invariant(
      'production_bag_intake_version_invalid',
      'Missing bag intake must have persistence version zero.',
      { bagCount: row.bagCount, intakeVersion: row.intakeVersion },
    );
  if (row.bagCount !== null && row.intakeVersion <= 0)
    throw invariant(
      'production_bag_intake_version_invalid',
      'Recorded bag intake requires a positive version.',
      { bagCount: row.bagCount, intakeVersion: row.intakeVersion },
    );
  if (status === 'intake_pending' && row.bagCount !== null)
    throw invariant(
      'production_bag_intake_state_invalid',
      'An intake-pending order already has bag intake.',
      { status, bagCount: row.bagCount },
    );
  if (
    status !== 'release_pending' &&
    status !== 'intake_pending' &&
    status !== 'ineligible' &&
    row.bagCount === null
  )
    throw invariant(
      'production_bag_intake_state_invalid',
      'A non-pending order is missing bag intake.',
      { status, bagCount: row.bagCount },
    );
  return {
    id: row.id,
    locationId: row.locationId,
    externalOrderId: row.externalOrderId,
    dueAt: row.dueAt,
    dueBucket: productionDueBucket(row.dueAt, asOf, timezone),
    priority: row.priority,
    status,
    derivedWeightLbs: row.derivedWeightLbs,
    bagCount: row.bagCount,
    bagCountProvenance: provenance,
    intakeVersion: row.bagCount === null ? null : row.intakeVersion,
    version: row.version,
  };
};

export const attentionFor = (
  order: ProductionOrder,
  pendingPlacement: unknown,
): ProductionOrderControlItem['attention'] => {
  if (order.status === 'intake_pending')
    return {
      reason: 'intake_required',
      message:
        'The source released this order to production, but physical bag intake has not been recorded.',
    };
  if (order.status !== 'eligible' || pendingPlacement === null) return null;
  const queueConflict =
    typeof pendingPlacement === 'object' &&
    !Array.isArray(pendingPlacement) &&
    Reflect.get(pendingPlacement, 'reason') === 'queue_conflict';
  return queueConflict
    ? {
        reason: 'placement_conflict',
        message: 'The production queue changed before placement completed.',
      }
    : {
        reason: 'placement_pending',
        message: 'This eligible order still needs a production position.',
      };
};

export const stageOrder = (
  stage: ProductionOrderRouteAttempt['stage'],
): number => {
  switch (stage) {
    case 'sorting':
      return 0;
    case 'washing':
      return 1;
    case 'drying':
      return 2;
    case 'folding_packaging':
      return 3;
  }
};

export const projectOrderControlResult = (
  result: ListOrderControlResult,
): ListProductionOrderControlResult => ({
  items: result.items.map((item) => ({
    order: { ...item.order, dueAt: item.order.dueAt.toISOString() },
    admission: {
      ...item.admission,
      allowedActions: [...item.admission.allowedActions],
    },
    attention: item.attention === null ? null : { ...item.attention },
    currentPlacement:
      item.currentPlacement === null
        ? null
        : {
            ...item.currentPlacement,
            pinnedAt: item.currentPlacement.pinnedAt?.toISOString() ?? null,
          },
    nextRequiredStage: item.nextRequiredStage,
    routeAttempts: item.routeAttempts.map((attempt) => ({
      ...attempt,
      assignedAt: attempt.assignedAt.toISOString(),
      completedAt: attempt.completedAt?.toISOString() ?? null,
      releasedAt: attempt.releasedAt?.toISOString() ?? null,
    })),
    commands: {
      queuedMove:
        item.commands.queuedMove.status === 'allowed'
          ? {
              ...item.commands.queuedMove,
              targets: item.commands.queuedMove.targets.map((target) => ({
                ...target,
                feasibility: { ...target.feasibility },
              })),
            }
          : {
              ...item.commands.queuedMove,
              targets: item.commands.queuedMove.targets.map((target) => ({
                ...target,
                feasibility: { ...target.feasibility },
              })),
            },
      routeException: { ...item.commands.routeException },
    },
    resolutionAction:
      item.resolutionAction.status === 'allowed'
        ? {
            ...item.resolutionAction,
            reviewReasons: [...item.resolutionAction.reviewReasons],
          }
        : {
            ...item.resolutionAction,
            reasons: [...item.resolutionAction.reasons],
          },
  })),
  counts: { ...result.counts },
  nextCursor: result.nextCursor,
  asOf: result.asOf.toISOString(),
});
