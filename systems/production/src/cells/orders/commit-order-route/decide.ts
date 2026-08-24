import { evaluateOrderRouteProposal } from '../../../model/order-route-proposal/evaluate.ts';
import type { OrderRouteProposalCommand } from '../../../model/order-route-proposal/model.ts';
import type {
  CommitOrderRouteCommand,
  CommitOrderRouteDecision,
  CommitOrderRoutePolicy,
} from './types.ts';

const proposalCommand = (
  command: CommitOrderRouteCommand,
): OrderRouteProposalCommand => {
  const identity = {
    locationId: command.locationId,
    productionRunId: command.productionRunId,
    productionOrderId: command.productionOrderId,
    actorId: command.actorId,
    authorizedAction: command.authorizedAction,
    expectedQueueVersion: command.expectedQueueVersion,
    expectedOrderVersion: command.expectedOrderVersion,
    expectedSourceBatchVersion: command.expectedSourceBatchVersion,
  } as const;

  return command.kind === 'queued_move'
    ? {
        ...identity,
        kind: 'queued_move',
        reason: 'manual_rebatch',
        targetProductionBatchId: command.targetProductionBatchId,
        restartStage: 'sorting',
      }
    : {
        ...identity,
        kind: 'exception',
        reason: command.reason,
        restartStage: command.restartStage,
        ...(command.note === undefined ? {} : { note: command.note }),
      };
};

const conflict = (code: string, message: string) => ({
  kind: 'reject' as const,
  failure: {
    kind: 'conflict' as const,
    code,
    message,
    safeMessage: message,
  },
});

export const decideCommitOrderRoute = (input: {
  command: CommitOrderRouteCommand;
  context: Parameters<typeof evaluateOrderRouteProposal>[0]['context'];
  policy: CommitOrderRoutePolicy;
}): CommitOrderRouteDecision => {
  const evaluated = evaluateOrderRouteProposal({
    command: proposalCommand(input.command),
    context: input.context,
    policy: input.policy,
    consistency: 'locked',
  });
  if (evaluated.kind === 'reject') return evaluated;

  if (evaluated.proposal.proposalHash !== input.command.proposalHash)
    return conflict(
      'production_order_route_proposal_stale',
      'The proposed order route no longer matches production.',
    );

  const attemptLifecycles = [];
  for (const stage of evaluated.proposal.releasedStages) {
    const attempt = input.context.attempts.find(
      (candidate) =>
        candidate.productionBatchId ===
          input.context.source.productionBatchId &&
        candidate.stage === stage &&
        candidate.status === 'assigned',
    );
    if (attempt === undefined)
      return conflict(
        'production_order_stage_attempt_not_assigned',
        'The unfinished source route no longer matches production.',
      );

    const transition =
      input.policy.evaluateProductionOrderStageAttemptTransition({
        state: attempt.status,
        event: 'release_for_route',
      });
    if (transition.tag === 'err')
      return conflict(
        transition.error.code.toLowerCase(),
        transition.error.message,
      );

    attemptLifecycles.push({
      attemptId: attempt.id,
      stageRunId: attempt.stageRunId,
      lifecycle: transition.value,
    });
  }

  return {
    kind: 'commit',
    plan: {
      proposal: evaluated.proposal,
      attemptLifecycles,
      initialAttemptState: input.policy.initialProductionOrderStageAttemptState,
    },
  };
};
