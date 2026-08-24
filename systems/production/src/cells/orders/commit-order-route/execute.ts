import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { ProductionOrderRouteReason } from '../../../model/execution.ts';
import type { OrderRouteProposalContext } from '../../../model/order-route-proposal/model.ts';
import { decideCommitOrderRoute } from './decide.ts';
import {
  commitOrderRouteIdempotencyConflict,
  commitOrderRouteNotFound,
} from './failures.ts';
import type {
  CommitOrderRouteCommand,
  CommitOrderRouteExpectedFailure,
  CommitOrderRouteMutation,
  CommitOrderRouteMutationInput,
  CommitOrderRoutePolicy,
  CommitOrderRouteResult,
} from './types.ts';

type QueuedMoveCommandPayload = Readonly<{
  kind: 'queued_move';
  authorizedAction: 'production:stage';
  reason: 'manual_rebatch';
  restartStage: 'sorting';
  expectedQueueVersion: number;
  expectedSourceBatchVersion: number;
  proposalHash: string;
  targetProductionBatchId: string;
}>;

type ExceptionCommandPayload = Readonly<{
  kind: 'exception';
  authorizedAction: 'production:stage';
  reason: Exclude<ProductionOrderRouteReason, 'manual_rebatch'>;
  restartStage: CommitOrderRouteCommand['restartStage'];
  expectedQueueVersion: number;
  expectedSourceBatchVersion: number;
  proposalHash: string;
  note?: string;
}>;

export type CommitOrderRouteWorkEventCommand = Readonly<{
  operation:
    | 'production_order_rebatched'
    | 'production_order_route_exception_recorded';
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: 'production_order';
    entityId: string;
  }>;
  expectedVersion: number;
  payload: QueuedMoveCommandPayload | ExceptionCommandPayload;
}>;

export type CommitOrderRouteReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: CommitOrderRouteResult }>;

export type CommitOrderRouteIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: CommitOrderRouteWorkEventCommand,
  ) => CommitOrderRouteReplay;
}>;

export type CommitOrderRouteWorkEventInput = Readonly<{
  locationId: string;
  eventType: CommitOrderRouteWorkEventCommand['operation'];
  entityType: 'production_order';
  entityId: string;
  actorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  payload: Readonly<{
    productionRunId: string;
    sourceProductionBatchId: string;
    targetProductionBatchId: string;
    reason: ProductionOrderRouteReason;
    restartStage: CommitOrderRouteCommand['restartStage'];
    releasedStages: readonly CommitOrderRouteCommand['restartStage'][];
    assignedStages: readonly CommitOrderRouteCommand['restartStage'][];
    proposalHash: string;
    queueVersion: number;
    orderVersion: number;
    note?: string;
  }>;
  idempotency: Readonly<{
    command: CommitOrderRouteWorkEventCommand;
    result: CommitOrderRouteResult;
  }>;
}>;

export type CommitOrderRouteTransactionRepository<StoredWorkEvent> = Readonly<{
  findWorkEvent: (idempotencyKey: string) => Promise<StoredWorkEvent | null>;
  loadContextForUpdate: (
    input: Readonly<{
      locationId: string;
      productionRunId: string;
      productionOrderId: string;
    }>,
  ) => Promise<OrderRouteProposalContext | null>;
  commit: (
    input: CommitOrderRouteMutationInput,
  ) => Promise<CommitOrderRouteMutation>;
  appendWorkEvent: (event: CommitOrderRouteWorkEventInput) => Promise<void>;
}>;

export type CommitOrderRouteRepository<StoredWorkEvent> = Readonly<{
  transaction: (
    work: (
      repository: CommitOrderRouteTransactionRepository<StoredWorkEvent>,
    ) => Promise<
      CellOutcome<CommitOrderRouteResult, CommitOrderRouteExpectedFailure>
    >,
  ) => Promise<
    CellOutcome<CommitOrderRouteResult, CommitOrderRouteExpectedFailure>
  >;
}>;

export type CommitOrderRouteSignals = Readonly<{
  orderRouteOutcome: (input: {
    operation: 'commit';
    status: 'committed' | 'replayed' | 'rejected' | 'conflict' | 'failed';
    kind: CommitOrderRouteCommand['kind'];
    reason: ProductionOrderRouteReason;
  }) => void;
  queueConflict: (input: { operation: 'order_route_commit' }) => void;
}>;

export type CommitOrderRouteDependencies<StoredWorkEvent> = Readonly<{
  repo: CommitOrderRouteRepository<StoredWorkEvent>;
  idempotency: CommitOrderRouteIdempotency<StoredWorkEvent>;
  policy: CommitOrderRoutePolicy;
  clock: Readonly<{ now: () => Date }>;
  signals?: CommitOrderRouteSignals;
}>;

export type ExecuteCommitOrderRoute = (
  command: CommitOrderRouteCommand,
) => Promise<
  CellOutcome<CommitOrderRouteResult, CommitOrderRouteExpectedFailure>
>;

const success = (
  value: CommitOrderRouteResult,
): CellOutcome<CommitOrderRouteResult, CommitOrderRouteExpectedFailure> => ({
  kind: 'success',
  value,
});

const failure = (
  value: CommitOrderRouteExpectedFailure,
): CellOutcome<CommitOrderRouteResult, CommitOrderRouteExpectedFailure> => ({
  kind: 'failure',
  failure: value,
});

const normalizedNote = (
  command: CommitOrderRouteCommand,
): string | undefined =>
  command.kind === 'exception' && command.note !== undefined
    ? command.note.trim()
    : undefined;

const workEventCommand = (
  command: CommitOrderRouteCommand,
  note: string | undefined,
): CommitOrderRouteWorkEventCommand => {
  const identity = {
    operation:
      command.kind === 'queued_move'
        ? 'production_order_rebatched'
        : 'production_order_route_exception_recorded',
    locationId: command.locationId,
    actorId: command.actorId,
    target: {
      entityType: 'production_order',
      entityId: command.productionOrderId,
    },
    expectedVersion: command.expectedOrderVersion,
  } as const;
  const concurrency = {
    authorizedAction: command.authorizedAction,
    expectedQueueVersion: command.expectedQueueVersion,
    expectedSourceBatchVersion: command.expectedSourceBatchVersion,
    proposalHash: command.proposalHash,
  } as const;

  return command.kind === 'queued_move'
    ? {
        ...identity,
        payload: {
          ...concurrency,
          kind: 'queued_move',
          reason: 'manual_rebatch',
          restartStage: 'sorting',
          targetProductionBatchId: command.targetProductionBatchId,
        },
      }
    : {
        ...identity,
        payload: {
          ...concurrency,
          kind: 'exception',
          reason: command.reason,
          restartStage: command.restartStage,
          ...(note === undefined ? {} : { note }),
        },
      };
};

const replayOutcome = (
  replay: CommitOrderRouteReplay,
): CellOutcome<
  CommitOrderRouteResult,
  CommitOrderRouteExpectedFailure
> | null => {
  if (replay.kind === 'conflict')
    return failure(commitOrderRouteIdempotencyConflict());
  if (replay.kind === 'replay') return success(replay.result);
  return null;
};

const reportOutcome = (
  signals: CommitOrderRouteSignals | undefined,
  command: CommitOrderRouteCommand,
  outcome: CellOutcome<CommitOrderRouteResult, CommitOrderRouteExpectedFailure>,
): void => {
  const status =
    outcome.kind === 'success'
      ? outcome.value.replayed
        ? 'replayed'
        : 'committed'
      : outcome.failure.kind === 'conflict'
        ? 'conflict'
        : 'rejected';
  signals?.orderRouteOutcome({
    operation: 'commit',
    status,
    kind: command.kind,
    reason: command.reason,
  });
  if (
    outcome.kind === 'failure' &&
    outcome.failure.code === 'production_queue_version_conflict'
  )
    signals?.queueConflict({ operation: 'order_route_commit' });
};

export const makeExecuteCommitOrderRoute =
  <StoredWorkEvent>(
    dependencies: CommitOrderRouteDependencies<StoredWorkEvent>,
  ): ExecuteCommitOrderRoute =>
  async (command) => {
    const note = normalizedNote(command);
    const idempotency = workEventCommand(command, note);
    let outcome: CellOutcome<
      CommitOrderRouteResult,
      CommitOrderRouteExpectedFailure
    >;

    try {
      outcome = await dependencies.repo.transaction(async (repository) => {
        const before = replayOutcome(
          dependencies.idempotency.resolveReplay(
            await repository.findWorkEvent(command.idempotencyKey),
            idempotency,
          ),
        );
        if (before !== null) return before;

        const context = await repository.loadContextForUpdate({
          locationId: command.locationId,
          productionRunId: command.productionRunId,
          productionOrderId: command.productionOrderId,
        });

        const after = replayOutcome(
          dependencies.idempotency.resolveReplay(
            await repository.findWorkEvent(command.idempotencyKey),
            idempotency,
          ),
        );
        if (after !== null) return after;
        if (context === null) return failure(commitOrderRouteNotFound());

        const decision = decideCommitOrderRoute({
          command,
          context,
          policy: dependencies.policy,
        });
        if (decision.kind === 'reject') return failure(decision.failure);

        const mutation = await repository.commit({
          locationId: command.locationId,
          actorId: command.actorId,
          reason: command.reason,
          ...(note === undefined ? {} : { note }),
          idempotencyKey: command.idempotencyKey,
          context,
          plan: decision.plan,
          now: dependencies.clock.now(),
        });
        if (mutation.kind === 'conflict') return failure(mutation.failure);

        const result = mutation.result;
        await repository.appendWorkEvent({
          locationId: command.locationId,
          eventType: idempotency.operation,
          entityType: 'production_order',
          entityId: context.order.id,
          actorId: command.actorId,
          expectedVersion: context.order.version,
          idempotencyKey: command.idempotencyKey,
          payload: {
            productionRunId: context.run.id,
            sourceProductionBatchId: context.source.productionBatchId,
            targetProductionBatchId:
              decision.plan.proposal.targetProductionBatchId,
            reason: command.reason,
            restartStage: decision.plan.proposal.restartStage,
            releasedStages: decision.plan.proposal.releasedStages,
            assignedStages: decision.plan.proposal.assignedStages,
            proposalHash: decision.plan.proposal.proposalHash,
            queueVersion: result.queueVersion,
            orderVersion: result.orderVersion,
            ...(note === undefined ? {} : { note }),
          },
          idempotency: { command: idempotency, result },
        });
        return success(result);
      });
    } catch (error) {
      dependencies.signals?.orderRouteOutcome({
        operation: 'commit',
        status: 'failed',
        kind: command.kind,
        reason: command.reason,
      });
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_order_route_failed',
          message: 'The production order could not be moved safely.',
          safeMessage: 'The production order could not be moved safely.',
          status: 503,
          cause,
        }),
      );
    }

    reportOutcome(dependencies.signals, command, outcome);
    return outcome;
  };
