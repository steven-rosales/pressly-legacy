import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import {
  databaseError,
  invariantViolationError,
} from '@pressly/errors/factories';
import type {
  OnlinePlacementMode,
  OnlinePlacementProposal,
  ProductionOrderPlacementContext,
  ProposeOnlinePlacement,
} from '../../../model/online-order-placement/model.ts';
import type { ProductionOrderSchedulingMutation } from '../../../model/public.ts';
import {
  decideConfirmOrderOvertime,
  placementModeFromStoredOvertime,
} from './decide.ts';
import {
  confirmOrderOvertimeContextNotFound,
  confirmOrderOvertimeIdempotencyConflict,
} from './failures.ts';
import type {
  ConfirmOrderOvertimeExpectedFailure,
  ConfirmOrderOvertimePendingPlacement,
  ConfirmOrderOvertimePolicy,
  ConfirmOrderOvertimeTransactionResult,
  ConfirmProductionOrderOvertimeCommand,
  ConfirmProductionOrderOvertimeResult,
  ConfirmedPlacementConfirmationRequiredResult,
  ConfirmedProductionOrderNotPlacedResult,
  ConfirmedProductionOrderPlacedResult,
  StoredOvertimeProposal,
} from './types.ts';

export type ConfirmOrderOvertimeWorkEventCommand = Readonly<{
  operation: 'production_order_overtime_confirmed';
  locationId: string;
  actorId: string;
  target: Readonly<{ entityType: 'production_order'; entityId: string }>;
  expectedVersion: number;
  payload: Readonly<{
    expectedQueueVersion: number;
    authorizedAction: 'production:override';
    mode: OnlinePlacementMode['type'];
    productionBatchId?: string;
    proposalHash: string;
  }>;
}>;

export type ConfirmOrderOvertimeReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{
      kind: 'replay';
      result: ConfirmOrderOvertimeTransactionResult;
    }>;

export type ConfirmOrderOvertimeIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: ConfirmOrderOvertimeWorkEventCommand,
  ) => ConfirmOrderOvertimeReplay;
}>;

export type ConfirmOrderOvertimeWorkEventInput = Readonly<{
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
    mode: OnlinePlacementMode['type'];
    targetBatchId: string | null;
    proposalHash: string | null;
    queueVersion: number;
    outcome: ConfirmOrderOvertimeTransactionResult['status'];
  }>;
  idempotency: Readonly<{
    command: ConfirmOrderOvertimeWorkEventCommand;
    result: ConfirmOrderOvertimeTransactionResult;
  }>;
}>;

export type RecordConfirmOrderOvertimeOutcomeInput = Readonly<{
  command: ConfirmProductionOrderOvertimeCommand;
  mode: OnlinePlacementMode;
  result:
    | ConfirmedPlacementConfirmationRequiredResult
    | ConfirmedProductionOrderNotPlacedResult;
  proposal: OnlinePlacementProposal | null;
  pendingPlacement: ConfirmOrderOvertimePendingPlacement;
  now: Date;
}>;

export type CommitConfirmedPlacementInput = Readonly<{
  command: ConfirmProductionOrderOvertimeCommand;
  mode: OnlinePlacementMode;
  context: ProductionOrderPlacementContext;
  proposal: OnlinePlacementProposal;
  overtimeConfirmed: true;
  orderLifecycle: ProductionOrderSchedulingMutation;
  initialBatchState: 'queued';
  initialStageState: 'planned';
  initialAttemptState: 'assigned';
  now: Date;
}>;

export type ConfirmOrderOvertimeTransactionRepository<StoredWorkEvent> =
  Readonly<{
    findWorkEvent: (key: string) => Promise<StoredWorkEvent | null>;
    loadContext: (
      locationId: string,
      productionRunId: string,
      productionOrderId: string,
    ) => Promise<ProductionOrderPlacementContext | null>;
    recordOutcome: (
      input: RecordConfirmOrderOvertimeOutcomeInput,
    ) => Promise<void>;
    commitPlacement: (
      input: CommitConfirmedPlacementInput,
    ) => Promise<
      CellOutcome<
        ConfirmedProductionOrderPlacedResult,
        ConfirmOrderOvertimeExpectedFailure
      >
    >;
    appendWorkEvent: (
      event: ConfirmOrderOvertimeWorkEventInput,
    ) => Promise<void>;
  }>;

export type ConfirmOrderOvertimeRepository<StoredWorkEvent> = Readonly<{
  findOvertimeProposal: (
    locationId: string,
    productionOrderId: string,
    proposalHash: string,
  ) => Promise<StoredOvertimeProposal | null>;
  transaction: (
    work: (
      repository: ConfirmOrderOvertimeTransactionRepository<StoredWorkEvent>,
    ) => Promise<
      CellOutcome<
        ConfirmOrderOvertimeTransactionResult,
        ConfirmOrderOvertimeExpectedFailure
      >
    >,
  ) => Promise<
    CellOutcome<
      ConfirmOrderOvertimeTransactionResult,
      ConfirmOrderOvertimeExpectedFailure
    >
  >;
}>;

export type ConfirmOrderOvertimeSignals = Readonly<{
  placementOutcome: (
    input: Readonly<{
      status: ConfirmProductionOrderOvertimeResult['status'];
      mode: OnlinePlacementMode['type'];
      reason?: ConfirmedProductionOrderNotPlacedResult['reason'];
    }>,
  ) => void;
  queueConflict: (
    input: Readonly<{
      operation: 'overtime_confirmation';
    }>,
  ) => void;
  overtimeConfirmed: () => void;
}>;

export type ConfirmOrderOvertimeDependencies<StoredWorkEvent> = Readonly<{
  repo: ConfirmOrderOvertimeRepository<StoredWorkEvent>;
  idempotency: ConfirmOrderOvertimeIdempotency<StoredWorkEvent>;
  policy: ConfirmOrderOvertimePolicy;
  proposeOnlinePlacement: ProposeOnlinePlacement;
  clock: Readonly<{ now: () => Date }>;
  signals?: ConfirmOrderOvertimeSignals;
}>;

export type ExecuteConfirmOrderOvertime = (
  command: ConfirmProductionOrderOvertimeCommand,
) => Promise<
  CellOutcome<
    ConfirmProductionOrderOvertimeResult,
    ConfirmOrderOvertimeExpectedFailure
  >
>;

const success = (value: ConfirmOrderOvertimeTransactionResult) =>
  ({ kind: 'success', value }) as const;
const failure = (value: ConfirmOrderOvertimeExpectedFailure) =>
  ({ kind: 'failure', failure: value }) as const;

const commandEnvelope = (
  command: ConfirmProductionOrderOvertimeCommand,
  mode: OnlinePlacementMode,
): ConfirmOrderOvertimeWorkEventCommand => ({
  operation: 'production_order_overtime_confirmed',
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
    mode: mode.type,
    ...(mode.type === 'manager_exact'
      ? { productionBatchId: mode.targetBatchId }
      : {}),
    proposalHash: command.proposalHash,
  },
});

const pendingPlacement = (
  result:
    | ConfirmedPlacementConfirmationRequiredResult
    | ConfirmedProductionOrderNotPlacedResult,
  proposal: OnlinePlacementProposal | null,
): ConfirmOrderOvertimePendingPlacement => {
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
  command: ConfirmProductionOrderOvertimeCommand;
  mode: OnlinePlacementMode;
  envelope: ConfirmOrderOvertimeWorkEventCommand;
  result: ConfirmOrderOvertimeTransactionResult;
  proposal: OnlinePlacementProposal | null;
}): ConfirmOrderOvertimeWorkEventInput => ({
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
    mode: input.mode.type,
    targetBatchId:
      input.mode.type === 'manager_exact' ? input.mode.targetBatchId : null,
    proposalHash: input.proposal?.placementPlanHash ?? null,
    queueVersion:
      input.proposal?.expectedQueueVersion ?? input.result.queueVersion,
    outcome: input.result.status,
  },
  idempotency: { command: input.envelope, result: input.result },
});

const terminalResult = (
  result: ConfirmOrderOvertimeTransactionResult,
): ConfirmProductionOrderOvertimeResult => {
  if (result.status !== 'confirmation_required') return result;
  throw invariantViolationError({
    code: 'production_overtime_confirmation_unresolved',
    message:
      'A confirmed overtime placement unexpectedly requested confirmation again.',
    safeMessage: 'The overtime placement could not be confirmed.',
  });
};

const report = (
  signals: ConfirmOrderOvertimeSignals | undefined,
  result: ConfirmProductionOrderOvertimeResult,
): void => {
  if (result.replayed) return;
  signals?.placementOutcome({
    status: result.status,
    mode: result.mode,
    ...(result.status === 'not_placed' ? { reason: result.reason } : {}),
  });
  if (result.status === 'not_placed' && result.reason === 'queue_conflict')
    signals?.queueConflict({ operation: 'overtime_confirmation' });
  if (result.status === 'placed') signals?.overtimeConfirmed();
};

export const makeExecuteConfirmOrderOvertime = <StoredWorkEvent>(
  deps: ConfirmOrderOvertimeDependencies<StoredWorkEvent>,
): ExecuteConfirmOrderOvertime => {
  return async (command) => {
    try {
      const storedOvertime = await deps.repo.findOvertimeProposal(
        command.locationId,
        command.productionOrderId,
        command.proposalHash,
      );
      const mode = placementModeFromStoredOvertime(storedOvertime);
      const outcome = await deps.repo.transaction(async (repository) => {
        const envelope = commandEnvelope(command, mode);
        const replayBefore = deps.idempotency.resolveReplay(
          await repository.findWorkEvent(command.idempotencyKey),
          envelope,
        );
        if (replayBefore.kind === 'conflict')
          return failure(confirmOrderOvertimeIdempotencyConflict());
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
          return failure(confirmOrderOvertimeIdempotencyConflict());
        if (replayAfter.kind === 'replay') return success(replayAfter.result);
        if (context === null)
          return failure(confirmOrderOvertimeContextNotFound());

        const proposal = deps.proposeOnlinePlacement({
          ...context.input,
          mode,
        });
        const decision = decideConfirmOrderOvertime({
          command,
          storedOvertime,
          mode,
          context,
          proposal,
          policy: deps.policy,
        });
        if (decision.kind === 'reject') return failure(decision.failure);

        const now = deps.clock.now();
        if (decision.kind === 'record') {
          await repository.recordOutcome({
            command,
            mode,
            result: decision.result,
            proposal: decision.proposal,
            pendingPlacement: pendingPlacement(
              decision.result,
              decision.proposal,
            ),
            now,
          });
          await repository.appendWorkEvent(
            workEvent({
              command,
              mode,
              envelope,
              result: decision.result,
              proposal: decision.proposal,
            }),
          );
          return success(decision.result);
        }

        const committed = await repository.commitPlacement({
          command,
          mode,
          context,
          proposal: decision.proposal,
          overtimeConfirmed: true,
          orderLifecycle: decision.orderLifecycle,
          initialBatchState: deps.policy.initialProductionBatchState,
          initialStageState: deps.policy.initialProductionStageState,
          initialAttemptState:
            deps.policy.initialProductionOrderStageAttemptState,
          now,
        });
        if (committed.kind === 'failure') return committed;
        await repository.appendWorkEvent(
          workEvent({
            command,
            mode,
            envelope,
            result: committed.value,
            proposal: decision.proposal,
          }),
        );
        return committed;
      });
      if (outcome.kind === 'failure') return outcome;
      const value = terminalResult(outcome.value);
      report(deps.signals, value);
      return { kind: 'success', value };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_order_overtime_confirmation_failed',
          message: 'The overtime placement could not be confirmed.',
          safeMessage: 'The overtime placement could not be confirmed.',
          status: 503,
          cause,
        }),
      );
    }
  };
};
