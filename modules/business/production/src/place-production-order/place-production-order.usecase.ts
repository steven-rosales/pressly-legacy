import type {
  AutomaticProductionOrderPlacementResult,
  ConfirmProductionOrderOvertimeResult,
  ExactProductionOrderPlacementResult,
  ProductionPendingPlacement,
  ProductionOrderPlacementResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import {
  productionError,
  productionIdempotencyConflict,
} from '../failure-mapping/production.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../command-execution/production-idempotency.policy.ts';
import type { ClockPort } from '../command-execution/production-command.port.ts';
import type { OnlinePlacementProposal } from '../scheduling/online-placement.port.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';
import type { ProductionSchedulerPort } from '../scheduling/production-scheduler.port.ts';
import { productionPlacementFailureReason } from '../scheduling/production-placement.policy.ts';
import type {
  ConfirmProductionOrderOvertime,
  PlaceProductionOrderAutomatically,
  PlaceProductionOrderExactly,
  PlaceProductionOrderOperations,
  PlaceProductionOrderRepository,
  PlacementActor,
  StoredOvertimeProposal,
} from './place-production-order.port.ts';
export type {
  ConfirmProductionOrderOvertime,
  PlaceProductionOrderAutomatically,
  PlaceProductionOrderExactly,
} from './place-production-order.port.ts';

type PlacementMode =
  | Readonly<{ type: 'automatic' }>
  | Readonly<{ type: 'manager_exact'; targetBatchId: string }>;

type PlacementCommand = Readonly<{
  locationId: string;
  productionRunId: string;
  productionOrderId: string;
  expectedQueueVersion: number;
  idempotencyKey: string;
  expectedBatchVersion?: number;
}> &
  PlacementActor;

type AutomaticPlacementAttemptCommand = Readonly<{
  locationId: string;
  productionOrderId: string;
  idempotencyKey: string;
}> &
  PlacementActor;

type PendingRunResolution = Extract<
  ProductionPendingPlacement,
  { status: 'awaiting_run' | 'ambiguous_run' }
>;

const notPlaced = (input: {
  command: PlacementCommand;
  mode: PlacementMode;
  queueVersion: number;
  code: string;
  message: string;
}): ProductionOrderPlacementResult => ({
  status: 'not_placed',
  mode: input.mode.type,
  productionRunId: input.command.productionRunId,
  productionOrderId: input.command.productionOrderId,
  reason: productionPlacementFailureReason(input.code),
  message: input.message,
  queueVersion: input.queueVersion,
  replayed: false,
});

const confirmationRequired = (input: {
  command: PlacementCommand;
  mode: PlacementMode;
  proposal: OnlinePlacementProposal;
}): ProductionOrderPlacementResult => ({
  status: 'confirmation_required',
  mode: input.mode.type,
  productionRunId: input.command.productionRunId,
  productionOrderId: input.command.productionOrderId,
  target:
    input.proposal.target.type === 'existing_batch'
      ? {
          kind: 'existing_batch',
          productionBatchId: input.proposal.target.batchId,
          sequence: input.proposal.target.sequence,
        }
      : {
          kind: 'new_batch',
          sequence: input.proposal.target.insertAtSequence,
        },
  affectedBatchIds: input.proposal.affectedBatches.flatMap((batch) =>
    batch.sourceBatchId === null ? [] : [batch.sourceBatchId],
  ),
  queueVersion: input.proposal.expectedQueueVersion,
  proposalHash: input.proposal.placementPlanHash,
  projectedCompletionAt: input.proposal.projectedCompletionAt,
  overtimeMinutes: input.proposal.overtime.overrunMinutes,
  replayed: false,
});

const executePlacementInTransaction = async (deps: {
  repo: PlaceProductionOrderOperations;
  policy: ProductionPolicyPort;
  scheduler: ProductionSchedulerPort;
  clock: ClockPort;
  command: PlacementCommand;
  mode: PlacementMode;
  operation: string;
  storedOvertime: StoredOvertimeProposal | null;
  expectedProposalHash: string | null;
}): Promise<Result<ProductionOrderPlacementResult, AppError>> => {
  const payload = {
    expectedQueueVersion: deps.command.expectedQueueVersion,
    authorizedAction: deps.command.authorizedAction,
    ...(deps.command.expectedBatchVersion === undefined
      ? {}
      : { expectedBatchVersion: deps.command.expectedBatchVersion }),
    mode: deps.mode.type,
    ...(deps.mode.type === 'manager_exact'
      ? { productionBatchId: deps.mode.targetBatchId }
      : {}),
    ...(deps.expectedProposalHash === null
      ? {}
      : { proposalHash: deps.expectedProposalHash }),
  };
  const idempotency = defineWorkEventCommand({
    operation: deps.operation,
    locationId: deps.command.locationId,
    actorId: deps.command.actorId,
    entityType: 'production_order',
    entityId: deps.command.productionOrderId,
    expectedVersion: deps.command.expectedQueueVersion,
    payload,
  });

  const repo = deps.repo;
  const replay = resolveWorkEventReplay<ProductionOrderPlacementResult>(
    await repo.findWorkEvent(deps.command.idempotencyKey),
    idempotency,
  );
  if (replay.tag === 'conflict')
    return result.err(productionIdempotencyConflict());
  if (replay.tag === 'replay') return result.ok(replay.result);

  const context = await repo.loadContext(
    deps.command.locationId,
    deps.command.productionRunId,
    deps.command.productionOrderId,
  );
  const replayAfterLock =
    resolveWorkEventReplay<ProductionOrderPlacementResult>(
      await repo.findWorkEvent(deps.command.idempotencyKey),
      idempotency,
    );
  if (replayAfterLock.tag === 'conflict')
    return result.err(productionIdempotencyConflict());
  if (replayAfterLock.tag === 'replay')
    return result.ok(replayAfterLock.result);
  if (context === null)
    return result.err(
      productionError(
        'PRODUCTION_PLACEMENT_CONTEXT_NOT_FOUND',
        'The production run or order was not found.',
        404,
      ),
    );

  if (
    deps.mode.type === 'manager_exact' &&
    deps.command.expectedBatchVersion !== undefined &&
    context.batchVersions[deps.mode.targetBatchId] !==
      deps.command.expectedBatchVersion
  ) {
    const outcome = notPlaced({
      command: deps.command,
      mode: deps.mode,
      queueVersion: context.input.run.queueVersion,
      code: 'QUEUE_VERSION_CONFLICT',
      message: 'The target batch changed before exact placement.',
    });
    await repo.recordOutcome({
      ...deps.command,
      idempotency,
      result: outcome,
      proposal: null,
      mode: deps.mode.type,
      targetBatchId: deps.mode.targetBatchId,
      now: deps.clock.now(),
    });
    return result.ok(outcome);
  }

  const proposal = deps.scheduler.proposeOnlinePlacement({
    ...context.input,
    mode: deps.mode,
  });
  if (proposal.kind === 'rejected') {
    const outcome = notPlaced({
      command: deps.command,
      mode: deps.mode,
      queueVersion: context.input.run.queueVersion,
      code: proposal.reason.code,
      message: proposal.reason.message,
    });
    await repo.recordOutcome({
      ...deps.command,
      idempotency,
      result: outcome,
      proposal: null,
      mode: deps.mode.type,
      targetBatchId:
        deps.mode.type === 'manager_exact' ? deps.mode.targetBatchId : null,
      now: deps.clock.now(),
    });
    return result.ok(outcome);
  }

  if (
    deps.expectedProposalHash !== null &&
    (deps.storedOvertime === null ||
      deps.storedOvertime.proposalHash !== deps.expectedProposalHash ||
      deps.storedOvertime.queueVersion !== deps.command.expectedQueueVersion ||
      proposal.placementPlanHash !== deps.expectedProposalHash)
  ) {
    const outcome = notPlaced({
      command: deps.command,
      mode: deps.mode,
      queueVersion: context.input.run.queueVersion,
      code: 'OVERTIME_CONFIRMATION_STALE',
      message: 'The overtime proposal no longer matches the production queue.',
    });
    await repo.recordOutcome({
      ...deps.command,
      idempotency,
      result: outcome,
      proposal,
      mode: deps.mode.type,
      targetBatchId:
        deps.mode.type === 'manager_exact' ? deps.mode.targetBatchId : null,
      now: deps.clock.now(),
    });
    return result.ok(outcome);
  }

  const decision = deps.policy.evaluatePlacementCommit({
    runStatus: context.runStatus,
    orderStatus: context.orderStatus,
    orderAlreadyAssigned: context.orderAlreadyAssigned,
    expectedQueueVersion: deps.command.expectedQueueVersion,
    actualQueueVersion: context.input.run.queueVersion,
    placementType: deps.mode.type,
    authorizedAction: deps.command.authorizedAction,
    orderWeightLbs: context.input.order.derivedWeightLbs,
    pulseCapacityLbs: context.input.run.pulseCapacityLbs,
    overtime: {
      required: proposal.overtime.required,
      proposalHash: proposal.placementPlanHash,
      confirmation:
        deps.expectedProposalHash === null
          ? null
          : {
              proposalHash: deps.expectedProposalHash,
              queueVersion: deps.command.expectedQueueVersion,
            },
    },
  });

  if (
    decision.tag === 'err' &&
    decision.error.code === 'OVERTIME_CONFIRMATION_REQUIRED'
  ) {
    const outcome = confirmationRequired({
      command: deps.command,
      mode: deps.mode,
      proposal,
    });
    await repo.recordOutcome({
      ...deps.command,
      idempotency,
      result: outcome,
      proposal,
      mode: deps.mode.type,
      targetBatchId:
        deps.mode.type === 'manager_exact' ? deps.mode.targetBatchId : null,
      now: deps.clock.now(),
    });
    return result.ok(outcome);
  }

  if (decision.tag === 'err') {
    const outcome = notPlaced({
      command: deps.command,
      mode: deps.mode,
      queueVersion: context.input.run.queueVersion,
      code: decision.error.code,
      message: decision.error.message,
    });
    await repo.recordOutcome({
      ...deps.command,
      idempotency,
      result: outcome,
      proposal,
      mode: deps.mode.type,
      targetBatchId:
        deps.mode.type === 'manager_exact' ? deps.mode.targetBatchId : null,
      now: deps.clock.now(),
    });
    return result.ok(outcome);
  }

  const resolvedExecution = deps.policy.resolveProductionOrderExecutionState({
    executionState: context.orderExecutionStatus,
    operationalStatus: context.orderStatus,
  });
  if (resolvedExecution.tag === 'err')
    return result.err(
      productionError(
        resolvedExecution.error.code,
        resolvedExecution.error.message,
        409,
      ),
    );
  const orderDecision = deps.policy.evaluateProductionOrderExecutionTransition({
    state: resolvedExecution.value,
    event: 'schedule_or_place',
  });
  if (orderDecision.tag === 'err')
    return result.err(
      productionError(
        orderDecision.error.code,
        orderDecision.error.message,
        409,
      ),
    );
  if (
    orderDecision.value.from !== 'unassigned' ||
    orderDecision.value.state !== 'scheduled'
  )
    return result.err(
      productionError(
        'PRODUCTION_ORDER_EXECUTION_TRANSITION_INVALID',
        'The production order cannot be committed by placement.',
        409,
      ),
    );
  if (
    context.orderExecutionStatus !== 'unassigned' &&
    context.orderExecutionStatus !== 'scheduled' &&
    context.orderExecutionStatus !== 'finished'
  )
    return result.err(
      productionError(
        'PRODUCTION_ORDER_EXECUTION_STATE_INVALID',
        'The production order execution state is invalid.',
        409,
      ),
    );

  return result.ok(
    await repo.commitPlacement({
      ...deps.command,
      idempotency,
      result: confirmationRequired({
        command: deps.command,
        mode: deps.mode,
        proposal,
      }),
      context,
      proposal,
      mode: deps.mode.type,
      targetBatchId:
        deps.mode.type === 'manager_exact' ? deps.mode.targetBatchId : null,
      overtimeConfirmed: deps.expectedProposalHash !== null,
      orderLifecycle: {
        productionOrderId: deps.command.productionOrderId,
        persistedState: context.orderExecutionStatus,
        expectedVersion: context.orderVersion,
        lifecycle: {
          from: orderDecision.value.from,
          state: orderDecision.value.state,
        },
      },
      initialBatchState: deps.policy.initialProductionBatchState,
      initialStageState: deps.policy.initialProductionStageState,
      initialAttemptState: deps.policy.initialProductionOrderStageAttemptState,
      now: deps.clock.now(),
    }),
  );
};

const executePlacement = async (deps: {
  repo: PlaceProductionOrderRepository;
  policy: ProductionPolicyPort;
  scheduler: ProductionSchedulerPort;
  clock: ClockPort;
  command: PlacementCommand;
  mode: PlacementMode;
  operation: string;
  storedOvertime: StoredOvertimeProposal | null;
  expectedProposalHash: string | null;
}): Promise<Result<ProductionOrderPlacementResult, AppError>> =>
  deps.repo.transaction((repo) =>
    executePlacementInTransaction({ ...deps, repo }),
  );

export const makePlaceProductionOrder = (deps: {
  repo: PlaceProductionOrderRepository;
  policy: ProductionPolicyPort;
  scheduler: ProductionSchedulerPort;
  clock: ClockPort;
}): Readonly<{
  attemptAutomaticPlacement: (
    command: AutomaticPlacementAttemptCommand,
  ) => Promise<
    Result<AutomaticProductionOrderPlacementResult | null, AppError>
  >;
  placeAutomatically: PlaceProductionOrderAutomatically;
  placeExactly: PlaceProductionOrderExactly;
  confirmOvertime: ConfirmProductionOrderOvertime;
}> => ({
  attemptAutomaticPlacement: async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        await repo.lockLocationScheduling(command.locationId);
        const runs = await repo.findStartedRuns(command.locationId);

        if (runs.length !== 1) {
          const placement: PendingRunResolution =
            runs.length === 0
              ? {
                  status: 'awaiting_run',
                  reason: 'no_started_run',
                  message:
                    'This order is waiting for a production run to start.',
                }
              : {
                  status: 'ambiguous_run',
                  reason: 'multiple_started_runs',
                  message:
                    'More than one production run is active; choose the intended run before placing this order.',
                  candidateProductionRunIds: runs
                    .map((run) => run.productionRunId)
                    .sort(),
                };
          await repo.recordPendingRunResolution({
            locationId: command.locationId,
            productionOrderId: command.productionOrderId,
            actorId: command.actorId,
            idempotencyKey: command.idempotencyKey,
            placement,
            now: deps.clock.now(),
          });
          return result.ok(null);
        }

        const run = runs[0]!;
        return (await executePlacementInTransaction({
          ...deps,
          repo,
          command: {
            ...command,
            productionRunId: run.productionRunId,
            expectedQueueVersion: run.queueVersion,
          },
          mode: { type: 'automatic' },
          operation: 'production_order_placed_automatically',
          storedOvertime: null,
          expectedProposalHash: null,
        })) as Result<AutomaticProductionOrderPlacementResult, AppError>;
      });
    } catch (error) {
      return result.err(
        productionError(
          'PRODUCTION_ORDER_PLACEMENT_FAILED',
          'The eligible order could not be placed.',
          409,
          error,
        ),
      );
    }
  },

  placeAutomatically: async (command) => {
    try {
      return (await executePlacement({
        ...deps,
        command,
        mode: { type: 'automatic' },
        operation: 'production_order_placed_automatically',
        storedOvertime: null,
        expectedProposalHash: null,
      })) as Result<AutomaticProductionOrderPlacementResult, AppError>;
    } catch (error) {
      return result.err(
        productionError(
          'PRODUCTION_ORDER_PLACEMENT_FAILED',
          'The eligible order could not be placed.',
          409,
          error,
        ),
      );
    }
  },

  placeExactly: async (command) => {
    try {
      return (await executePlacement({
        ...deps,
        command,
        mode: {
          type: 'manager_exact',
          targetBatchId: command.productionBatchId,
        },
        operation: 'production_order_placed_exactly',
        storedOvertime: null,
        expectedProposalHash: null,
      })) as Result<ExactProductionOrderPlacementResult, AppError>;
    } catch (error) {
      return result.err(
        productionError(
          'PRODUCTION_ORDER_PLACEMENT_FAILED',
          'The eligible order could not be placed into that batch.',
          409,
          error,
        ),
      );
    }
  },

  confirmOvertime: async (command) => {
    try {
      const storedOvertime = await deps.repo.transaction((repo) =>
        repo.findOvertimeProposal(
          command.locationId,
          command.productionOrderId,
          command.proposalHash,
        ),
      );
      const mode: PlacementMode =
        storedOvertime?.mode === 'manager_exact' &&
        storedOvertime.targetBatchId !== null
          ? {
              type: 'manager_exact',
              targetBatchId: storedOvertime.targetBatchId,
            }
          : { type: 'automatic' };
      return (await executePlacement({
        ...deps,
        command,
        mode,
        operation: 'production_order_overtime_confirmed',
        storedOvertime,
        expectedProposalHash: command.proposalHash,
      })) as Result<ConfirmProductionOrderOvertimeResult, AppError>;
    } catch (error) {
      return result.err(
        productionError(
          'PRODUCTION_ORDER_OVERTIME_CONFIRMATION_FAILED',
          'The overtime placement could not be confirmed.',
          409,
          error,
        ),
      );
    }
  },
});
