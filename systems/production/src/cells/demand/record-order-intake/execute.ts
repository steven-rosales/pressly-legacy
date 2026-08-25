import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { decideRecordOrderIntake } from './decide.ts';
import type {
  RecordOrderIntakeCommand,
  RecordOrderIntakeExpectedFailure,
  RecordOrderIntakeFacts,
  RecordOrderIntakePolicy,
  RecordOrderIntakeResult,
} from './types.ts';

export type RecordOrderIntakeWorkEventCommand = Readonly<{
  operation: 'production_order_intake_recorded';
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: 'production_order';
    entityId: string;
  }>;
  expectedVersion: number;
  payload: Readonly<{ bagCount: number }>;
}>;

export type RecordOrderIntakeReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: RecordOrderIntakeResult }>;

export type RecordOrderIntakeIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: RecordOrderIntakeWorkEventCommand,
  ) => RecordOrderIntakeReplay;
}>;

export type RecordOrderIntakeWorkEventInput = Readonly<{
  locationId: string;
  eventType: 'production_order_intake_recorded';
  entityType: 'production_order';
  entityId: string;
  actorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  payload: Readonly<{
    bagCount: number;
    bagCountProvenance: 'operator_intake';
    intakeVersion: number;
    version: number;
  }>;
  idempotency: Readonly<{
    command: RecordOrderIntakeWorkEventCommand;
    result: RecordOrderIntakeResult;
  }>;
}>;

export type RecordOrderIntakeTransactionRepository<StoredWorkEvent> = Readonly<{
  findWorkEvent: (idempotencyKey: string) => Promise<StoredWorkEvent | null>;
  lockLocationScheduling: (locationId: string) => Promise<void>;
  lockOrder: (
    locationId: string,
    productionOrderId: string,
  ) => Promise<RecordOrderIntakeFacts | null>;
  recordIntake: (input: {
    locationId: string;
    productionOrderId: string;
    bagCount: number;
    expectedVersion: number;
    currentIntakeVersion: number;
    nextStatus: 'release_pending' | 'eligible';
    now: Date;
  }) => Promise<RecordOrderIntakeResult | null>;
  appendWorkEvent: (event: RecordOrderIntakeWorkEventInput) => Promise<void>;
}>;

export type RecordOrderIntakeRepository<StoredWorkEvent> = Readonly<{
  transaction: (
    work: (
      repository: RecordOrderIntakeTransactionRepository<StoredWorkEvent>,
    ) => Promise<
      CellOutcome<RecordOrderIntakeResult, RecordOrderIntakeExpectedFailure>
    >,
  ) => Promise<
    CellOutcome<RecordOrderIntakeResult, RecordOrderIntakeExpectedFailure>
  >;
}>;

export type RecordOrderIntakeDependencies<StoredWorkEvent> = Readonly<{
  repo: RecordOrderIntakeRepository<StoredWorkEvent>;
  idempotency: RecordOrderIntakeIdempotency<StoredWorkEvent>;
  policy: RecordOrderIntakePolicy;
  clock: Readonly<{ now: () => Date }>;
}>;

export type ExecuteRecordOrderIntake = (
  command: RecordOrderIntakeCommand,
) => Promise<
  CellOutcome<RecordOrderIntakeResult, RecordOrderIntakeExpectedFailure>
>;

const success = (
  value: RecordOrderIntakeResult,
): CellOutcome<RecordOrderIntakeResult, RecordOrderIntakeExpectedFailure> => ({
  kind: 'success',
  value,
});

const failure = (
  value: RecordOrderIntakeExpectedFailure,
): CellOutcome<RecordOrderIntakeResult, RecordOrderIntakeExpectedFailure> => ({
  kind: 'failure',
  failure: value,
});

const idempotencyConflict = (): RecordOrderIntakeExpectedFailure => ({
  kind: 'conflict',
  code: 'production_idempotency_conflict',
  message: 'The idempotency key belongs to a different production command.',
  safeMessage: 'The idempotency key belongs to a different production command.',
});

const versionConflict = (): RecordOrderIntakeExpectedFailure => ({
  kind: 'conflict',
  code: 'production_order_version_conflict',
  message: 'The production order changed before intake was recorded.',
  safeMessage: 'The production order changed before intake was recorded.',
});

const eventCommand = (
  command: RecordOrderIntakeCommand,
): RecordOrderIntakeWorkEventCommand => ({
  operation: 'production_order_intake_recorded',
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: 'production_order',
    entityId: command.productionOrderId,
  },
  expectedVersion: command.expectedVersion,
  payload: { bagCount: command.bagCount },
});

export const makeExecuteRecordOrderIntake =
  <StoredWorkEvent>(
    deps: RecordOrderIntakeDependencies<StoredWorkEvent>,
  ): ExecuteRecordOrderIntake =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = eventCommand(command);
        const replay = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.kind === 'conflict') return failure(idempotencyConflict());
        if (replay.kind === 'replay') return success(replay.result);

        await repo.lockLocationScheduling(command.locationId);
        const lockedReplay = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (lockedReplay.kind === 'conflict')
          return failure(idempotencyConflict());
        if (lockedReplay.kind === 'replay') return success(lockedReplay.result);

        const facts = await repo.lockOrder(
          command.locationId,
          command.productionOrderId,
        );
        const decision = decideRecordOrderIntake({
          command,
          facts,
          policy: deps.policy,
        });
        if (decision.kind === 'reject') return failure(decision.failure);
        if (facts === null)
          return failure({
            kind: 'not_found',
            code: 'production_order_not_found',
            message: 'The production order was not found.',
            safeMessage: 'The production order was not found.',
          });

        const mutation = await repo.recordIntake({
          locationId: command.locationId,
          productionOrderId: command.productionOrderId,
          bagCount: command.bagCount,
          expectedVersion: command.expectedVersion,
          currentIntakeVersion: facts.intakeVersion,
          nextStatus: decision.nextStatus,
          now: deps.clock.now(),
        });
        if (mutation === null) return failure(versionConflict());

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_order_intake_recorded',
          entityType: 'production_order',
          entityId: command.productionOrderId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            bagCount: mutation.bagCount,
            bagCountProvenance: mutation.bagCountProvenance,
            intakeVersion: mutation.intakeVersion,
            version: mutation.version,
          },
          idempotency: { command: idempotency, result: mutation },
        });
        return success(mutation);
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_intake_failed',
          message: 'Bag intake could not be recorded.',
          safeMessage: 'Bag intake could not be recorded.',
          status: 503,
          cause,
        }),
      );
    }
  };
