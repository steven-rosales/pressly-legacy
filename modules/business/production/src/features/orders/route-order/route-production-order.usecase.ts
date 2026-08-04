import {
  isProductionFeatureFailure,
  notFoundFailure,
  validationFailure,
} from '../../../foundations/language/failures/production-failure.factory.ts';
import {
  databaseError,
  invariantViolationError,
} from '@pressly/errors/factories';
import { sha256Text } from '@pressly/codec/node';
import { result } from '@pressly/kernel';
import { mapUnknownError } from '@pressly/errors/app-error';
import type { Result } from '@pressly/kernel';
import { conflictFailure } from '../../../foundations/language/failures/production-failure.factory.ts';
import { productionIdempotencyConflict } from '../../../foundations/language/commands/production-command.failure.ts';
import { withProductionDatabaseError } from '../../../foundations/adapters/postgres/commands/production-database-error.adapter.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../../../foundations/language/commands/production-idempotency.policy.ts';
import type { Clock } from '@pressly/time';
import type {
  OrderRoutingDecision,
  OrderRoutingStage,
} from '../../../foundations/language/order-routing/order-routing.policy.ts';
import type { ProductionRules } from '../../../foundations/language/rules/production-rules.factory.ts';
import type { ProductionOrderStageAttemptMutation } from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type { ProductionSignalsPort } from '../../../foundations/ports/signals/production-signals.port.ts';
import type {
  CommitProductionOrderRoute,
  PreviewProductionOrderRoute,
  ProductionOrderRoutingContext,
  RouteProductionOrderRepository,
} from './route-production-order.port.ts';
import type {
  CommitProductionOrderRouteCommand,
  CommitProductionOrderRouteResult,
  PreviewProductionOrderRouteCommand,
  ProductionOrderRouteProposal,
} from './route-production-order.model.ts';
import type { RouteProductionOrderFailure } from './route-production-order.failure.ts';

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
      throw invariantViolationError({
        code: 'production_batch_status_invalid',
        message: 'Stored production routing data is inconsistent.',
        safeMessage: 'Stored production routing data is inconsistent.',
      });
  }
};

const currentStageFor = (
  command: PreviewProductionOrderRouteCommand,
  context: ProductionOrderRoutingContext,
): OrderRoutingStage => {
  if (command.kind === 'queued_move') return 'sorting';
  const status = asBatchStatus(context.source.status);
  if (status === 'queued' || status === 'finished') return command.restartStage;
  return status;
};

const proposalHash = (
  proposal: Omit<ProductionOrderRouteProposal, 'proposalHash'>,
): string => sha256Text(JSON.stringify(proposal));

type ProposalEvaluation = Result<
  ProductionOrderRouteProposal,
  RouteProductionOrderFailure
>;

type RouteProductionOrderPolicy = Pick<
  ProductionRules,
  | 'evaluateProductionOrderOperationalAccess'
  | 'resolveProductionOrderExecutionState'
  | 'evaluateOrderRouting'
  | 'evaluateProductionOrderStageAttemptTransition'
  | 'initialProductionOrderStageAttemptState'
>;

const failedRouteStatus = (
  error: RouteProductionOrderFailure,
): 'rejected' | 'conflict' =>
  error.kind === 'conflict' ? 'conflict' : 'rejected';

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
  error: Readonly<{ code: string }>,
): void => {
  if (error.code === 'production_queue_version_conflict')
    signals?.queueConflict({ operation: `order_route_${operation}` });
};

const evaluateProposal = (input: {
  command: PreviewProductionOrderRouteCommand;
  context: ProductionOrderRoutingContext;
  policy: RouteProductionOrderPolicy;
}): ProposalEvaluation => {
  const { command, context } = input;
  if (context.run.status !== 'started')
    return result.err(
      conflictFailure({
        code: 'production_run_not_started',
        message: 'Orders can only move within a started production run.',
        safeMessage: 'Orders can only move within a started production run.',
      }),
    );
  const access = input.policy.evaluateProductionOrderOperationalAccess({
    resolutionState: context.order.resolutionState,
  });
  if (access.tag === 'err')
    return result.err(
      conflictFailure({
        code: access.error.code.toLowerCase(),
        message: access.error.message,
        safeMessage: access.error.message,
      }),
    );
  const execution = input.policy.resolveProductionOrderExecutionState({
    executionState: context.order.executionStatus,
    operationalStatus: context.order.operationalStatus,
  });
  if (execution.tag === 'err')
    return result.err(
      conflictFailure({
        code: execution.error.code.toLowerCase(),
        message: execution.error.message,
        safeMessage: execution.error.message,
      }),
    );
  if (execution.value !== 'scheduled')
    return result.err(
      conflictFailure({
        code: 'production_order_not_scheduled',
        message: 'Only a scheduled production order can move between batches.',
        safeMessage:
          'Only a scheduled production order can move between batches.',
      }),
    );
  if (context.run.queueVersion !== command.expectedQueueVersion)
    return result.err(
      conflictFailure({
        code: 'production_queue_version_conflict',
        message: 'The production queue changed before the order move.',
        safeMessage: 'The production queue changed before the order move.',
      }),
    );
  if (context.order.version !== command.expectedOrderVersion)
    return result.err(
      conflictFailure({
        code: 'production_order_version_conflict',
        message: 'The production order changed before the order move.',
        safeMessage: 'The production order changed before the order move.',
      }),
    );
  if (context.source.version !== command.expectedSourceBatchVersion)
    return result.err(
      conflictFailure({
        code: 'production_batch_version_conflict',
        message: 'The source batch changed before the order move.',
        safeMessage: 'The source batch changed before the order move.',
      }),
    );
  if (context.source.activeOrderCount <= 1)
    return result.err(
      conflictFailure({
        code: 'source_batch_would_be_empty',
        message:
          'This is the source batch only order. Empty-batch handling requires an explicit floor decision.',
        safeMessage:
          'This is the source batch only order. Empty-batch handling requires an explicit floor decision.',
      }),
    );

  const candidates =
    command.kind === 'queued_move'
      ? context.candidates.filter(
          (candidate) =>
            candidate.productionBatchId === command.targetProductionBatchId,
        )
      : context.candidates;
  const decision: OrderRoutingDecision = input.policy.evaluateOrderRouting({
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
      decision.reason.code === 'NO_LATER_TARGET'
        ? conflictFailure({
            code: decision.reason.code.toLowerCase(),
            message: decision.reason.message,
            safeMessage: decision.reason.message,
          })
        : validationFailure({
            code: decision.reason.code.toLowerCase(),
            message: decision.reason.message,
            safeMessage: decision.reason.message,
            classification: 'semantic',
          }),
    );

  const target = context.candidates.find(
    (candidate) =>
      candidate.productionBatchId === decision.route.targetProductionBatchId,
  );
  if (target === undefined)
    throw invariantViolationError({
      code: 'production_order_route_target_missing',
      message: 'Stored production routing data is inconsistent.',
      safeMessage: 'Stored production routing data is inconsistent.',
    });
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
  policy: RouteProductionOrderPolicy;
  clock: Clock;
  signals?: ProductionSignalsPort;
}): Readonly<{
  preview: PreviewProductionOrderRoute;
  commit: CommitProductionOrderRoute;
}> => ({
  preview: async (command) => {
    let context: ProductionOrderRoutingContext | null;
    try {
      context = await withProductionDatabaseError(
        'PRODUCTION_ORDER_ROUTE_PREVIEW_FAILED',
        'The production order route could not be previewed.',
        () =>
          deps.repo.transaction((repo) =>
            repo.loadContext(
              command.locationId,
              command.productionRunId,
              command.productionOrderId,
              false,
            ),
          ),
      );
    } catch (error) {
      reportRouteOutcome(deps.signals, command, 'preview', 'failed');
      throw error;
    }

    let outcome: ProposalEvaluation;
    try {
      outcome =
        context === null
          ? result.err(
              notFoundFailure({
                code: 'production_order_route_not_found',
                message:
                  'The production run, order, or current batch was not found.',
                safeMessage:
                  'The production run, order, or current batch was not found.',
              }),
            )
          : evaluateProposal({
              command,
              context,
              policy: deps.policy,
            });
    } catch (error) {
      const failure = mapUnknownError(error, (unknownCause) =>
        invariantViolationError({
          code: 'production_order_route_evaluation_failed',
          message: 'The production order route could not be evaluated safely.',
          safeMessage:
            'The production order route could not be evaluated safely.',
          cause: unknownCause,
        }),
      );
      reportRouteOutcome(deps.signals, command, 'preview', 'failed');
      throw failure;
    }

    reportRouteOutcome(
      deps.signals,
      command,
      'preview',
      outcome.tag === 'ok' ? 'proposed' : failedRouteStatus(outcome.error),
    );
    if (outcome.tag === 'err')
      reportQueueConflict(deps.signals, 'preview', outcome.error);
    return outcome;
  },

  commit: async (command) => {
    let outcome: Result<
      CommitProductionOrderRouteResult,
      RouteProductionOrderFailure
    >;
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
            notFoundFailure({
              code: 'production_order_route_not_found',
              message:
                'The production run, order, or current batch was not found.',
              safeMessage:
                'The production run, order, or current batch was not found.',
            }),
          );
        const evaluated = evaluateProposal({
          command: asPreviewCommand(command),
          context,
          policy: deps.policy,
        });
        if (evaluated.tag === 'err') return evaluated;
        if (evaluated.value.proposalHash !== command.proposalHash)
          return result.err(
            conflictFailure({
              code: 'production_order_route_proposal_stale',
              message: 'The proposed order route no longer matches production.',
              safeMessage:
                'The proposed order route no longer matches production.',
            }),
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
              conflictFailure({
                code: 'production_order_stage_attempt_not_assigned',
                message:
                  'The unfinished source route no longer matches production.',
                safeMessage:
                  'The unfinished source route no longer matches production.',
              }),
            );
          const attemptDecision =
            deps.policy.evaluateProductionOrderStageAttemptTransition({
              state: attempt.status,
              event: 'release_for_route',
            });
          if (attemptDecision.tag === 'err')
            return result.err(
              conflictFailure({
                code: attemptDecision.error.code.toLowerCase(),
                message: attemptDecision.error.message,
                safeMessage: attemptDecision.error.message,
              }),
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
      if (isProductionFeatureFailure(error)) {
        outcome = result.err(error);
      } else {
        const failure = mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'production_order_route_failed',
            message: 'The production order could not be moved safely.',
            safeMessage: 'The production order could not be moved safely.',
            status: 503,
            cause: unknownCause,
          }),
        );
        reportRouteOutcome(deps.signals, command, 'commit', 'failed');
        throw failure;
      }
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
