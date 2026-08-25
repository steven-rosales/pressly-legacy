import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { ScheduleRevisionLifecycleDecision } from '../../../model/public.ts';
import {
  decideAcceptScheduleProposal,
  decideAcceptScheduleSnapshot,
  decideAcceptScheduleWindow,
} from './decide.ts';
import {
  acceptScheduleCasConflict,
  acceptScheduleIdempotencyConflict,
  acceptScheduleNotFound,
} from './failures.ts';
import type {
  AcceptScheduleCommand,
  AcceptScheduleExpectedFailure,
  AcceptSchedulePolicy,
  AcceptScheduleResult,
  ScheduleAcceptanceRecord,
} from './types.ts';

export type AcceptScheduleWorkEventCommand = Readonly<{
  operation: 'schedule_accepted';
  locationId: string;
  actorId: string;
  target: Readonly<{ entityType: 'schedule_run'; entityId: string }>;
  expectedVersion: null;
  payload: Readonly<{
    expectedOutputPlanHash: string;
    acknowledgedWarningCodes: readonly string[];
  }>;
}>;

export type AcceptScheduleReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: AcceptScheduleResult }>;

export type AcceptScheduleIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: AcceptScheduleWorkEventCommand,
  ) => AcceptScheduleReplay;
}>;

export type AcceptScheduleMutation =
  | Readonly<{ kind: 'accepted'; result: AcceptScheduleResult }>
  | Readonly<{ kind: 'conflict' }>;

export type AcceptScheduleTransactionRepository<StoredWorkEvent> = Readonly<{
  findWorkEvent: (idempotencyKey: string) => Promise<StoredWorkEvent | null>;
  lockLocationScheduling: (locationId: string) => Promise<void>;
  loadSchedule: (
    locationId: string,
    scheduleRunId: string,
  ) => Promise<ScheduleAcceptanceRecord | null>;
  productionRunExists: (
    locationId: string,
    productionShiftId: string,
  ) => Promise<boolean>;
  lockAndValidateScheduleInput: (
    locationId: string,
    record: ScheduleAcceptanceRecord,
  ) => Promise<boolean>;
  acceptSchedule: (input: {
    locationId: string;
    record: ScheduleAcceptanceRecord;
    actorId: string;
    acknowledgedWarningCodes: readonly string[];
    idempotencyKey: string;
    idempotency: AcceptScheduleWorkEventCommand;
    lifecycle: ScheduleRevisionLifecycleDecision;
    now: Date;
  }) => Promise<AcceptScheduleMutation>;
}>;

export type AcceptScheduleRepository<StoredWorkEvent> = Readonly<{
  transaction: (
    work: (
      repository: AcceptScheduleTransactionRepository<StoredWorkEvent>,
    ) => Promise<
      CellOutcome<AcceptScheduleResult, AcceptScheduleExpectedFailure>
    >,
  ) => Promise<
    CellOutcome<AcceptScheduleResult, AcceptScheduleExpectedFailure>
  >;
}>;

export type AcceptScheduleDependencies<StoredWorkEvent> = Readonly<{
  repo: AcceptScheduleRepository<StoredWorkEvent>;
  idempotency: AcceptScheduleIdempotency<StoredWorkEvent>;
  policy: AcceptSchedulePolicy;
  clock: Readonly<{ now: () => Date }>;
}>;

export type ExecuteAcceptSchedule = (
  command: AcceptScheduleCommand,
) => Promise<CellOutcome<AcceptScheduleResult, AcceptScheduleExpectedFailure>>;

const success = (
  value: AcceptScheduleResult,
): CellOutcome<AcceptScheduleResult, AcceptScheduleExpectedFailure> => ({
  kind: 'success',
  value,
});

const failure = (
  value: AcceptScheduleExpectedFailure,
): CellOutcome<AcceptScheduleResult, AcceptScheduleExpectedFailure> => ({
  kind: 'failure',
  failure: value,
});

const workEventCommand = (
  command: AcceptScheduleCommand,
): AcceptScheduleWorkEventCommand => ({
  operation: 'schedule_accepted',
  locationId: command.locationId,
  actorId: command.actorId,
  target: { entityType: 'schedule_run', entityId: command.scheduleRunId },
  expectedVersion: null,
  payload: {
    expectedOutputPlanHash: command.expectedOutputPlanHash,
    acknowledgedWarningCodes: [...command.acknowledgedWarningCodes],
  },
});

const replayOutcome = (
  replay: AcceptScheduleReplay,
): CellOutcome<AcceptScheduleResult, AcceptScheduleExpectedFailure> | null => {
  if (replay.kind === 'conflict')
    return failure(acceptScheduleIdempotencyConflict());
  if (replay.kind === 'replay') return success(replay.result);
  return null;
};

export const makeExecuteAcceptSchedule = <StoredWorkEvent>(
  deps: AcceptScheduleDependencies<StoredWorkEvent>,
): ExecuteAcceptSchedule => {
  return async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = workEventCommand(command);
        const beforeLockReplay = replayOutcome(
          deps.idempotency.resolveReplay(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          ),
        );
        if (beforeLockReplay !== null) return beforeLockReplay;

        await repo.lockLocationScheduling(command.locationId);
        const afterLockReplay = replayOutcome(
          deps.idempotency.resolveReplay(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          ),
        );
        if (afterLockReplay !== null) return afterLockReplay;

        const record = await repo.loadSchedule(
          command.locationId,
          command.scheduleRunId,
        );
        if (record === null) return failure(acceptScheduleNotFound());

        const now = deps.clock.now();
        const window = decideAcceptScheduleWindow({
          record,
          now,
          policy: deps.policy,
        });
        if (window.kind === 'reject') return failure(window.failure);

        const proposal = decideAcceptScheduleProposal({
          command,
          schedule: record.schedule,
          productionRunExists: await repo.productionRunExists(
            command.locationId,
            record.schedule.productionShiftId,
          ),
          policy: deps.policy,
        });
        if (proposal.kind === 'reject') return failure(proposal.failure);

        const snapshot = decideAcceptScheduleSnapshot({
          scheduleRunId: record.schedule.scheduleRunId,
          eligibleOrderSnapshotMatches: await repo.lockAndValidateScheduleInput(
            command.locationId,
            record,
          ),
          policy: deps.policy,
        });
        if (snapshot.kind === 'reject') return failure(snapshot.failure);

        const mutation = await repo.acceptSchedule({
          locationId: command.locationId,
          record,
          actorId: command.actorId,
          acknowledgedWarningCodes: command.acknowledgedWarningCodes,
          idempotencyKey: command.idempotencyKey,
          idempotency,
          lifecycle: proposal.lifecycle,
          now,
        });
        return mutation.kind === 'accepted'
          ? success(mutation.result)
          : failure(acceptScheduleCasConflict());
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'schedule_accept_failed',
          message: 'The schedule proposal could not be accepted.',
          safeMessage: 'The schedule proposal could not be accepted.',
          status: 503,
          cause,
        }),
      );
    }
  };
};
