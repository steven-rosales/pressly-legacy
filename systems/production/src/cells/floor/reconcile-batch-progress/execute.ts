import { type JsonObject } from '@pressly/codec';
import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { decideReconcileBatchProgress } from './decide.ts';
import type {
  ReconcileBatchProgressCommand,
  ReconcileBatchProgressExpectedFailure,
  ReconcileBatchProgressPolicy,
  ReconcileBatchProgressResult,
  ReconciledBatchProgress,
  ReconciliationCommitPlan,
  ReconciliationContext,
} from './types.ts';

export type ReconcileBatchProgressWorkEventCommand = Readonly<{
  operation: 'batch_progress_reconciled';
  locationId: string;
  actorId: string;
  target: Readonly<{ entityType: 'production_batch'; entityId: string }>;
  expectedVersion: number;
  payload: JsonObject;
}>;

export type ReconcileBatchProgressReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: ReconciledBatchProgress }>;

export type ReconcileBatchProgressIdempotency<Stored> = Readonly<{
  resolveReplay: (
    stored: Stored | null,
    expected: ReconcileBatchProgressWorkEventCommand,
  ) => ReconcileBatchProgressReplay;
}>;

export type ReconcileBatchProgressWorkEventInput = Readonly<{
  locationId: string;
  eventType: 'batch_progress_reconciled';
  entityType: 'production_batch';
  entityId: string;
  actorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  payload: JsonObject;
  idempotency: Readonly<{
    command: ReconcileBatchProgressWorkEventCommand;
    result: ReconciledBatchProgress;
  }>;
}>;

export type ReconcileBatchProgressTransactionRepository<Stored> = Readonly<{
  findWorkEvent: (key: string) => Promise<Stored | null>;
  loadContext: (
    locationId: string,
    productionRunId: string,
    productionBatchId: string,
  ) => Promise<ReconciliationContext | null>;
  reconcile: (input: {
    locationId: string;
    actorId: string;
    plan: ReconciliationCommitPlan;
  }) => Promise<
    CellOutcome<ReconciledBatchProgress, ReconcileBatchProgressExpectedFailure>
  >;
  appendWorkEvent: (
    event: ReconcileBatchProgressWorkEventInput,
  ) => Promise<void>;
}>;

export type ReconcileBatchProgressRepository<Stored> = Readonly<{
  transaction: (
    work: (
      repo: ReconcileBatchProgressTransactionRepository<Stored>,
    ) => Promise<
      CellOutcome<
        ReconcileBatchProgressResult,
        ReconcileBatchProgressExpectedFailure
      >
    >,
  ) => Promise<
    CellOutcome<
      ReconcileBatchProgressResult,
      ReconcileBatchProgressExpectedFailure
    >
  >;
}>;

export type ReconcileBatchProgressSignals = Readonly<{
  progressReconciled: (
    input: Readonly<{
      target: ReconciledBatchProgress['milestone'];
      runCompleted: boolean;
    }>,
  ) => void;
}>;

export type ReconcileBatchProgressDependencies<Stored> = Readonly<{
  repo: ReconcileBatchProgressRepository<Stored>;
  idempotency: ReconcileBatchProgressIdempotency<Stored>;
  policy: ReconcileBatchProgressPolicy;
  clock: Readonly<{ now: () => Date }>;
  signals?: ReconcileBatchProgressSignals;
}>;

const success = (value: ReconcileBatchProgressResult) =>
  ({ kind: 'success', value }) as const;
const failure = (value: ReconcileBatchProgressExpectedFailure) =>
  ({ kind: 'failure', failure: value }) as const;

const idempotencyConflict = (): ReconcileBatchProgressExpectedFailure => ({
  kind: 'conflict',
  code: 'production_idempotency_conflict',
  message: 'The idempotency key belongs to a different production command.',
  safeMessage: 'The idempotency key belongs to a different production command.',
});

const commandEnvelope = (
  command: ReconcileBatchProgressCommand,
): ReconcileBatchProgressWorkEventCommand => ({
  operation: 'batch_progress_reconciled',
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: 'production_batch',
    entityId: command.productionBatchId,
  },
  expectedVersion: command.expectedBatchVersion,
  payload: {
    productionRunId: command.productionRunId,
    expectedQueueVersion: command.expectedQueueVersion,
    expectedStageVersions: command.expectedStageVersions.map((stage) => ({
      ...stage,
    })),
    target: command.target,
    reason: command.reason,
    note: command.note,
    machineIds: [...command.machineIds].sort(),
    confirmation:
      command.confirmation === null ? null : { ...command.confirmation },
  },
});

const workEventPayload = (
  command: ReconcileBatchProgressCommand,
  plan: ReconciliationCommitPlan,
  mutation: ReconciledBatchProgress,
): JsonObject => ({
  recordedAt: plan.now.toISOString(),
  reason: command.reason,
  note: command.note,
  currentMilestone: plan.projection.currentMilestone,
  targetMilestone: plan.projection.targetMilestone,
  machineIds: [...plan.machineIds],
  confirmation: {
    proposalHash: command.confirmation?.proposalHash ?? '',
    reviewedEffects: { ...plan.confirmationRequired.effects },
  },
  stageBoundaries: plan.projection.stages
    .filter((stage) => stage.currentStatus !== stage.nextStatus)
    .map((stage) => {
      const current = plan.context.stages.find(
        (candidate) => candidate.stageRunId === stage.stageRunId,
      );
      const actualStartProvenance =
        stage.currentStatus === 'planned'
          ? 'not_recorded'
          : current?.actualStartProvenance;
      return {
        stageRunId: stage.stageRunId,
        stage: stage.stage,
        status: stage.nextStatus,
        ...(actualStartProvenance === undefined
          ? {}
          : { actualStartProvenance }),
        ...(stage.nextStatus === 'completed'
          ? { actualEndProvenance: 'not_recorded' }
          : {}),
      };
    }),
  result: {
    queueVersion: mutation.queueVersion,
    batchVersion: mutation.batchVersion,
    stageVersions: mutation.stageVersions.map((stage) => ({ ...stage })),
    runCompleted: mutation.runCompleted,
    shiftClosed: mutation.shiftClosed,
  },
});

export const makeExecuteReconcileBatchProgress =
  <Stored>(deps: ReconcileBatchProgressDependencies<Stored>) =>
  async (
    command: ReconcileBatchProgressCommand,
  ): Promise<
    CellOutcome<
      ReconcileBatchProgressResult,
      ReconcileBatchProgressExpectedFailure
    >
  > => {
    let outcome: CellOutcome<
      ReconcileBatchProgressResult,
      ReconcileBatchProgressExpectedFailure
    >;
    try {
      outcome = await deps.repo.transaction(async (repo) => {
        const envelope = commandEnvelope(command);
        const before = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          envelope,
        );
        if (before.kind === 'conflict') return failure(idempotencyConflict());
        if (before.kind === 'replay') return success(before.result);
        const context = await repo.loadContext(
          command.locationId,
          command.productionRunId,
          command.productionBatchId,
        );
        const after = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          envelope,
        );
        if (after.kind === 'conflict') return failure(idempotencyConflict());
        if (after.kind === 'replay') return success(after.result);

        const decision = decideReconcileBatchProgress({
          command,
          context,
          policy: deps.policy,
          now: command.confirmation === null ? new Date(0) : deps.clock.now(),
        });
        if (decision.kind === 'reject') return failure(decision.failure);
        if (decision.kind === 'preview') return success(decision.result);

        const mutation = await repo.reconcile({
          locationId: command.locationId,
          actorId: command.actorId,
          plan: decision.plan,
        });
        if (mutation.kind === 'failure') return mutation;
        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'batch_progress_reconciled',
          entityType: 'production_batch',
          entityId: command.productionBatchId,
          actorId: command.actorId,
          expectedVersion: command.expectedBatchVersion,
          idempotencyKey: command.idempotencyKey,
          payload: workEventPayload(command, decision.plan, mutation.value),
          idempotency: { command: envelope, result: mutation.value },
        });
        return mutation;
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'progress_reconciliation_failed',
          message: 'Floor progress could not be recorded.',
          safeMessage: 'Floor progress could not be recorded.',
          status: 503,
          cause,
        }),
      );
    }
    if (
      outcome.kind === 'success' &&
      outcome.value.status === 'reconciled' &&
      !outcome.value.replayed
    )
      deps.signals?.progressReconciled({
        target: outcome.value.milestone,
        runCompleted: outcome.value.runCompleted,
      });
    return outcome;
  };
