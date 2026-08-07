import { canonicalSha256 } from '@pressly/codec/node';
import {
  assessProductionOrderResolution,
  type ProductionOrderResolutionPolicy,
} from '../resolution/production-order-resolution.policy.ts';
import type {
  ClassifiedProductionOrderBacklogOrder,
  ClassifiedProductionOrderBacklogSnapshot,
  ProductionOrderBacklogClassificationReason,
  ProductionOrderBacklogPreviewItem,
  ProductionOrderBacklogScope,
  ProductionOrderBacklogSnapshot,
  ProductionOrderBacklogSnapshotOrder,
} from './production-order-backlog.model.ts';

const previewItem = (
  order: ProductionOrderBacklogSnapshotOrder,
  category: ProductionOrderBacklogPreviewItem['category'],
  reasons: readonly ProductionOrderBacklogClassificationReason[],
): ProductionOrderBacklogPreviewItem => ({
  orderId: order.orderId,
  displayReference: order.displayReference,
  dueAt: order.dueAt.toISOString(),
  category,
  reasons: [...reasons],
  expectedVersion: order.productionVersion,
  expectedResolutionState: order.resolutionState,
});

const classifyOrder = (
  policy: ProductionOrderResolutionPolicy,
  order: ProductionOrderBacklogSnapshotOrder,
): ClassifiedProductionOrderBacklogOrder => {
  const assessment = assessProductionOrderResolution(policy, {
    resolutionState: order.resolutionState,
    executionStatus: order.executionStatus,
    operationalStatus: order.operationalStatus,
    expectedVersion: order.productionVersion,
    hasShiftSelection: order.hasShiftSelection,
    hasBatchMembership: order.hasBatchMembership,
    hasStageAttempt: order.hasStageAttempt,
    hasRoute: order.hasRoute,
    hasIntake: order.hasIntake,
    hasManualAdmission: order.hasManualAdmission,
    isPriority: order.isPriority,
    hasPendingPlacement: order.hasPendingPlacement,
  });

  if (assessment.status === 'already_historical')
    return {
      snapshot: order,
      item: previewItem(order, 'already_historical', [assessment.reason]),
      lifecycle: null,
    };
  if (assessment.status === 'blocked')
    return {
      snapshot: order,
      item: previewItem(order, 'kept_for_safety', assessment.reasons),
      lifecycle: null,
    };
  if (assessment.requiresExplicitReview)
    return {
      snapshot: order,
      item: previewItem(order, 'review_individually', assessment.reviewReasons),
      lifecycle: null,
    };

  return {
    snapshot: order,
    item: previewItem(order, 'ready_to_archive', ['no_operator_owned_facts']),
    lifecycle: assessment.lifecycle,
  };
};

export const classifyProductionOrderBacklogSnapshot = (
  policy: ProductionOrderResolutionPolicy,
  snapshot: ProductionOrderBacklogSnapshot,
): ClassifiedProductionOrderBacklogSnapshot => ({
  orders: snapshot.orders.map((order) => classifyOrder(policy, order)),
  hasMore: snapshot.hasMore,
});

const snapshotHashPayload = (
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
): string => canonicalSha256(snapshotHashPayload(input, classified));
