import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  decideUpdateShiftEligibility,
  decideUpdateShiftState,
  decideUpdateShiftSupersession,
  validateUpdateShiftWindow,
} from './decide.ts';
import {
  updateShiftIdempotencyConflict,
  updateShiftLockedVersionConflict,
  updateShiftScheduleVersionConflict,
} from './failures.ts';
import type {
  ProductionShift,
  UpdateShiftChangedField,
  UpdateShiftCommand,
  UpdateShiftCurrentSchedule,
  UpdateShiftExpectedFailure,
  UpdateShiftPolicy,
  UpdateShiftResult,
  UpdateShiftSupersession,
} from './types.ts';

export type UpdateShiftWorkEventCommand = Readonly<{
  operation: 'production_shift_updated';
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: 'production_shift';
    entityId: string;
  }>;
  expectedVersion: number;
  payload: Readonly<{
    startsAt: string;
    endsAt: string;
    effectiveFolderCount: number;
  }>;
}>;

export type UpdateShiftReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: UpdateShiftResult }>;

export type UpdateShiftIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: UpdateShiftWorkEventCommand,
  ) => UpdateShiftReplay;
}>;

export type UpdateShiftWorkEventInput = Readonly<{
  locationId: string;
  eventType: 'production_shift_updated';
  entityType: 'production_shift';
  entityId: string;
  actorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  payload: Readonly<{
    changedFields: readonly UpdateShiftChangedField[];
    previous: Readonly<{
      startsAt: string;
      endsAt: string;
      effectiveFolderCount: number;
      version: number;
    }>;
    current: Readonly<{
      startsAt: string;
      endsAt: string;
      effectiveFolderCount: number;
      version: number;
    }>;
    supersededScheduleRunId: string | null;
  }>;
  idempotency: Readonly<{
    command: UpdateShiftWorkEventCommand;
    result: UpdateShiftResult;
  }>;
}>;

export type UpdateShiftScheduleCommit =
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'superseded'; scheduleRunId: string }>;

export type UpdateShiftTransactionRepository<StoredWorkEvent> = Readonly<{
  findWorkEvent: (key: string) => Promise<StoredWorkEvent | null>;
  lockLocationScheduling: (locationId: string) => Promise<void>;
  lockShift: (
    locationId: string,
    productionShiftId: string,
  ) => Promise<ProductionShift | null>;
  productionRunExists: (
    locationId: string,
    productionShiftId: string,
  ) => Promise<boolean>;
  updateShift: (input: {
    command: UpdateShiftCommand;
    now: Date;
  }) => Promise<ProductionShift | null>;
  lockCurrentSchedule: (
    locationId: string,
    productionShiftId: string,
  ) => Promise<UpdateShiftCurrentSchedule | null>;
  supersedeCurrentSchedule: (input: {
    locationId: string;
    supersession: UpdateShiftSupersession;
    now: Date;
  }) => Promise<UpdateShiftScheduleCommit>;
  appendWorkEvent: (event: UpdateShiftWorkEventInput) => Promise<void>;
}>;

export type UpdateShiftRepository<StoredWorkEvent> = Readonly<{
  transaction: (
    work: (
      repository: UpdateShiftTransactionRepository<StoredWorkEvent>,
    ) => Promise<CellOutcome<UpdateShiftResult, UpdateShiftExpectedFailure>>,
  ) => Promise<CellOutcome<UpdateShiftResult, UpdateShiftExpectedFailure>>;
}>;

export type UpdateShiftSignals = Readonly<{
  planSuperseded: () => void;
}>;

export type UpdateShiftDependencies<StoredWorkEvent> = Readonly<{
  repo: UpdateShiftRepository<StoredWorkEvent>;
  idempotency: UpdateShiftIdempotency<StoredWorkEvent>;
  policy: UpdateShiftPolicy;
  clock: Readonly<{ now: () => Date }>;
  signals?: UpdateShiftSignals;
}>;

export type ExecuteUpdateShift = (
  command: UpdateShiftCommand,
) => Promise<CellOutcome<UpdateShiftResult, UpdateShiftExpectedFailure>>;

const success = (value: UpdateShiftResult) =>
  ({ kind: 'success', value }) as const;
const failure = (value: UpdateShiftExpectedFailure) =>
  ({ kind: 'failure', failure: value }) as const;

const commandEnvelope = (
  command: UpdateShiftCommand,
): UpdateShiftWorkEventCommand => ({
  operation: 'production_shift_updated',
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: 'production_shift',
    entityId: command.productionShiftId,
  },
  expectedVersion: command.expectedVersion,
  payload: {
    startsAt: command.startsAt,
    endsAt: command.endsAt,
    effectiveFolderCount: command.effectiveFolderCount,
  },
});

export const makeExecuteUpdateShift = <StoredWorkEvent>(
  deps: UpdateShiftDependencies<StoredWorkEvent>,
): ExecuteUpdateShift => {
  return async (command) => {
    const windowFailure = validateUpdateShiftWindow(command);
    if (windowFailure !== null) return failure(windowFailure);

    let outcome: CellOutcome<UpdateShiftResult, UpdateShiftExpectedFailure>;
    try {
      outcome = await deps.repo.transaction(async (repo) => {
        const envelope = commandEnvelope(command);
        const replayBefore = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          envelope,
        );
        if (replayBefore.kind === 'conflict')
          return failure(updateShiftIdempotencyConflict());
        if (replayBefore.kind === 'replay') return success(replayBefore.result);

        await repo.lockLocationScheduling(command.locationId);
        const replayAfter = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          envelope,
        );
        if (replayAfter.kind === 'conflict')
          return failure(updateShiftIdempotencyConflict());
        if (replayAfter.kind === 'replay') return success(replayAfter.result);

        const current = await repo.lockShift(
          command.locationId,
          command.productionShiftId,
        );
        const stateDecision = decideUpdateShiftState({ command, current });
        if (stateDecision.kind === 'reject')
          return failure(stateDecision.failure);
        const productionRunExists = await repo.productionRunExists(
          command.locationId,
          command.productionShiftId,
        );
        const eligibility = decideUpdateShiftEligibility({
          command,
          current: stateDecision.current,
          productionRunExists,
        });
        if (eligibility.kind === 'reject') return failure(eligibility.failure);

        const now = deps.clock.now();
        const currentShift = stateDecision.current;
        let productionShift = currentShift;
        let supersededScheduleRunId: string | null = null;

        if (eligibility.changedFields.length > 0) {
          const updated = await repo.updateShift({ command, now });
          if (updated === null)
            return failure(updateShiftLockedVersionConflict());
          productionShift = updated;

          const supersessionDecision = decideUpdateShiftSupersession({
            currentSchedule: await repo.lockCurrentSchedule(
              command.locationId,
              command.productionShiftId,
            ),
            policy: deps.policy,
          });
          if (supersessionDecision.kind === 'reject')
            return failure(supersessionDecision.failure);
          if (supersessionDecision.supersession !== null) {
            const committed = await repo.supersedeCurrentSchedule({
              locationId: command.locationId,
              supersession: supersessionDecision.supersession,
              now,
            });
            if (committed.kind === 'conflict')
              return failure(updateShiftScheduleVersionConflict());
            supersededScheduleRunId = committed.scheduleRunId;
          }
        }

        const result: UpdateShiftResult = {
          productionShift,
          supersededScheduleRunId,
          replayed: false,
        };
        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_shift_updated',
          entityType: 'production_shift',
          entityId: command.productionShiftId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            changedFields: eligibility.changedFields,
            previous: {
              startsAt: currentShift.startsAt,
              endsAt: currentShift.endsAt,
              effectiveFolderCount: currentShift.effectiveFolderCount,
              version: currentShift.version,
            },
            current: {
              startsAt: productionShift.startsAt,
              endsAt: productionShift.endsAt,
              effectiveFolderCount: productionShift.effectiveFolderCount,
              version: productionShift.version,
            },
            supersededScheduleRunId,
          },
          idempotency: { command: envelope, result },
        });
        return success(result);
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_shift_update_failed',
          message: 'The production shift could not be updated.',
          safeMessage: 'The production shift could not be updated.',
          status: 503,
          cause,
        }),
      );
    }

    if (
      outcome.kind === 'success' &&
      !outcome.value.replayed &&
      outcome.value.supersededScheduleRunId !== null
    )
      deps.signals?.planSuperseded();
    return outcome;
  };
};
