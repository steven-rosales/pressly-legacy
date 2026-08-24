import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import {
  databaseError,
  invariantViolationError,
} from '@pressly/errors/factories';
import { decideAdvanceStage } from './decide.ts';
import type {
  AdvanceStageCommand,
  AdvanceStageCommitPlan,
  AdvanceStageExpectedFailure,
  AdvanceStageFacts,
  AdvanceStageMutationResult,
  AdvanceStagePolicy,
  AdvanceStageResult,
  AdvanceStageTimingConfirmation,
} from './types.ts';

type AdvanceStageEventType = 'stage_started' | 'stage_completed';

type AdvanceStageIdempotencyPayload =
  | Readonly<{
      transition: 'start';
      confirmation?: AdvanceStageTimingConfirmation;
    }>
  | Readonly<{
      transition: 'complete';
      confirmation: AdvanceStageTimingConfirmation | null;
    }>;

export type AdvanceStageWorkEventCommand = Readonly<{
  operation: AdvanceStageEventType;
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: 'stage_run';
    entityId: string;
  }>;
  expectedVersion: number;
  payload: AdvanceStageIdempotencyPayload;
}>;

export type AdvanceStageReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: AdvanceStageResult }>;

export type AdvanceStageIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: AdvanceStageWorkEventCommand,
  ) => AdvanceStageReplay;
}>;

export type AdvanceStageTransitionInput = Readonly<{
  locationId: string;
  stageRunId: string;
  expectedVersion: number;
  stageLifecycle: AdvanceStageCommitPlan['stageLifecycle'];
  batchId: string;
  batchExpectedVersion: number;
  batchState: AdvanceStageCommitPlan['batchState'];
  batchLifecycle: AdvanceStageCommitPlan['batchLifecycle'];
  freezeMembership: boolean;
  attemptLifecycles: AdvanceStageCommitPlan['attemptLifecycles'];
  terminalLifecycle: AdvanceStageCommitPlan['terminalLifecycle'];
  actorId: string;
  now: Date;
}>;

export type AdvanceStageWorkEventInput = Readonly<{
  locationId: string;
  eventType: AdvanceStageEventType;
  entityType: 'stage_run';
  entityId: string;
  actorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  payload: Readonly<{ version: number } & AdvanceStageCommitPlan['audit']>;
  idempotency: Readonly<{
    command: AdvanceStageWorkEventCommand;
    result: AdvanceStageMutationResult;
  }>;
}>;

export type AdvanceStageTransactionRepository<StoredWorkEvent> = Readonly<{
  findWorkEvent: (idempotencyKey: string) => Promise<StoredWorkEvent | null>;
  loadStageTransitionFacts: (
    locationId: string,
    stageRunId: string,
    now: Date,
  ) => Promise<AdvanceStageFacts | null>;
  transitionStage: (
    input: AdvanceStageTransitionInput,
  ) => Promise<
    CellOutcome<AdvanceStageMutationResult, AdvanceStageExpectedFailure>
  >;
  appendWorkEvent: (event: AdvanceStageWorkEventInput) => Promise<void>;
}>;

export type AdvanceStageRepository<StoredWorkEvent> = Readonly<{
  /** A returned failure must roll back the transaction, just like a throw. */
  transaction: (
    work: (
      repository: AdvanceStageTransactionRepository<StoredWorkEvent>,
    ) => Promise<CellOutcome<AdvanceStageResult, AdvanceStageExpectedFailure>>,
  ) => Promise<CellOutcome<AdvanceStageResult, AdvanceStageExpectedFailure>>;
}>;

export type AdvanceStageClock = Readonly<{ now: () => Date }>;

export type AdvanceStageSignals = Readonly<{
  batchFrozen: (input: Readonly<{ source: 'stage_start' }>) => void;
}>;

export type AdvanceStageDependencies<StoredWorkEvent> = Readonly<{
  repo: AdvanceStageRepository<StoredWorkEvent>;
  idempotency: AdvanceStageIdempotency<StoredWorkEvent>;
  policy: AdvanceStagePolicy;
  clock: AdvanceStageClock;
  signals?: AdvanceStageSignals;
}>;

export type ExecuteAdvanceStage = (
  command: AdvanceStageCommand,
) => Promise<CellOutcome<AdvanceStageResult, AdvanceStageExpectedFailure>>;

const success = (
  value: AdvanceStageResult,
): CellOutcome<AdvanceStageResult, AdvanceStageExpectedFailure> => ({
  kind: 'success',
  value,
});

const failure = (
  value: AdvanceStageExpectedFailure,
): CellOutcome<AdvanceStageResult, AdvanceStageExpectedFailure> => ({
  kind: 'failure',
  failure: value,
});

const idempotencyConflict = (): AdvanceStageExpectedFailure => ({
  kind: 'conflict',
  code: 'production_idempotency_conflict',
  message: 'The idempotency key belongs to a different production command.',
  safeMessage: 'The idempotency key belongs to a different production command.',
});

const workEventCommand = (
  command: AdvanceStageCommand,
): AdvanceStageWorkEventCommand => ({
  operation:
    command.transition === 'start' ? 'stage_started' : 'stage_completed',
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: 'stage_run',
    entityId: command.stageRunId,
  },
  expectedVersion: command.expectedVersion,
  payload:
    command.transition === 'complete'
      ? {
          transition: command.transition,
          confirmation: command.confirmation ?? null,
        }
      : {
          transition: command.transition,
          ...(command.confirmation === undefined
            ? {}
            : { confirmation: command.confirmation }),
        },
});

const replayOutcome = (
  replay: AdvanceStageReplay,
): CellOutcome<AdvanceStageResult, AdvanceStageExpectedFailure> | null => {
  if (replay.kind === 'conflict') return failure(idempotencyConflict());
  if (replay.kind === 'replay') return success(replay.result);
  return null;
};

export const makeExecuteAdvanceStage =
  <StoredWorkEvent>(
    deps: AdvanceStageDependencies<StoredWorkEvent>,
  ): ExecuteAdvanceStage =>
  async (command) => {
    let implicitlyFrozeMembership = false;
    try {
      const outcome = await deps.repo.transaction(async (repo) => {
        const idempotency = workEventCommand(command);
        const beforeLock = replayOutcome(
          deps.idempotency.resolveReplay(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          ),
        );
        if (beforeLock !== null) return beforeLock;

        const now = deps.clock.now();
        const facts = await repo.loadStageTransitionFacts(
          command.locationId,
          command.stageRunId,
          now,
        );
        const afterLock = replayOutcome(
          deps.idempotency.resolveReplay(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          ),
        );
        if (afterLock !== null) return afterLock;

        const decision = decideAdvanceStage({
          facts,
          command,
          now,
          policy: deps.policy,
        });
        if (decision.kind === 'reject') {
          if (decision.rejection.kind === 'invariant')
            throw invariantViolationError(decision.rejection.failure);
          return failure(decision.rejection.failure);
        }
        if (decision.kind === 'confirmation') return success(decision.result);

        const plan = decision.plan;
        implicitlyFrozeMembership = plan.freezeMembership;
        const transition = await repo.transitionStage({
          locationId: command.locationId,
          stageRunId: command.stageRunId,
          expectedVersion: command.expectedVersion,
          stageLifecycle: plan.stageLifecycle,
          batchId: plan.batchId,
          batchExpectedVersion: plan.batchExpectedVersion,
          batchState: plan.batchState,
          batchLifecycle: plan.batchLifecycle,
          freezeMembership: plan.freezeMembership,
          attemptLifecycles: plan.attemptLifecycles,
          terminalLifecycle: plan.terminalLifecycle,
          actorId: command.actorId,
          now,
        });
        if (transition.kind === 'failure') return transition;
        const mutation = transition.value;

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: plan.eventType,
          entityType: 'stage_run',
          entityId: command.stageRunId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: { version: mutation.version, ...plan.audit },
          idempotency: { command: idempotency, result: mutation },
        });
        return success(mutation);
      });

      if (
        outcome.kind === 'success' &&
        !outcome.value.replayed &&
        implicitlyFrozeMembership
      )
        deps.signals?.batchFrozen({ source: 'stage_start' });
      return outcome;
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'stage_transition_failed',
          message: 'The production stage could not be advanced.',
          safeMessage: 'The production stage could not be advanced.',
          status: 503,
          cause,
        }),
      );
    }
  };
