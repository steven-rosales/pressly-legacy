import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { StageTransitionContext } from '../../../model/stage-context.ts';
import { decideAssignStageMachines } from './decide.ts';
import type {
  AssignStageMachinesCommand,
  AssignStageMachinesExpectedFailure,
  AssignStageMachinesPolicy,
  AssignStageMachinesResult,
} from './types.ts';

export type AssignStageMachinesWorkEventCommand = Readonly<{
  operation: 'machine_assigned';
  locationId: string;
  actorId: string;
  target: Readonly<{ entityType: 'stage_run'; entityId: string }>;
  expectedVersion: number;
  payload: Readonly<{ machineIds: readonly string[] }>;
}>;

export type AssignStageMachinesReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: AssignStageMachinesResult }>;

export type AssignStageMachinesIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: AssignStageMachinesWorkEventCommand,
  ) => AssignStageMachinesReplay;
}>;

export type AssignStageMachinesWorkEventInput = Readonly<{
  locationId: string;
  eventType: 'machine_assigned';
  entityType: 'stage_run';
  entityId: string;
  actorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  payload: Readonly<{ machineIds: readonly string[]; version: number }>;
  idempotency: Readonly<{
    command: AssignStageMachinesWorkEventCommand;
    result: AssignStageMachinesResult;
  }>;
}>;

export type AssignStageMachinesTransactionRepository<StoredWorkEvent> =
  Readonly<{
    findWorkEvent: (idempotencyKey: string) => Promise<StoredWorkEvent | null>;
    loadStageTransitionContext: (
      locationId: string,
      stageRunId: string,
      now: Date,
    ) => Promise<StageTransitionContext | null>;
    assignStageMachines: (input: {
      locationId: string;
      stageRunId: string;
      expectedVersion: number;
      machineIds: readonly string[];
      now: Date;
    }) => Promise<AssignStageMachinesResult | null>;
    appendWorkEvent: (
      event: AssignStageMachinesWorkEventInput,
    ) => Promise<void>;
  }>;

export type AssignStageMachinesRepository<StoredWorkEvent> = Readonly<{
  transaction: (
    work: (
      repository: AssignStageMachinesTransactionRepository<StoredWorkEvent>,
    ) => Promise<
      CellOutcome<AssignStageMachinesResult, AssignStageMachinesExpectedFailure>
    >,
  ) => Promise<
    CellOutcome<AssignStageMachinesResult, AssignStageMachinesExpectedFailure>
  >;
}>;

export type AssignStageMachinesDependencies<StoredWorkEvent> = Readonly<{
  repo: AssignStageMachinesRepository<StoredWorkEvent>;
  idempotency: AssignStageMachinesIdempotency<StoredWorkEvent>;
  policy: AssignStageMachinesPolicy;
  clock: Readonly<{ now: () => Date }>;
}>;

export type ExecuteAssignStageMachines = (
  command: AssignStageMachinesCommand,
) => Promise<
  CellOutcome<AssignStageMachinesResult, AssignStageMachinesExpectedFailure>
>;

const success = (
  value: AssignStageMachinesResult,
): CellOutcome<
  AssignStageMachinesResult,
  AssignStageMachinesExpectedFailure
> => ({ kind: 'success', value });

const failure = (
  value: AssignStageMachinesExpectedFailure,
): CellOutcome<
  AssignStageMachinesResult,
  AssignStageMachinesExpectedFailure
> => ({ kind: 'failure', failure: value });

const idempotencyConflict = (): AssignStageMachinesExpectedFailure => ({
  kind: 'conflict',
  code: 'production_idempotency_conflict',
  message: 'The idempotency key belongs to a different production command.',
  safeMessage: 'The idempotency key belongs to a different production command.',
});

const versionConflict = (): AssignStageMachinesExpectedFailure => ({
  kind: 'conflict',
  code: 'stage_run_version_conflict',
  message: 'The production stage changed before assignment.',
  safeMessage: 'The production stage changed before assignment.',
});

const workEventCommand = (
  command: AssignStageMachinesCommand,
): AssignStageMachinesWorkEventCommand => ({
  operation: 'machine_assigned',
  locationId: command.locationId,
  actorId: command.actorId,
  target: { entityType: 'stage_run', entityId: command.stageRunId },
  expectedVersion: command.expectedVersion,
  payload: { machineIds: [...command.machineIds] },
});

export const makeExecuteAssignStageMachines =
  <StoredWorkEvent>(
    deps: AssignStageMachinesDependencies<StoredWorkEvent>,
  ): ExecuteAssignStageMachines =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = workEventCommand(command);
        const replay = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.kind === 'conflict') return failure(idempotencyConflict());
        if (replay.kind === 'replay') return success(replay.result);

        const facts = await repo.loadStageTransitionContext(
          command.locationId,
          command.stageRunId,
          deps.clock.now(),
        );
        const lockedReplay = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (lockedReplay.kind === 'conflict')
          return failure(idempotencyConflict());
        if (lockedReplay.kind === 'replay') return success(lockedReplay.result);

        const decision = decideAssignStageMachines({
          command,
          facts,
          policy: deps.policy,
        });
        if (decision.kind === 'reject') return failure(decision.failure);

        const mutation = await repo.assignStageMachines({
          locationId: command.locationId,
          stageRunId: command.stageRunId,
          expectedVersion: command.expectedVersion,
          machineIds: decision.machineIds,
          now: deps.clock.now(),
        });
        if (mutation === null) return failure(versionConflict());

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'machine_assigned',
          entityType: 'stage_run',
          entityId: command.stageRunId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            machineIds: [...decision.machineIds],
            version: mutation.version,
          },
          idempotency: { command: idempotency, result: mutation },
        });
        return success(mutation);
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'machine_assignment_failed',
          message: 'Machines could not be assigned to the stage.',
          safeMessage: 'Machines could not be assigned to the stage.',
          status: 503,
          cause,
        }),
      );
    }
  };
