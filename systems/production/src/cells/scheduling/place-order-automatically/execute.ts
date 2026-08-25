import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type {
  OnlinePlacementProposal,
  ProductionOrderPlacementContext,
  ProposeOnlinePlacement,
} from '../../../model/online-order-placement/model.ts';
import type { ProductionOrderSchedulingMutation } from '../../../model/public.ts';
import { decidePlaceOrderAutomatically } from './decide.ts';
import {
  placeOrderAutomaticallyContextNotFound,
  placeOrderAutomaticallyIdempotencyConflict,
} from './failures.ts';
import type {
  AutomaticProductionOrderNotPlacedResult,
  AutomaticProductionOrderPlacementConfirmationRequiredResult,
  AutomaticProductionOrderPlacedResult,
  AutomaticProductionOrderPlacementResult,
  AutomaticProductionPendingPlacement,
  AutomaticPlacementCommand,
  PlaceOrderAutomaticallyExpectedFailure,
  PlaceOrderAutomaticallyPolicy,
  PlaceProductionOrderAutomaticallyCommand,
} from './types.ts';

export type PlaceOrderAutomaticallyWorkEventCommand = Readonly<{
  operation: 'production_order_placed_automatically';
  locationId: string;
  actorId: string;
  target: Readonly<{ entityType: 'production_order'; entityId: string }>;
  expectedVersion: number;
  payload: Readonly<{
    expectedQueueVersion: number;
    authorizedAction: 'production:queue' | 'production:override';
    mode: 'automatic';
  }>;
}>;

export type PlaceOrderAutomaticallyReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{
      kind: 'replay';
      result: AutomaticProductionOrderPlacementResult;
    }>;

export type PlaceOrderAutomaticallyIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: PlaceOrderAutomaticallyWorkEventCommand,
  ) => PlaceOrderAutomaticallyReplay;
}>;

export type PlaceOrderAutomaticallyWorkEventInput = Readonly<{
  locationId: string;
  eventType:
    | 'production_order_placement_overtime_required'
    | 'production_order_placement_resolved';
  entityType: 'production_order';
  entityId: string;
  actorId: string;
  expectedVersion: number | null;
  idempotencyKey: string;
  payload: Readonly<{
    productionRunId: string;
    authorizedAction: 'production:queue' | 'production:override';
    mode: 'automatic';
    targetBatchId: null;
    proposalHash: string | null;
    queueVersion: number;
    outcome: AutomaticProductionOrderPlacementResult['status'];
  }>;
  idempotency: Readonly<{
    command: PlaceOrderAutomaticallyWorkEventCommand;
    result: AutomaticProductionOrderPlacementResult;
  }>;
}>;

export type RecordAutomaticPlacementOutcomeInput = Readonly<{
  command: AutomaticPlacementCommand;
  result:
    | AutomaticProductionOrderNotPlacedResult
    | AutomaticProductionOrderPlacementConfirmationRequiredResult;
  proposal: OnlinePlacementProposal | null;
  pendingPlacement: AutomaticProductionPendingPlacement;
  now: Date;
}>;

export type CommitAutomaticPlacementInput = Readonly<{
  command: AutomaticPlacementCommand;
  context: ProductionOrderPlacementContext;
  proposal: OnlinePlacementProposal;
  orderLifecycle: ProductionOrderSchedulingMutation;
  initialBatchState: 'queued';
  initialStageState: 'planned';
  initialAttemptState: 'assigned';
  now: Date;
}>;

export type PlaceOrderAutomaticallyTransactionRepository<StoredWorkEvent> =
  Readonly<{
    findWorkEvent: (key: string) => Promise<StoredWorkEvent | null>;
    loadContext: (
      locationId: string,
      productionRunId: string,
      productionOrderId: string,
    ) => Promise<ProductionOrderPlacementContext | null>;
    recordOutcome: (
      input: RecordAutomaticPlacementOutcomeInput,
    ) => Promise<void>;
    commitPlacement: (
      input: CommitAutomaticPlacementInput,
    ) => Promise<
      CellOutcome<
        AutomaticProductionOrderPlacedResult,
        PlaceOrderAutomaticallyExpectedFailure
      >
    >;
    appendWorkEvent: (
      event: PlaceOrderAutomaticallyWorkEventInput,
    ) => Promise<void>;
  }>;

export type PlaceOrderAutomaticallyRepository<StoredWorkEvent> = Readonly<{
  transaction: (
    work: (
      repository: PlaceOrderAutomaticallyTransactionRepository<StoredWorkEvent>,
    ) => Promise<
      CellOutcome<
        AutomaticProductionOrderPlacementResult,
        PlaceOrderAutomaticallyExpectedFailure
      >
    >,
  ) => Promise<
    CellOutcome<
      AutomaticProductionOrderPlacementResult,
      PlaceOrderAutomaticallyExpectedFailure
    >
  >;
}>;

export type PlaceOrderAutomaticallySignals = Readonly<{
  placementOutcome: (
    input: Readonly<{
      status: AutomaticProductionOrderPlacementResult['status'];
      mode: 'automatic';
      reason?: AutomaticProductionOrderNotPlacedResult['reason'];
    }>,
  ) => void;
  queueConflict: (
    input: Readonly<{
      operation: 'automatic_placement';
    }>,
  ) => void;
}>;

export type PlaceOrderAutomaticallyDependencies<StoredWorkEvent> = Readonly<{
  repo: PlaceOrderAutomaticallyRepository<StoredWorkEvent>;
  idempotency: PlaceOrderAutomaticallyIdempotency<StoredWorkEvent>;
  policy: PlaceOrderAutomaticallyPolicy;
  proposeOnlinePlacement: ProposeOnlinePlacement<
    Readonly<{ type: 'automatic' }>
  >;
  clock: Readonly<{ now: () => Date }>;
  signals?: PlaceOrderAutomaticallySignals;
}>;

export type ExecutePlaceOrderAutomatically = (
  command: PlaceProductionOrderAutomaticallyCommand,
) => Promise<
  CellOutcome<
    AutomaticProductionOrderPlacementResult,
    PlaceOrderAutomaticallyExpectedFailure
  >
>;

const success = (value: AutomaticProductionOrderPlacementResult) =>
  ({ kind: 'success', value }) as const;
const failure = (value: PlaceOrderAutomaticallyExpectedFailure) =>
  ({ kind: 'failure', failure: value }) as const;

const commandEnvelope = (
  command: AutomaticPlacementCommand,
): PlaceOrderAutomaticallyWorkEventCommand => ({
  operation: 'production_order_placed_automatically',
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: 'production_order',
    entityId: command.productionOrderId,
  },
  expectedVersion: command.expectedQueueVersion,
  payload: {
    expectedQueueVersion: command.expectedQueueVersion,
    authorizedAction: command.authorizedAction,
    mode: 'automatic',
  },
});

const pendingPlacement = (
  result:
    | AutomaticProductionOrderNotPlacedResult
    | AutomaticProductionOrderPlacementConfirmationRequiredResult,
  proposal: OnlinePlacementProposal | null,
): AutomaticProductionPendingPlacement => {
  if (result.status === 'confirmation_required')
    return {
      status: result.status,
      mode: result.mode,
      productionRunId: result.productionRunId,
      target: result.target,
      affectedBatchIds: result.affectedBatchIds,
      queueVersion: result.queueVersion,
      proposalHash: result.proposalHash,
      projectedCompletionAt: result.projectedCompletionAt,
      overtimeMinutes: result.overtimeMinutes,
    };
  return {
    status: result.status,
    mode: result.mode,
    productionRunId: result.productionRunId,
    reason: result.reason,
    message: result.message,
    queueVersion: result.queueVersion,
    preview:
      proposal === null
        ? null
        : {
            target:
              proposal.target.type === 'existing_batch'
                ? {
                    kind: 'existing_batch',
                    productionBatchId: proposal.target.batchId,
                    sequence: proposal.target.sequence,
                  }
                : {
                    kind: 'new_batch',
                    sequence: proposal.target.insertAtSequence,
                  },
            affectedBatchIds: proposal.affectedBatches.flatMap((batch) =>
              batch.sourceBatchId === null ? [] : [batch.sourceBatchId],
            ),
            queueVersion: proposal.expectedQueueVersion,
            proposalHash: proposal.placementPlanHash,
            projectedCompletionAt: proposal.projectedCompletionAt,
            overtimeMinutes: proposal.overtime.overrunMinutes,
          },
  };
};

const workEvent = (input: {
  command: AutomaticPlacementCommand;
  envelope: PlaceOrderAutomaticallyWorkEventCommand;
  result: AutomaticProductionOrderPlacementResult;
  proposal: OnlinePlacementProposal | null;
}): PlaceOrderAutomaticallyWorkEventInput => ({
  locationId: input.command.locationId,
  eventType:
    input.result.status === 'confirmation_required'
      ? 'production_order_placement_overtime_required'
      : 'production_order_placement_resolved',
  entityType: 'production_order',
  entityId: input.command.productionOrderId,
  actorId: input.command.actorId,
  expectedVersion: input.proposal?.expectedQueueVersion ?? null,
  idempotencyKey: input.command.idempotencyKey,
  payload: {
    productionRunId: input.command.productionRunId,
    authorizedAction: input.command.authorizedAction,
    mode: 'automatic',
    targetBatchId: null,
    proposalHash: input.proposal?.placementPlanHash ?? null,
    queueVersion:
      input.proposal?.expectedQueueVersion ?? input.result.queueVersion,
    outcome: input.result.status,
  },
  idempotency: { command: input.envelope, result: input.result },
});

const reportPlacement = (
  signals: PlaceOrderAutomaticallySignals | undefined,
  result: AutomaticProductionOrderPlacementResult,
): void => {
  if (result.replayed) return;
  signals?.placementOutcome({
    status: result.status,
    mode: result.mode,
    ...(result.status === 'not_placed' ? { reason: result.reason } : {}),
  });
  if (result.status === 'not_placed' && result.reason === 'queue_conflict')
    signals?.queueConflict({ operation: 'automatic_placement' });
};

export const makeExecutePlaceOrderAutomatically = <StoredWorkEvent>(
  deps: PlaceOrderAutomaticallyDependencies<StoredWorkEvent>,
): ExecutePlaceOrderAutomatically => {
  const executeInTransaction = makeExecutePlaceOrderAutomaticallyInTransaction({
    idempotency: deps.idempotency,
    policy: deps.policy,
    proposeOnlinePlacement: deps.proposeOnlinePlacement,
    clock: deps.clock,
  });
  return async (command) => {
    let outcome: CellOutcome<
      AutomaticProductionOrderPlacementResult,
      PlaceOrderAutomaticallyExpectedFailure
    >;
    try {
      outcome = await deps.repo.transaction((repo) =>
        executeInTransaction({ repository: repo, command }),
      );
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_order_placement_failed',
          message: 'The eligible order could not be placed.',
          safeMessage: 'The eligible order could not be placed.',
          status: 503,
          cause,
        }),
      );
    }

    if (outcome.kind === 'success')
      reportPlacement(deps.signals, outcome.value);
    return outcome;
  };
};

export type PlaceOrderAutomaticallyInTransactionDependencies<StoredWorkEvent> =
  Readonly<
    Omit<
      PlaceOrderAutomaticallyDependencies<StoredWorkEvent>,
      'repo' | 'signals'
    >
  >;

export type ExecutePlaceOrderAutomaticallyInTransaction<StoredWorkEvent> =
  (input: {
    repository: PlaceOrderAutomaticallyTransactionRepository<StoredWorkEvent>;
    command: AutomaticPlacementCommand;
  }) => Promise<
    CellOutcome<
      AutomaticProductionOrderPlacementResult,
      PlaceOrderAutomaticallyExpectedFailure
    >
  >;

/**
 * The run-discovery command injects this narrow capability from system
 * composition so its one-run branch stays inside the same advisory-locked
 * transaction without importing this sibling cell.
 */
export const makeExecutePlaceOrderAutomaticallyInTransaction =
  <StoredWorkEvent>(
    deps: PlaceOrderAutomaticallyInTransactionDependencies<StoredWorkEvent>,
  ): ExecutePlaceOrderAutomaticallyInTransaction<StoredWorkEvent> =>
  async ({ repository, command }) => {
    const envelope = commandEnvelope(command);
    const replayBefore = deps.idempotency.resolveReplay(
      await repository.findWorkEvent(command.idempotencyKey),
      envelope,
    );
    if (replayBefore.kind === 'conflict')
      return failure(placeOrderAutomaticallyIdempotencyConflict());
    if (replayBefore.kind === 'replay') return success(replayBefore.result);

    const context = await repository.loadContext(
      command.locationId,
      command.productionRunId,
      command.productionOrderId,
    );
    const replayAfter = deps.idempotency.resolveReplay(
      await repository.findWorkEvent(command.idempotencyKey),
      envelope,
    );
    if (replayAfter.kind === 'conflict')
      return failure(placeOrderAutomaticallyIdempotencyConflict());
    if (replayAfter.kind === 'replay') return success(replayAfter.result);
    if (context === null)
      return failure(placeOrderAutomaticallyContextNotFound());

    const proposal = deps.proposeOnlinePlacement({
      ...context.input,
      mode: { type: 'automatic' },
    });
    const decision = decidePlaceOrderAutomatically({
      command,
      context,
      proposal,
      policy: deps.policy,
    });
    if (decision.kind === 'reject') return failure(decision.failure);

    const now = deps.clock.now();
    if (decision.kind === 'record') {
      await repository.recordOutcome({
        command,
        result: decision.result,
        proposal: decision.proposal,
        pendingPlacement: pendingPlacement(decision.result, decision.proposal),
        now,
      });
      await repository.appendWorkEvent(
        workEvent({
          command,
          envelope,
          result: decision.result,
          proposal: decision.proposal,
        }),
      );
      return success(decision.result);
    }

    const committed = await repository.commitPlacement({
      command,
      context,
      proposal: decision.proposal,
      orderLifecycle: decision.orderLifecycle,
      initialBatchState: deps.policy.initialProductionBatchState,
      initialStageState: deps.policy.initialProductionStageState,
      initialAttemptState: deps.policy.initialProductionOrderStageAttemptState,
      now,
    });
    if (committed.kind === 'failure') return committed;
    await repository.appendWorkEvent(
      workEvent({
        command,
        envelope,
        result: committed.value,
        proposal: decision.proposal,
      }),
    );
    return committed;
  };
