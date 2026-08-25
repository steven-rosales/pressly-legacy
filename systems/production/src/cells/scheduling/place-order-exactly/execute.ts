import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type {
  OnlinePlacementProposal,
  ProductionOrderPlacementContext,
  ProposeOnlinePlacement,
} from '../../../model/online-order-placement/model.ts';
import { decidePlaceOrderExactly } from './decide.ts';
import {
  placeOrderExactlyIdempotencyConflict,
  placeOrderExactlyNotFound,
} from './failures.ts';
import type {
  ExactOrderNotPlacedResult,
  ExactOrderPlacementConfirmationRequiredResult,
  PlaceOrderExactlyCommand,
  PlaceOrderExactlyExpectedFailure,
  PlaceOrderExactlyMutation,
  PlaceOrderExactlyMutationInput,
  PlaceOrderExactlyPolicy,
  PlaceOrderExactlyResult,
} from './types.ts';

export type PlaceOrderExactlyWorkEventCommand = Readonly<{
  operation: 'production_order_placed_exactly';
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: 'production_order';
    entityId: string;
  }>;
  expectedVersion: number;
  payload: Readonly<{
    expectedQueueVersion: number;
    authorizedAction: 'production:override';
    expectedBatchVersion: number;
    mode: 'manager_exact';
    productionBatchId: string;
  }>;
}>;

export type PlaceOrderExactlyReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: PlaceOrderExactlyResult }>;

export type PlaceOrderExactlyIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: PlaceOrderExactlyWorkEventCommand,
  ) => PlaceOrderExactlyReplay;
}>;

export type PlaceOrderExactlyPendingPlacement =
  | Readonly<{
      status: 'confirmation_required';
      mode: 'manager_exact';
      productionRunId: string;
      target: ExactOrderPlacementConfirmationRequiredResult['target'];
      affectedBatchIds: readonly string[];
      queueVersion: number;
      proposalHash: string;
      projectedCompletionAt: string;
      overtimeMinutes: number;
    }>
  | Readonly<{
      status: 'not_placed';
      mode: 'manager_exact';
      productionRunId: string;
      reason: ExactOrderNotPlacedResult['reason'];
      message: string;
      queueVersion: number;
      preview: Readonly<{
        target: ExactOrderPlacementConfirmationRequiredResult['target'];
        affectedBatchIds: readonly string[];
        queueVersion: number;
        proposalHash: string;
        projectedCompletionAt: string;
        overtimeMinutes: number;
      }> | null;
    }>;

export type PlaceOrderExactlyWorkEventInput = Readonly<{
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
    authorizedAction: 'production:override';
    mode: 'manager_exact';
    targetBatchId: string;
    proposalHash: string | null;
    queueVersion: number;
    outcome: PlaceOrderExactlyResult['status'];
  }>;
  idempotency: Readonly<{
    command: PlaceOrderExactlyWorkEventCommand;
    result: PlaceOrderExactlyResult;
  }>;
}>;

export type PlaceOrderExactlyTransactionRepository<StoredWorkEvent> = Readonly<{
  findWorkEvent: (key: string) => Promise<StoredWorkEvent | null>;
  loadContext: (
    input: Readonly<{
      locationId: string;
      productionRunId: string;
      productionOrderId: string;
    }>,
  ) => Promise<ProductionOrderPlacementContext | null>;
  savePendingOutcome: (
    input: Readonly<{
      command: PlaceOrderExactlyCommand;
      pendingPlacement: PlaceOrderExactlyPendingPlacement;
      now: Date;
    }>,
  ) => Promise<void>;
  commitPlacement: (
    input: PlaceOrderExactlyMutationInput,
  ) => Promise<PlaceOrderExactlyMutation>;
  appendWorkEvent: (input: PlaceOrderExactlyWorkEventInput) => Promise<void>;
}>;

export type PlaceOrderExactlyRepository<StoredWorkEvent> = Readonly<{
  transaction: (
    work: (
      repository: PlaceOrderExactlyTransactionRepository<StoredWorkEvent>,
    ) => Promise<
      CellOutcome<PlaceOrderExactlyResult, PlaceOrderExactlyExpectedFailure>
    >,
  ) => Promise<
    CellOutcome<PlaceOrderExactlyResult, PlaceOrderExactlyExpectedFailure>
  >;
}>;

export type PlaceOrderExactlySignals = Readonly<{
  placementOutcome: (input: {
    status: PlaceOrderExactlyResult['status'];
    mode: 'manager_exact';
    reason?: ExactOrderNotPlacedResult['reason'];
  }) => void;
  queueConflict: (input: { operation: 'manager_exact_placement' }) => void;
}>;

export type PlaceOrderExactlyDependencies<StoredWorkEvent> = Readonly<{
  repo: PlaceOrderExactlyRepository<StoredWorkEvent>;
  idempotency: PlaceOrderExactlyIdempotency<StoredWorkEvent>;
  policy: PlaceOrderExactlyPolicy;
  proposeOnlinePlacement: ProposeOnlinePlacement<
    Readonly<{ type: 'manager_exact'; targetBatchId: string }>
  >;
  clock: Readonly<{ now: () => Date }>;
  signals?: PlaceOrderExactlySignals;
}>;

export type ExecutePlaceOrderExactly = (
  command: PlaceOrderExactlyCommand,
) => Promise<
  CellOutcome<PlaceOrderExactlyResult, PlaceOrderExactlyExpectedFailure>
>;

const success = (
  value: PlaceOrderExactlyResult,
): CellOutcome<PlaceOrderExactlyResult, PlaceOrderExactlyExpectedFailure> => ({
  kind: 'success',
  value,
});

const failure = (
  value: PlaceOrderExactlyExpectedFailure,
): CellOutcome<PlaceOrderExactlyResult, PlaceOrderExactlyExpectedFailure> => ({
  kind: 'failure',
  failure: value,
});

const workEventCommand = (
  command: PlaceOrderExactlyCommand,
): PlaceOrderExactlyWorkEventCommand => ({
  operation: 'production_order_placed_exactly',
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
    expectedBatchVersion: command.expectedBatchVersion,
    mode: 'manager_exact',
    productionBatchId: command.productionBatchId,
  },
});

const replayOutcome = (
  replay: PlaceOrderExactlyReplay,
): CellOutcome<
  PlaceOrderExactlyResult,
  PlaceOrderExactlyExpectedFailure
> | null => {
  if (replay.kind === 'conflict')
    return failure(placeOrderExactlyIdempotencyConflict());
  if (replay.kind === 'replay') return success(replay.result);
  return null;
};

const proposalTarget = (
  proposal: OnlinePlacementProposal,
): ExactOrderPlacementConfirmationRequiredResult['target'] =>
  proposal.target.type === 'existing_batch'
    ? {
        kind: 'existing_batch',
        productionBatchId: proposal.target.batchId,
        sequence: proposal.target.sequence,
      }
    : { kind: 'new_batch', sequence: proposal.target.insertAtSequence };

const pendingPlacement = (input: {
  result:
    | ExactOrderNotPlacedResult
    | ExactOrderPlacementConfirmationRequiredResult;
  proposal: OnlinePlacementProposal | null;
}): PlaceOrderExactlyPendingPlacement => {
  if (input.result.status === 'confirmation_required')
    return {
      status: input.result.status,
      mode: input.result.mode,
      productionRunId: input.result.productionRunId,
      target: input.result.target,
      affectedBatchIds: [...input.result.affectedBatchIds],
      queueVersion: input.result.queueVersion,
      proposalHash: input.result.proposalHash,
      projectedCompletionAt: input.result.projectedCompletionAt,
      overtimeMinutes: input.result.overtimeMinutes,
    };

  return {
    status: input.result.status,
    mode: input.result.mode,
    productionRunId: input.result.productionRunId,
    reason: input.result.reason,
    message: input.result.message,
    queueVersion: input.result.queueVersion,
    preview:
      input.proposal === null
        ? null
        : {
            target: proposalTarget(input.proposal),
            affectedBatchIds: input.proposal.affectedBatches.flatMap((batch) =>
              batch.sourceBatchId === null ? [] : [batch.sourceBatchId],
            ),
            queueVersion: input.proposal.expectedQueueVersion,
            proposalHash: input.proposal.placementPlanHash,
            projectedCompletionAt: input.proposal.projectedCompletionAt,
            overtimeMinutes: input.proposal.overtime.overrunMinutes,
          },
  };
};

const workEvent = (input: {
  command: PlaceOrderExactlyCommand;
  identity: PlaceOrderExactlyWorkEventCommand;
  result: PlaceOrderExactlyResult;
  proposal: OnlinePlacementProposal | null;
}): PlaceOrderExactlyWorkEventInput => ({
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
    mode: 'manager_exact',
    targetBatchId: input.command.productionBatchId,
    proposalHash: input.proposal?.placementPlanHash ?? null,
    queueVersion:
      input.proposal?.expectedQueueVersion ?? input.result.queueVersion,
    outcome: input.result.status,
  },
  idempotency: { command: input.identity, result: input.result },
});

const reportPlacement = (
  signals: PlaceOrderExactlySignals | undefined,
  result: PlaceOrderExactlyResult,
): void => {
  if (result.replayed) return;
  signals?.placementOutcome({
    status: result.status,
    mode: result.mode,
    ...(result.status === 'not_placed' ? { reason: result.reason } : {}),
  });
  if (result.status === 'not_placed' && result.reason === 'queue_conflict')
    signals?.queueConflict({ operation: 'manager_exact_placement' });
};

export const makeExecutePlaceOrderExactly =
  <StoredWorkEvent>(
    dependencies: PlaceOrderExactlyDependencies<StoredWorkEvent>,
  ): ExecutePlaceOrderExactly =>
  async (command) => {
    const identity = workEventCommand(command);
    try {
      const outcome = await dependencies.repo.transaction(
        async (repository) => {
          const before = replayOutcome(
            dependencies.idempotency.resolveReplay(
              await repository.findWorkEvent(command.idempotencyKey),
              identity,
            ),
          );
          if (before !== null) return before;

          const context = await repository.loadContext({
            locationId: command.locationId,
            productionRunId: command.productionRunId,
            productionOrderId: command.productionOrderId,
          });
          const after = replayOutcome(
            dependencies.idempotency.resolveReplay(
              await repository.findWorkEvent(command.idempotencyKey),
              identity,
            ),
          );
          if (after !== null) return after;
          if (context === null) return failure(placeOrderExactlyNotFound());

          const decision = decidePlaceOrderExactly({
            command,
            context,
            policy: dependencies.policy,
            proposeOnlinePlacement: dependencies.proposeOnlinePlacement,
          });
          if (decision.kind === 'reject') return failure(decision.failure);
          const now = dependencies.clock.now();
          if (decision.kind === 'audit') {
            await repository.savePendingOutcome({
              command,
              pendingPlacement: pendingPlacement(decision),
              now,
            });
            await repository.appendWorkEvent(
              workEvent({
                command,
                identity,
                result: decision.result,
                proposal: decision.proposal,
              }),
            );
            return success(decision.result);
          }

          const mutation = await repository.commitPlacement({
            command,
            context,
            plan: decision.plan,
            now,
          });
          if (mutation.kind === 'conflict') return failure(mutation.failure);
          await repository.appendWorkEvent(
            workEvent({
              command,
              identity,
              result: mutation.result,
              proposal: decision.plan.proposal,
            }),
          );
          return success(mutation.result);
        },
      );
      if (outcome.kind === 'success')
        reportPlacement(dependencies.signals, outcome.value);
      return outcome;
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_order_placement_failed',
          message: 'The eligible order could not be placed into that batch.',
          safeMessage:
            'The eligible order could not be placed into that batch.',
          status: 503,
          cause,
        }),
      );
    }
  };
