import { createHash } from 'node:crypto';
import type {
  CommitProductionOrderRouteResult,
  PreviewProductionOrderRouteRequest,
  ProductionOrderRouteProposal,
} from '@pressly/contracts';
import { result, type Result } from '@pressly/kernel';
import type { AppError } from '@pressly/errors';
import {
  productionError,
  productionIdempotencyConflict,
} from '../failure-mapping/production.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../command-execution/production-idempotency.policy.ts';
import type { ClockPort } from '../command-execution/production-command.port.ts';
import type {
  OrderRoutingPolicyDecision,
  OrderRoutingStage,
} from '../production-policy/order-routing-policy.port.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';
import type { ProductionOrderStageAttemptMutation } from '../production-lifecycle/production-lifecycle.port.ts';
import type { ProductionSignalsPort } from '../production-signals/production-signals.port.ts';
import type {
  CommitProductionOrderRoute,
  CommitProductionOrderRouteCommand,
  PreviewProductionOrderRoute,
  PreviewProductionOrderRouteCommand,
  ProductionOrderRoutingContext,
  RouteProductionOrderRepository,
} from './route-production-order.port.ts';

const asBatchStatus = (
  value: string,
): ProductionOrderRoutingContext['candidates'][number]['status'] &
  (
    | 'queued'
    | 'sorting'
    | 'washing'
    | 'drying'
    | 'folding_packaging'
    | 'finished'
  ) => {
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

const currentStageFor = (
  command: PreviewProductionOrderRouteRequest,
  context: ProductionOrderRoutingContext,
): OrderRoutingStage => {
  if (command.kind === 'queued_move') return 'sorting';
  const status = asBatchStatus(context.source.status);
  if (status === 'queued' || status === 'finished') return command.restartStage;
  return status;
};

const proposalHash = (
  proposal: Omit<ProductionOrderRouteProposal, 'proposalHash'>,
): string =>
  createHash('sha256').update(JSON.stringify(proposal), 'utf8').digest('hex');

type ProposalEvaluation = Result<ProductionOrderRouteProposal, AppError>;

const failedRouteStatus = (
  error: AppError,
): 'rejected' | 'conflict' | 'failed' => {
  if (error.code === 'production_order_route_failed') return 'failed';
  return error.status === 409 ? 'conflict' : 'rejected';
};

const reportRouteOutcome = (
  signals: ProductionSignalsPort | undefined,
  command: Pick<PreviewProductionOrderRouteCommand, 'kind' | 'reason'>,
  operation: 'preview' | 'commit',
  status:
    | 'proposed'
    | 'committed'
    | 'replayed'
    | 'rejected'
    | 'conflict'
    | 'failed',
): void => {
  signals?.orderRouteOutcome({
    operation,
    status,
    kind: command.kind,
    reason: command.reason,
  });
};

const reportQueueConflict = (
  signals: ProductionSignalsPort | undefined,
  operation: 'preview' | 'commit',
  error: AppError,
): void => {
  if (error.code === 'production_queue_version_conflict')
    signals?.queueConflict({ operation: `order_route_${operation}` });
};

const evaluateProposal = (input: {
  command: PreviewProductionOrderRouteCommand;
  context: ProductionOrderRoutingContext;
  policy: ProductionPolicyPort;
}): ProposalEvaluation => {
  const { command, context } = input;
  if (context.run.status !== 'started')
    return result.err(
      productionError(
        'PRODUCTION_RUN_NOT_STARTED',
        'Orders can only move within a started production run.',
      ),
    );
  const access = input.policy.evaluateProductionOrderOperationalAccess({
    resolutionState: context.order.resolutionState,
  });
  if (access.tag === 'err')
    return result.err(
      productionError(access.error.code, access.error.message, 409),
    );
  const execution = input.policy.resolveProductionOrderExecutionState({
    executionState: context.order.executionStatus,
    operationalStatus: context.order.operationalStatus,
  });
  if (execution.tag === 'err')
    return result.err(
      productionError(execution.error.code, execution.error.message, 409),
    );
  if (execution.value !== 'scheduled')
    return result.err(
      productionError(
        'PRODUCTION_ORDER_NOT_SCHEDULED',
        'Only a scheduled production order can move between batches.',
      ),
    );
  if (context.run.queueVersion !== command.expectedQueueVersion)
    return result.err(
      productionError(
        'PRODUCTION_QUEUE_VERSION_CONFLICT',
        'The production queue changed before the order move.',
      ),
    );
  if (context.order.version !== command.expectedOrderVersion)
    return result.err(
      productionError(
        'PRODUCTION_ORDER_VERSION_CONFLICT',
        'The production order changed before the order move.',
      ),
    );
  if (context.source.version !== command.expectedSourceBatchVersion)
    return result.err(
      productionError(
        'PRODUCTION_BATCH_VERSION_CONFLICT',
        'The source batch changed before the order move.',
      ),
    );
  if (context.source.activeOrderCount <= 1)
    return result.err(
      productionError(
        'SOURCE_BATCH_WOULD_BE_EMPTY',
        'This is the source batch only order. Empty-batch handling requires an explicit floor decision.',
      ),
    );

  const candidates =
    command.kind === 'queued_move'
      ? context.candidates.filter(
          (candidate) =>
            candidate.productionBatchId === command.targetProductionBatchId,
        )
      : context.candidates;
  const decision: OrderRoutingPolicyDecision =
    input.policy.evaluateOrderRouting({
      command:
        command.kind === 'queued_move' ? 'queued_rebatch' : 'defer_or_rework',
      order: {
        productionOrderId: context.order.id,
        weightLbs: context.order.weightLbs,
      },
      source: {
        productionBatchId: context.source.productionBatchId,
        sequence: context.source.sequence,
        status: asBatchStatus(context.source.status),
        membershipFrozen: context.source.membershipFrozen,
      },
      currentStage: currentStageFor(command, context),
      restartStage: command.restartStage,
      targetCandidates: candidates.map((candidate) => ({
        productionBatchId: candidate.productionBatchId,
        sequence: candidate.sequence,
        status: asBatchStatus(candidate.status),
        membershipFrozen: candidate.membershipFrozen,
        stages: candidate.stages,
      })),
    });
  if (decision.decision === 'rejected')
    return result.err(
      productionError(
        decision.reason.code,
        decision.reason.message,
        decision.reason.code === 'NO_LATER_TARGET' ? 409 : 422,
      ),
    );

  const target = context.candidates.find(
    (candidate) =>
      candidate.productionBatchId === decision.route.targetProductionBatchId,
  );
  if (target === undefined)
    throw new Error('Accepted order route target is missing from context.');
  const targetWeights = decision.route.targetAssignments.map(
    (assignment) => assignment.assignedWeightAfterLbs,
  );
  const targetCapacities = decision.route.targetAssignments.map(
    (assignment) => assignment.capacityLbs,
  );
  const unsigned: Omit<ProductionOrderRouteProposal, 'proposalHash'> = {
    kind: command.kind,
    productionRunId: context.run.id,
    productionOrderId: context.order.id,
    sourceProductionBatchId: context.source.productionBatchId,
    sourceBatchSequence: context.source.sequence,
    targetProductionBatchId: target.productionBatchId,
    targetBatchSequence: target.sequence,
    restartStage: command.restartStage,
    releasedStages: [...decision.route.releasedUnfinishedStages],
    assignedStages: decision.route.targetAssignments.map(
      (assignment) => assignment.stage,
    ),
    orderWeightLbs: context.order.weightLbs,
    targetWeightLbs: Math.max(...targetWeights),
    targetCapacityLbs: Math.min(...targetCapacities),
    expectedQueueVersion: context.run.queueVersion,
    expectedOrderVersion: context.order.version,
    expectedSourceBatchVersion: context.source.version,
    expectedTargetBatchVersion: target.version,
  };
  return result.ok({ ...unsigned, proposalHash: proposalHash(unsigned) });
};

const asPreviewCommand = (
  command: CommitProductionOrderRouteCommand,
): PreviewProductionOrderRouteCommand => {
  const common = {
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
        ...common,
        kind: 'queued_move',
        reason: 'manual_rebatch',
        restartStage: 'sorting',
        targetProductionBatchId: command.targetProductionBatchId,
      }
    : {
        ...common,
        kind: 'exception',
        reason: command.reason,
        restartStage: command.restartStage,
        ...(command.note === undefined ? {} : { note: command.note }),
      };
};

export const makeRouteProductionOrder = (deps: {
  repo: RouteProductionOrderRepository;
  policy: ProductionPolicyPort;
  clock: ClockPort;
  signals?: ProductionSignalsPort;
}): Readonly<{
  preview: PreviewProductionOrderRoute;
  commit: CommitProductionOrderRoute;
}> => ({
  preview: async (command) => {
    try {
      const context = await deps.repo.transaction((repo) =>
        repo.loadContext(
          command.locationId,
          command.productionRunId,
          command.productionOrderId,
          false,
        ),
      );
      const outcome =
        context === null
          ? result.err(
              productionError(
                'PRODUCTION_ORDER_ROUTE_NOT_FOUND',
                'The production run, order, or current batch was not found.',
                404,
              ),
            )
          : evaluateProposal({ command, context, policy: deps.policy });
      reportRouteOutcome(
        deps.signals,
        command,
        'preview',
        outcome.tag === 'ok' ? 'proposed' : failedRouteStatus(outcome.error),
      );
      if (outcome.tag === 'err')
        reportQueueConflict(deps.signals, 'preview', outcome.error);
      return outcome;
    } catch (error) {
      reportRouteOutcome(deps.signals, command, 'preview', 'failed');
      throw error;
    }
  },

  commit: async (command) => {
    let outcome: Result<CommitProductionOrderRouteResult, AppError>;
    try {
      outcome = await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation:
            command.kind === 'queued_move'
              ? 'production_order_rebatched'
              : 'production_order_route_exception_recorded',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'production_order',
          entityId: command.productionOrderId,
          expectedVersion: command.expectedOrderVersion,
          payload: {
            kind: command.kind,
            authorizedAction: command.authorizedAction,
            reason: command.reason,
            restartStage: command.restartStage,
            expectedQueueVersion: command.expectedQueueVersion,
            expectedSourceBatchVersion: command.expectedSourceBatchVersion,
            proposalHash: command.proposalHash,
            ...(command.kind === 'queued_move'
              ? {
                  targetProductionBatchId: command.targetProductionBatchId,
                }
              : {}),
          },
        });
        const replay = resolveWorkEventReplay<CommitProductionOrderRouteResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        const context = await repo.loadContext(
          command.locationId,
          command.productionRunId,
          command.productionOrderId,
          true,
        );
        if (context === null)
          return result.err(
            productionError(
              'PRODUCTION_ORDER_ROUTE_NOT_FOUND',
              'The production run, order, or current batch was not found.',
              404,
            ),
          );
        const evaluated = evaluateProposal({
          command: asPreviewCommand(command),
          context,
          policy: deps.policy,
        });
        if (evaluated.tag === 'err') return evaluated;
        if (evaluated.value.proposalHash !== command.proposalHash)
          return result.err(
            productionError(
              'PRODUCTION_ORDER_ROUTE_PROPOSAL_STALE',
              'The proposed order route no longer matches production.',
              409,
            ),
          );

        const attemptLifecycles: ProductionOrderStageAttemptMutation[] = [];
        for (const stage of evaluated.value.releasedStages) {
          const attempt = context.attempts.find(
            (candidate) =>
              candidate.productionBatchId ===
                context.source.productionBatchId &&
              candidate.stage === stage &&
              candidate.status === 'assigned',
          );
          if (attempt === undefined)
            return result.err(
              productionError(
                'PRODUCTION_ORDER_STAGE_ATTEMPT_NOT_ASSIGNED',
                'The unfinished source route no longer matches production.',
                409,
              ),
            );
          const attemptDecision =
            deps.policy.evaluateProductionOrderStageAttemptTransition({
              state: attempt.status,
              event: 'release_for_route',
            });
          if (attemptDecision.tag === 'err')
            return result.err(
              productionError(
                attemptDecision.error.code,
                attemptDecision.error.message,
                409,
              ),
            );
          attemptLifecycles.push({
            attemptId: attempt.id,
            stageRunId: attempt.stageRunId,
            lifecycle: attemptDecision.value,
          });
        }

        return result.ok(
          await repo.commit({
            locationId: command.locationId,
            actorId: command.actorId,
            reason: command.reason,
            ...(command.kind === 'exception' && command.note !== undefined
              ? { note: command.note }
              : {}),
            idempotencyKey: command.idempotencyKey,
            idempotency,
            context,
            proposal: evaluated.value,
            orderExecutionState: 'scheduled',
            attemptLifecycles,
            initialAttemptState:
              deps.policy.initialProductionOrderStageAttemptState,
            now: deps.clock.now(),
          }),
        );
      });
    } catch (error) {
      outcome = result.err(
        productionError(
          'PRODUCTION_ORDER_ROUTE_FAILED',
          'The production order could not be moved safely.',
          409,
          error,
        ),
      );
    }

    reportRouteOutcome(
      deps.signals,
      command,
      'commit',
      outcome.tag === 'ok'
        ? outcome.value.replayed
          ? 'replayed'
          : 'committed'
        : failedRouteStatus(outcome.error),
    );
    if (outcome.tag === 'err')
      reportQueueConflict(deps.signals, 'commit', outcome.error);
    return outcome;
  },
});

export type RouteProductionOrder = ReturnType<typeof makeRouteProductionOrder>;

export type {
  CommitProductionOrderRoute,
  PreviewProductionOrderRoute,
} from './route-production-order.port.ts';
