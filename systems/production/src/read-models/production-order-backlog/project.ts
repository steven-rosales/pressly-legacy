import { canonicalSha256 } from '@pressly/codec/node';
import type {
  ClassifiedProductionOrderBacklogOrder,
  ClassifiedProductionOrderBacklogSnapshot,
  ProductionOrderBacklogClassificationReason,
  ProductionOrderBacklogItem,
  ProductionOrderBacklogPolicy,
  ProductionOrderBacklogScope,
  ProductionOrderBacklogSnapshot,
  ProductionOrderBacklogSnapshotOrder,
} from './model.ts';

const itemFor = (
  order: ProductionOrderBacklogSnapshotOrder,
  category: ProductionOrderBacklogItem['category'],
  reasons: readonly ProductionOrderBacklogClassificationReason[],
): ProductionOrderBacklogItem => ({
  orderId: order.orderId,
  displayReference: order.displayReference,
  dueAt: order.dueAt.toISOString(),
  category,
  reasons: [...reasons],
  expectedVersion: order.productionVersion,
  expectedResolutionState: order.resolutionState,
});

const classifyOrder = (
  policy: ProductionOrderBacklogPolicy,
  order: ProductionOrderBacklogSnapshotOrder,
): ClassifiedProductionOrderBacklogOrder => {
  if (order.resolutionState === 'resolved_without_production')
    return {
      snapshot: order,
      item: itemFor(order, 'already_historical', [
        'resolved_without_production',
      ]),
      lifecycle: null,
    };

  const execution = policy.resolveProductionOrderExecutionState({
    executionState: order.executionStatus,
    operationalStatus: order.operationalStatus,
  });
  if (execution.tag === 'err')
    return {
      snapshot: order,
      item: itemFor(order, 'kept_for_safety', ['execution_state_invalid']),
      lifecycle: null,
    };
  if (execution.value === 'finished')
    return {
      snapshot: order,
      item: itemFor(order, 'already_historical', ['execution_finished']),
      lifecycle: null,
    };

  const lifecycle = policy.evaluateProductionOrderResolutionTransition({
    state: order.resolutionState,
    event: 'resolve_without_production',
  });
  if (lifecycle.tag === 'err')
    return {
      snapshot: order,
      item: itemFor(order, 'kept_for_safety', [
        'resolution_transition_invalid',
      ]),
      lifecycle: null,
    };

  const guard = policy.evaluateProductionOrderResolutionGuard({
    executionState: execution.value,
    hasShiftSelection: order.hasShiftSelection,
    hasBatchMembership: order.hasBatchMembership,
    hasStageAttempt: order.hasStageAttempt,
    hasRoute: order.hasRoute,
    hasIntake: order.hasIntake,
    hasManualAdmission: order.hasManualAdmission,
    isPriority: order.isPriority,
    hasPendingPlacement: order.hasPendingPlacement,
  });
  if (guard.status === 'blocked')
    return {
      snapshot: order,
      item: itemFor(order, 'kept_for_safety', guard.blockReasons),
      lifecycle: null,
    };
  if (guard.requiresExplicitReview)
    return {
      snapshot: order,
      item: itemFor(order, 'review_individually', guard.reviewReasons),
      lifecycle: null,
    };

  return {
    snapshot: order,
    item: itemFor(order, 'ready_to_archive', ['no_operator_owned_facts']),
    lifecycle: lifecycle.value,
  };
};

export const classifyProductionOrderBacklogSnapshot = (
  policy: ProductionOrderBacklogPolicy,
  snapshot: ProductionOrderBacklogSnapshot,
): ClassifiedProductionOrderBacklogSnapshot => ({
  orders: snapshot.orders.map((order) => classifyOrder(policy, order)),
  hasMore: snapshot.hasMore,
});

const previewHashPayload = (
  input: ProductionOrderBacklogScope,
  classified: ClassifiedProductionOrderBacklogSnapshot,
) => ({
  version: 2,
  locationId: input.locationId,
  filter: input.filter,
  cutoff: input.cutoff,
  reason: input.reason,
  maxOrders: input.maxOrders,
  cursor: input.cursor,
  hasMore: classified.hasMore,
  candidates: [...classified.orders]
    .sort((left, right) =>
      left.snapshot.orderId.localeCompare(right.snapshot.orderId),
    )
    .map(({ snapshot, item }) => ({
      orderId: snapshot.orderId,
      orderVersion: snapshot.productionVersion,
      resolutionState: snapshot.resolutionState,
      executionStatus: snapshot.executionStatus,
      operationalStatus: snapshot.operationalStatus,
      dueAt: snapshot.dueAt.toISOString(),
      guardFacts: {
        hasIntake: snapshot.hasIntake,
        hasManualAdmission: snapshot.hasManualAdmission,
        isPriority: snapshot.isPriority,
        hasPendingPlacement: snapshot.hasPendingPlacement,
        hasShiftSelection: snapshot.hasShiftSelection,
        hasBatchMembership: snapshot.hasBatchMembership,
        hasStageAttempt: snapshot.hasStageAttempt,
        hasRoute: snapshot.hasRoute,
      },
      classification: item.category,
      reasons: [...item.reasons].sort(),
    })),
});

export const hashProductionOrderBacklogPreview = (
  input: ProductionOrderBacklogScope,
  classified: ClassifiedProductionOrderBacklogSnapshot,
): string => canonicalSha256(previewHashPayload(input, classified));
