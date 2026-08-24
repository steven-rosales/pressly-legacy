import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  decideScheduleRecord,
  decideStartSchedule,
  decideStartWindow,
} from './decide.ts';
import {
  idempotencyConflict,
  orderVersionConflict,
  shiftNotFound,
} from './failures.ts';
import type {
  ScheduleStartRecord,
  StartScheduleCommand,
  StartScheduleDecision,
  StartScheduleExpectedFailure,
  StartScheduleOrder,
  StartSchedulePolicy,
  StartScheduleResult,
} from './types.ts';

export type StartScheduleWorkEventCommand = Readonly<{
  operation: 'production_run_started';
  locationId: string;
  actorId: string;
  target: Readonly<{ entityType: 'schedule_run'; entityId: string }>;
  expectedVersion: null;
  payload: Readonly<{ expectedOutputPlanHash: string }>;
}>;

export type StartScheduleReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: StartScheduleResult }>;

export type StartScheduleIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: StartScheduleWorkEventCommand,
  ) => StartScheduleReplay;
}>;

export type StartScheduleWorkEventInput = Readonly<{
  locationId: string;
  eventType: 'production_run_started';
  entityType: 'production_run';
  entityId: string;
  actorId: string;
  idempotencyKey: string;
  payload: Readonly<{
    scheduleRunId: string;
    productionRunId: string;
    productionBatchIds: readonly string[];
    queueVersion: 1;
  }>;
  idempotency: Readonly<{
    command: StartScheduleWorkEventCommand;
    result: StartScheduleResult;
  }>;
}>;

export type StartScheduleCommitOutcome =
  | Readonly<{ kind: 'started'; result: StartScheduleResult }>
  | Readonly<{ kind: 'order_conflict' }>;

export type StartScheduleTransactionRepository<StoredWorkEvent> = Readonly<{
  findWorkEvent: (idempotencyKey: string) => Promise<StoredWorkEvent | null>;
  lockLocationScheduling: (locationId: string) => Promise<void>;
  loadSchedule: (
    locationId: string,
    scheduleRunId: string,
  ) => Promise<ScheduleStartRecord | null>;
  lockShiftForStart: (
    locationId: string,
    productionShiftId: string,
  ) => Promise<boolean>;
  productionRunExists: (
    locationId: string,
    productionShiftId: string,
  ) => Promise<boolean>;
  lockAndLoadStartOrders: (
    locationId: string,
    record: ScheduleStartRecord,
  ) => Promise<readonly StartScheduleOrder[] | null>;
  commitStart: (input: {
    locationId: string;
    record: ScheduleStartRecord;
    actorId: string;
    decision: StartScheduleDecision;
    idempotencyKey: string;
    idempotency: StartScheduleWorkEventCommand;
    now: Date;
  }) => Promise<StartScheduleCommitOutcome>;
}>;

export type StartScheduleRepository<StoredWorkEvent> = Readonly<{
  transaction: (
    work: (
      repository: StartScheduleTransactionRepository<StoredWorkEvent>,
    ) => Promise<
      CellOutcome<StartScheduleResult, StartScheduleExpectedFailure>
    >,
  ) => Promise<CellOutcome<StartScheduleResult, StartScheduleExpectedFailure>>;
}>;

export type StartScheduleDependencies<StoredWorkEvent> = Readonly<{
  repo: StartScheduleRepository<StoredWorkEvent>;
  idempotency: StartScheduleIdempotency<StoredWorkEvent>;
  policy: StartSchedulePolicy;
  clock: Readonly<{ now: () => Date }>;
  signals?: Readonly<{ runStarted: () => void }>;
}>;

export type ExecuteStartSchedule = (
  command: StartScheduleCommand,
) => Promise<CellOutcome<StartScheduleResult, StartScheduleExpectedFailure>>;

const success = (
  value: StartScheduleResult,
): CellOutcome<StartScheduleResult, StartScheduleExpectedFailure> => ({
  kind: 'success',
  value,
});

const failure = (
  value: StartScheduleExpectedFailure,
): CellOutcome<StartScheduleResult, StartScheduleExpectedFailure> => ({
  kind: 'failure',
  failure: value,
});

const envelope = (
  command: StartScheduleCommand,
): StartScheduleWorkEventCommand => ({
  operation: 'production_run_started',
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: 'schedule_run',
    entityId: command.scheduleRunId,
  },
  expectedVersion: null,
  payload: { expectedOutputPlanHash: command.expectedOutputPlanHash },
});

const replayOutcome = (
  replay: StartScheduleReplay,
): CellOutcome<StartScheduleResult, StartScheduleExpectedFailure> | null => {
  if (replay.kind === 'conflict') return failure(idempotencyConflict());
  if (replay.kind === 'replay') return success(replay.result);
  return null;
};

export const makeExecuteStartSchedule =
  <StoredWorkEvent>(
    deps: StartScheduleDependencies<StoredWorkEvent>,
  ): ExecuteStartSchedule =>
  async (command) => {
    let outcome: CellOutcome<StartScheduleResult, StartScheduleExpectedFailure>;
    try {
      outcome = await deps.repo.transaction(async (repo) => {
        const identity = envelope(command);
        const before = replayOutcome(
          deps.idempotency.resolveReplay(
            await repo.findWorkEvent(command.idempotencyKey),
            identity,
          ),
        );
        if (before !== null) return before;

        await repo.lockLocationScheduling(command.locationId);
        const after = replayOutcome(
          deps.idempotency.resolveReplay(
            await repo.findWorkEvent(command.idempotencyKey),
            identity,
          ),
        );
        if (after !== null) return after;

        const scheduleDecision = decideScheduleRecord({
          record: await repo.loadSchedule(
            command.locationId,
            command.scheduleRunId,
          ),
          expectedOutputPlanHash: command.expectedOutputPlanHash,
        });
        if (scheduleDecision.kind === 'reject')
          return failure(scheduleDecision.failure);

        const record = scheduleDecision.record;
        if (
          !(await repo.lockShiftForStart(
            command.locationId,
            record.schedule.productionShiftId,
          ))
        )
          return failure(shiftNotFound());

        const now = deps.clock.now();
        const windowFailure = decideStartWindow({
          record,
          now,
          policy: deps.policy,
        });
        if (windowFailure !== null) return failure(windowFailure);

        const productionRunExists = await repo.productionRunExists(
          command.locationId,
          record.schedule.productionShiftId,
        );
        const lockedOrders = await repo.lockAndLoadStartOrders(
          command.locationId,
          record,
        );
        const startDecision = decideStartSchedule({
          record,
          lockedOrders,
          productionRunExists,
          policy: deps.policy,
        });
        if (startDecision.kind === 'reject')
          return failure(startDecision.failure);

        const committed = await repo.commitStart({
          locationId: command.locationId,
          record,
          actorId: command.actorId,
          decision: startDecision.decision,
          idempotencyKey: command.idempotencyKey,
          idempotency: identity,
          now,
        });
        if (committed.kind === 'order_conflict')
          return failure(orderVersionConflict());
        return success(committed.result);
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_run_start_failed',
          message: 'Production could not start from the accepted schedule.',
          safeMessage: 'Production could not start from the accepted schedule.',
          status: 503,
          cause,
        }),
      );
    }

    if (outcome.kind === 'success' && !outcome.value.replayed)
      deps.signals?.runStarted();
    return outcome;
  };
