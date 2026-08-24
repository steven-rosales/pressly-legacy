import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { IdSource } from '@pressly/cells/id-source';
import { decideCreateShift } from './decide.ts';
import { createShiftIdempotencyConflict } from './failures.ts';
import type {
  CreateShiftCommand,
  CreateShiftExpectedFailure,
  CreateShiftPolicy,
  ProductionShift,
} from './types.ts';

export type CreateShiftWorkEventCommand = Readonly<{
  operation: 'production_shift_created';
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: 'production_shift';
    entityId: null;
  }>;
  expectedVersion: null;
  payload: Readonly<{
    startsAt: string;
    endsAt: string;
    timezone: string;
    effectiveFolderCount: number;
  }>;
}>;

export type CreateShiftReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: ProductionShift }>;

export type CreateShiftIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: CreateShiftWorkEventCommand,
  ) => CreateShiftReplay;
}>;

export type CreateShiftWorkEventInput = Readonly<{
  locationId: string;
  eventType: 'production_shift_created';
  entityType: 'production_shift';
  entityId: string;
  actorId: string;
  idempotencyKey: string;
  payload: Readonly<{ startsAt: string; endsAt: string }>;
  idempotency: Readonly<{
    command: CreateShiftWorkEventCommand;
    result: ProductionShift;
  }>;
}>;

export type CreateShiftTransactionRepository<StoredWorkEvent> = Readonly<{
  findWorkEvent: (idempotencyKey: string) => Promise<StoredWorkEvent | null>;
  saveShift: (shift: ProductionShift) => Promise<void>;
  appendWorkEvent: (event: CreateShiftWorkEventInput) => Promise<void>;
}>;

export type CreateShiftRepository<StoredWorkEvent> = Readonly<{
  transaction: (
    work: (
      repository: CreateShiftTransactionRepository<StoredWorkEvent>,
    ) => Promise<CellOutcome<ProductionShift, CreateShiftExpectedFailure>>,
  ) => Promise<CellOutcome<ProductionShift, CreateShiftExpectedFailure>>;
}>;

export type CreateShiftDependencies<StoredWorkEvent> = Readonly<{
  repo: CreateShiftRepository<StoredWorkEvent>;
  idempotency: CreateShiftIdempotency<StoredWorkEvent>;
  policy: CreateShiftPolicy;
  ids: IdSource;
}>;

export type ExecuteCreateShift = (
  command: CreateShiftCommand,
) => Promise<CellOutcome<ProductionShift, CreateShiftExpectedFailure>>;

const success = (
  value: ProductionShift,
): CellOutcome<ProductionShift, CreateShiftExpectedFailure> => ({
  kind: 'success',
  value,
});

const failure = (
  value: CreateShiftExpectedFailure,
): CellOutcome<ProductionShift, CreateShiftExpectedFailure> => ({
  kind: 'failure',
  failure: value,
});

const workEventCommand = (
  command: CreateShiftCommand,
): CreateShiftWorkEventCommand => ({
  operation: 'production_shift_created',
  locationId: command.locationId,
  actorId: command.actorId,
  target: { entityType: 'production_shift', entityId: null },
  expectedVersion: null,
  payload: {
    startsAt: command.startsAt,
    endsAt: command.endsAt,
    timezone: command.timezone,
    effectiveFolderCount: command.effectiveFolderCount,
  },
});

export const makeExecuteCreateShift = <StoredWorkEvent>(
  deps: CreateShiftDependencies<StoredWorkEvent>,
): ExecuteCreateShift => {
  return async (command) => {
    const decision = decideCreateShift({ command, policy: deps.policy });
    if (decision.kind === 'reject') return failure(decision.failure);

    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = workEventCommand(command);
        const replay = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.kind === 'conflict')
          return failure(createShiftIdempotencyConflict());
        if (replay.kind === 'replay') return success(replay.result);

        const shift: ProductionShift = {
          id: deps.ids.next(),
          ...decision.shift,
        };
        await repo.saveShift(shift);
        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_shift_created',
          entityType: 'production_shift',
          entityId: shift.id,
          actorId: command.actorId,
          idempotencyKey: command.idempotencyKey,
          payload: { startsAt: shift.startsAt, endsAt: shift.endsAt },
          idempotency: { command: idempotency, result: shift },
        });
        return success(shift);
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_shift_create_failed',
          message: 'The production shift could not be created.',
          safeMessage: 'The production shift could not be created.',
          status: 503,
          cause,
        }),
      );
    }
  };
};
