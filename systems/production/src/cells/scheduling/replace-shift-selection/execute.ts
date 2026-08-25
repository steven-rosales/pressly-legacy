import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  canonicalizeSelectedOrderIds,
  decideShiftSelectionAccess,
  decideShiftSelectionChange,
} from './decide.ts';
import {
  replaceShiftSelectionIdempotencyConflict,
  replaceShiftSelectionScheduleVersionConflict,
  replaceShiftSelectionVersionConflict,
} from './failures.ts';
import type {
  LockedShiftSelection,
  ReplaceShiftSelectionCommand,
  ReplaceShiftSelectionExpectedFailure,
  ReplaceShiftSelectionPolicy,
  ReplaceShiftSelectionResult,
  ShiftSelectionSupersession,
} from './types.ts';

export type ReplaceShiftSelectionWorkEventCommand = Readonly<{
  operation: 'production_shift_selection_replaced';
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: 'production_shift';
    entityId: string;
  }>;
  expectedVersion: number;
  payload: Readonly<{ selectedOrderIds: readonly string[] }>;
}>;

export type ReplaceShiftSelectionReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: ReplaceShiftSelectionResult }>;

export type ReplaceShiftSelectionIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: ReplaceShiftSelectionWorkEventCommand,
  ) => ReplaceShiftSelectionReplay;
}>;

export type ReplaceShiftSelectionWorkEventInput = Readonly<{
  locationId: string;
  eventType: 'production_shift_selection_replaced';
  entityType: 'production_shift';
  entityId: string;
  actorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  payload: Readonly<{
    selectedOrderIds: readonly string[];
    version: number;
    supersededScheduleRunId: string | null;
  }>;
  idempotency: Readonly<{
    command: ReplaceShiftSelectionWorkEventCommand;
    result: ReplaceShiftSelectionResult;
  }>;
}>;

export type ReplaceShiftSelectionMutation =
  | Readonly<{ kind: 'saved'; result: ReplaceShiftSelectionResult }>
  | Readonly<{ kind: 'selection_conflict' }>
  | Readonly<{ kind: 'schedule_conflict' }>;

export type ReplaceShiftSelectionTransactionRepository<StoredWorkEvent> =
  Readonly<{
    findWorkEvent: (idempotencyKey: string) => Promise<StoredWorkEvent | null>;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    lockSelection: (
      locationId: string,
      productionShiftId: string,
    ) => Promise<LockedShiftSelection>;
    selectedOrdersAreReady: (
      locationId: string,
      productionOrderIds: readonly string[],
    ) => Promise<boolean>;
    replaceSelection: (input: {
      locationId: string;
      productionShiftId: string;
      selectedOrderIds: readonly string[];
      currentVersion: number;
      supersede: ShiftSelectionSupersession | null;
      actorId: string;
      now: Date;
    }) => Promise<ReplaceShiftSelectionMutation>;
    appendWorkEvent: (
      event: ReplaceShiftSelectionWorkEventInput,
    ) => Promise<void>;
  }>;

export type ReplaceShiftSelectionRepository<StoredWorkEvent> = Readonly<{
  transaction: (
    work: (
      repository: ReplaceShiftSelectionTransactionRepository<StoredWorkEvent>,
    ) => Promise<
      CellOutcome<
        ReplaceShiftSelectionResult,
        ReplaceShiftSelectionExpectedFailure
      >
    >,
  ) => Promise<
    CellOutcome<
      ReplaceShiftSelectionResult,
      ReplaceShiftSelectionExpectedFailure
    >
  >;
}>;

export type ReplaceShiftSelectionSignals = Readonly<{
  planSuperseded: () => void;
}>;

export type ReplaceShiftSelectionDependencies<StoredWorkEvent> = Readonly<{
  repo: ReplaceShiftSelectionRepository<StoredWorkEvent>;
  idempotency: ReplaceShiftSelectionIdempotency<StoredWorkEvent>;
  policy: ReplaceShiftSelectionPolicy;
  clock: Readonly<{ now: () => Date }>;
  signals?: ReplaceShiftSelectionSignals;
}>;

export type ExecuteReplaceShiftSelection = (
  command: ReplaceShiftSelectionCommand,
) => Promise<
  CellOutcome<ReplaceShiftSelectionResult, ReplaceShiftSelectionExpectedFailure>
>;

const success = (
  value: ReplaceShiftSelectionResult,
): CellOutcome<
  ReplaceShiftSelectionResult,
  ReplaceShiftSelectionExpectedFailure
> => ({ kind: 'success', value });

const failure = (
  value: ReplaceShiftSelectionExpectedFailure,
): CellOutcome<
  ReplaceShiftSelectionResult,
  ReplaceShiftSelectionExpectedFailure
> => ({ kind: 'failure', failure: value });

const workEventCommand = (input: {
  command: ReplaceShiftSelectionCommand;
  selectedOrderIds: readonly string[];
}): ReplaceShiftSelectionWorkEventCommand => ({
  operation: 'production_shift_selection_replaced',
  locationId: input.command.locationId,
  actorId: input.command.actorId,
  target: {
    entityType: 'production_shift',
    entityId: input.command.productionShiftId,
  },
  expectedVersion: input.command.expectedVersion,
  payload: { selectedOrderIds: [...input.selectedOrderIds] },
});

const replayOutcome = (
  replay: ReplaceShiftSelectionReplay,
): CellOutcome<
  ReplaceShiftSelectionResult,
  ReplaceShiftSelectionExpectedFailure
> | null => {
  if (replay.kind === 'conflict')
    return failure(replaceShiftSelectionIdempotencyConflict());
  if (replay.kind === 'replay') return success(replay.result);
  return null;
};

export const makeExecuteReplaceShiftSelection = <StoredWorkEvent>(
  deps: ReplaceShiftSelectionDependencies<StoredWorkEvent>,
): ExecuteReplaceShiftSelection => {
  return async (command) => {
    let signalPlanSuperseded = false;
    try {
      const outcome = await deps.repo.transaction(async (repo) => {
        const selectedOrderIds = canonicalizeSelectedOrderIds(
          command.selectedOrderIds,
        );
        const idempotency = workEventCommand({ command, selectedOrderIds });
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

        const locked = await repo.lockSelection(
          command.locationId,
          command.productionShiftId,
        );
        const access = decideShiftSelectionAccess({
          current: locked,
          expectedVersion: command.expectedVersion,
        });
        if (access.kind === 'reject') return failure(access.failure);

        const ready = await repo.selectedOrdersAreReady(
          command.locationId,
          selectedOrderIds,
        );
        const decision = decideShiftSelectionChange({
          productionShiftId: command.productionShiftId,
          current: access.current,
          selectedOrderIds,
          selectedOrdersAreReady: ready,
          policy: deps.policy,
        });
        if (decision.kind === 'reject') return failure(decision.failure);

        let replaced: ReplaceShiftSelectionResult;
        if (decision.kind === 'no_change') replaced = decision.result;
        else {
          const mutation = await repo.replaceSelection({
            locationId: command.locationId,
            productionShiftId: command.productionShiftId,
            selectedOrderIds,
            currentVersion: access.current.version,
            supersede: decision.supersede,
            actorId: command.actorId,
            now: deps.clock.now(),
          });
          if (mutation.kind === 'selection_conflict')
            return failure(replaceShiftSelectionVersionConflict());
          if (mutation.kind === 'schedule_conflict')
            return failure(replaceShiftSelectionScheduleVersionConflict());
          replaced = mutation.result;
          signalPlanSuperseded =
            mutation.result.supersededScheduleRunId !== null;
        }

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_shift_selection_replaced',
          entityType: 'production_shift',
          entityId: command.productionShiftId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            selectedOrderIds,
            version: replaced.selection.version,
            supersededScheduleRunId: replaced.supersededScheduleRunId,
          },
          idempotency: { command: idempotency, result: replaced },
        });
        return success(replaced);
      });

      if (outcome.kind === 'success' && signalPlanSuperseded)
        deps.signals?.planSuperseded();
      return outcome;
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_shift_selection_failed',
          message: 'The shift order selection could not be saved.',
          safeMessage: 'The shift order selection could not be saved.',
          status: 503,
          cause,
        }),
      );
    }
  };
};
