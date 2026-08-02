import type {
  ProductionLiveAutomaticPlacement,
  ProductionLiveExactBatchTarget,
  ProductionLiveRunChanges,
  ProductionPendingOrder,
} from '@pressly/contracts';
import { invariantViolationError } from '@pressly/errors';
import type {
  OnlinePlacementProposal,
  ProductionLiveRunPlacementOrder,
  ProductionOrderPlacementContext,
} from '../scheduling/online-placement.port.ts';
import type { ProductionSchedulerPort } from '../scheduling/production-scheduler.port.ts';
import { productionPlacementFailureReason } from '../scheduling/production-placement.policy.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const placementTarget = (
  proposal: OnlinePlacementProposal,
): ProductionLiveAutomaticPlacement['target'] =>
  proposal.target.type === 'existing_batch'
    ? {
        kind: 'existing_batch',
        productionBatchId: proposal.target.batchId,
        sequence: proposal.target.sequence,
      }
    : {
        kind: 'new_batch',
        sequence: proposal.target.insertAtSequence,
      };

const pendingProposalMatches = (
  order: ProductionPendingOrder,
  proposal: OnlinePlacementProposal,
  mode: 'automatic' | 'manager_exact',
  targetBatchId: string | null,
): boolean => {
  const pending = order.placement;
  if (
    pending.status !== 'confirmation_required' ||
    pending.mode !== mode ||
    pending.queueVersion !== proposal.expectedQueueVersion ||
    pending.proposalHash !== proposal.placementPlanHash
  )
    return false;
  if (mode === 'automatic') return true;
  return (
    pending.target.kind === 'existing_batch' &&
    pending.target.productionBatchId === targetBatchId
  );
};

const placementCapacity = (
  context: ProductionOrderPlacementContext,
  proposal: OnlinePlacementProposal,
) => {
  const proposedTarget = proposal.target;
  const currentTargetBatch =
    proposedTarget.type === 'existing_batch'
      ? context.input.batches.find(
          (batch) => batch.id === proposedTarget.batchId,
        )
      : undefined;
  const projected =
    proposedTarget.type === 'existing_batch'
      ? proposal.affectedBatches.find(
          (batch) => batch.sourceBatchId === proposedTarget.batchId,
        )
      : proposal.affectedBatches.find(
          (batch) =>
            batch.sourceBatchId === null &&
            batch.sequence === proposedTarget.insertAtSequence,
        );
  if (projected === undefined)
    throw productionInvariantViolation(
      'production_live_changes_target_projection_missing',
      'The placement proposal is missing its target batch.',
    );

  return {
    beforeLbs: currentTargetBatch?.derivedWeightLbs ?? 0,
    afterLbs: projected.derivedWeightLbs,
    limitLbs: context.input.run.pulseCapacityLbs,
  };
};

const commonProjection = (
  context: ProductionOrderPlacementContext,
  proposal: OnlinePlacementProposal,
) => ({
  proposalHash: proposal.placementPlanHash,
  expectedQueueVersion: proposal.expectedQueueVersion,
  expectedOrderVersion: context.orderVersion,
  capacity: placementCapacity(context, proposal),
  projectedCompletionAt: proposal.projectedCompletionAt,
  overtime: {
    required: proposal.overtime.required,
    minutes: proposal.overtime.overrunMinutes,
    shiftEndsAt: proposal.overtime.shiftEndsAt,
  },
});

const automaticPlacement = (
  order: ProductionPendingOrder,
  context: ProductionOrderPlacementContext,
  proposal: OnlinePlacementProposal,
): ProductionLiveAutomaticPlacement => {
  const target = placementTarget(proposal);
  const targetBatchId =
    target.kind === 'existing_batch' ? target.productionBatchId : null;
  const expectedBatchVersion =
    targetBatchId === null ? null : context.batchVersions[targetBatchId];
  if (expectedBatchVersion === undefined)
    throw productionInvariantViolation(
      'production_live_changes_target_version_missing',
      'The recommended target has no batch version.',
    );

  return {
    mode: 'automatic',
    target,
    expectedBatchVersion,
    allowedActions: [
      pendingProposalMatches(order, proposal, 'automatic', targetBatchId)
        ? 'confirm_overtime'
        : 'place_automatically',
    ],
    ...commonProjection(context, proposal),
  };
};

const exactPlacement = (
  order: ProductionPendingOrder,
  context: ProductionOrderPlacementContext,
  proposal: OnlinePlacementProposal,
): ProductionLiveExactBatchTarget => {
  if (proposal.target.type !== 'existing_batch')
    throw productionInvariantViolation(
      'production_live_changes_exact_target_invalid',
      'Manager-exact placement must target an existing batch.',
    );
  const expectedBatchVersion = context.batchVersions[proposal.target.batchId];
  if (expectedBatchVersion === undefined)
    throw productionInvariantViolation(
      'production_live_changes_exact_target_version_missing',
      'The exact placement target has no batch version.',
    );

  return {
    mode: 'manager_exact',
    target: {
      kind: 'existing_batch',
      productionBatchId: proposal.target.batchId,
      sequence: proposal.target.sequence,
    },
    expectedBatchVersion,
    allowedActions: [
      pendingProposalMatches(
        order,
        proposal,
        'manager_exact',
        proposal.target.batchId,
      )
        ? 'confirm_overtime'
        : 'place_exactly',
    ],
    ...commonProjection(context, proposal),
  };
};

const comparePlacementOrders = (
  left: ProductionLiveRunPlacementOrder,
  right: ProductionLiveRunPlacementOrder,
): number =>
  Number(right.order.priority) - Number(left.order.priority) ||
  Date.parse(left.order.dueAt) - Date.parse(right.order.dueAt) ||
  left.order.id.localeCompare(right.order.id);

export const projectLiveRunChanges = (input: {
  runId: string;
  queueVersion: number;
  pulseCapacityLbs: number;
  orders: readonly ProductionLiveRunPlacementOrder[];
  scheduler: Pick<ProductionSchedulerPort, 'proposeOnlinePlacement'>;
}): ProductionLiveRunChanges => ({
  productionRunId: input.runId,
  queueVersion: input.queueVersion,
  pulseCapacityLbs: input.pulseCapacityLbs,
  orders: [...input.orders]
    .sort(comparePlacementOrders)
    .map(({ order, context }) => {
      if (
        context.runStatus !== 'started' ||
        context.orderStatus !== 'eligible' ||
        context.orderAlreadyAssigned
      )
        return {
          ...order,
          recommendedPlacement: {
            status: 'unavailable' as const,
            reason:
              context.runStatus !== 'started'
                ? context.runStatus === 'completed'
                  ? ('run_completed' as const)
                  : ('run_not_started' as const)
                : context.orderAlreadyAssigned
                  ? ('order_already_scheduled' as const)
                  : ('order_not_eligible' as const),
            message:
              context.runStatus !== 'started'
                ? 'The production run is not available for live placement.'
                : context.orderAlreadyAssigned
                  ? 'The order is already assigned to production.'
                  : 'The order is not currently eligible for placement.',
          },
          exactBatchTargets: [],
        };

      const recommended = input.scheduler.proposeOnlinePlacement(context.input);
      const exactBatchTargets = context.input.batches
        .flatMap((batch) => {
          const proposal = input.scheduler.proposeOnlinePlacement({
            ...context.input,
            mode: { type: 'manager_exact', targetBatchId: batch.id },
          });
          return proposal.kind === 'proposed'
            ? [exactPlacement(order, context, proposal)]
            : [];
        })
        .sort(
          (left, right) =>
            left.target.sequence - right.target.sequence ||
            left.target.productionBatchId.localeCompare(
              right.target.productionBatchId,
            ),
        );

      return {
        ...order,
        recommendedPlacement:
          recommended.kind === 'proposed'
            ? {
                status: 'available' as const,
                placement: automaticPlacement(order, context, recommended),
              }
            : {
                status: 'unavailable' as const,
                reason: productionPlacementFailureReason(
                  recommended.reason.code,
                ),
                message: recommended.reason.message,
              },
        exactBatchTargets,
      };
    }),
});
