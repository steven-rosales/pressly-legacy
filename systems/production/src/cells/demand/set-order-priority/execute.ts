import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { decideSetOrderPriority } from './decide.ts';
import type {
  SetOrderPriorityCommand,
  SetOrderPriorityExpectedFailure,
  SetOrderPriorityFacts,
  SetOrderPriorityPolicy,
  SetOrderPriorityResult,
} from './types.ts';

export type SetOrderPriorityWorkEventCommand = Readonly<{
  operation: 'production_order_priority_changed';
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: 'production_order';
    entityId: string;
  }>;
  expectedVersion: number;
  payload: Readonly<{ priority: boolean }>;
}>;

export type SetOrderPriorityReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: SetOrderPriorityResult }>;

export type SetOrderPriorityIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: SetOrderPriorityWorkEventCommand,
  ) => SetOrderPriorityReplay;
}>;

export type SetOrderPriorityWorkEventInput = Readonly<{
  locationId: string;
  eventType: 'production_order_priority_changed';
  entityType: 'production_order';
  entityId: string;
  actorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  payload: Readonly<{ priority: boolean; version: number }>;
  idempotency: Readonly<{
    command: SetOrderPriorityWorkEventCommand;
    result: SetOrderPriorityResult;
  }>;
}>;

export type SetOrderPriorityTransactionRepository<StoredWorkEvent> = Readonly<{
  findWorkEvent: (idempotencyKey: string) => Promise<StoredWorkEvent | null>;
  lockLocationScheduling: (locationId: string) => Promise<void>;
  lockPriorityOrder: (
    locationId: string,
    productionOrderId: string,
  ) => Promise<SetOrderPriorityFacts | null>;
  setOrderPriority: (input: {
    locationId: string;
    productionOrderId: string;
    priority: boolean;
    expectedVersion: number;
    now: Date;
  }) => Promise<SetOrderPriorityResult | null>;
  appendWorkEvent: (event: SetOrderPriorityWorkEventInput) => Promise<void>;
}>;

export type SetOrderPriorityRepository<StoredWorkEvent> = Readonly<{
  transaction: (
    work: (
      repository: SetOrderPriorityTransactionRepository<StoredWorkEvent>,
    ) => Promise<
      CellOutcome<SetOrderPriorityResult, SetOrderPriorityExpectedFailure>
    >,
  ) => Promise<
    CellOutcome<SetOrderPriorityResult, SetOrderPriorityExpectedFailure>
  >;
}>;

export type SetOrderPriorityDependencies<StoredWorkEvent> = Readonly<{
  repo: SetOrderPriorityRepository<StoredWorkEvent>;
  idempotency: SetOrderPriorityIdempotency<StoredWorkEvent>;
  policy: SetOrderPriorityPolicy;
  clock: Readonly<{ now: () => Date }>;
}>;

export type ExecuteSetOrderPriority = (
  command: SetOrderPriorityCommand,
) => Promise<
  CellOutcome<SetOrderPriorityResult, SetOrderPriorityExpectedFailure>
>;

const success = (
  value: SetOrderPriorityResult,
): CellOutcome<SetOrderPriorityResult, SetOrderPriorityExpectedFailure> => ({
  kind: 'success',
  value,
});

const failure = (
  value: SetOrderPriorityExpectedFailure,
): CellOutcome<SetOrderPriorityResult, SetOrderPriorityExpectedFailure> => ({
  kind: 'failure',
  failure: value,
});

const idempotencyConflict = (): SetOrderPriorityExpectedFailure => ({
  kind: 'conflict',
  code: 'production_idempotency_conflict',
  message: 'The idempotency key belongs to a different production command.',
  safeMessage: 'The idempotency key belongs to a different production command.',
});

const workEventCommand = (
  command: SetOrderPriorityCommand,
): SetOrderPriorityWorkEventCommand => ({
  operation: 'production_order_priority_changed',
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: 'production_order',
    entityId: command.productionOrderId,
  },
  expectedVersion: command.expectedVersion,
  payload: { priority: command.priority },
});

const replayOutcome = (
  replay: SetOrderPriorityReplay,
): CellOutcome<
  SetOrderPriorityResult,
  SetOrderPriorityExpectedFailure
> | null => {
  if (replay.kind === 'conflict') return failure(idempotencyConflict());
  if (replay.kind === 'replay') return success(replay.result);
  return null;
};

const lateVersionConflict = (): SetOrderPriorityExpectedFailure => ({
  kind: 'conflict',
  code: 'production_order_version_conflict',
  message: 'The order changed before priority could be updated.',
  safeMessage: 'The order changed before priority could be updated.',
});

export const makeExecuteSetOrderPriority =
  <StoredWorkEvent>(
    deps: SetOrderPriorityDependencies<StoredWorkEvent>,
  ): ExecuteSetOrderPriority =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = workEventCommand(command);
        const replay = replayOutcome(
          deps.idempotency.resolveReplay(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          ),
        );
        if (replay !== null) return replay;

        await repo.lockLocationScheduling(command.locationId);
        const lockedReplay = replayOutcome(
          deps.idempotency.resolveReplay(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          ),
        );
        if (lockedReplay !== null) return lockedReplay;

        const facts = await repo.lockPriorityOrder(
          command.locationId,
          command.productionOrderId,
        );
        const decision = decideSetOrderPriority({
          command,
          facts,
          policy: deps.policy,
        });
        if (decision.kind === 'reject') return failure(decision.failure);

        const mutation = await repo.setOrderPriority({
          locationId: command.locationId,
          productionOrderId: command.productionOrderId,
          priority: command.priority,
          expectedVersion: command.expectedVersion,
          now: deps.clock.now(),
        });
        if (mutation === null) return failure(lateVersionConflict());

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_order_priority_changed',
          entityType: 'production_order',
          entityId: command.productionOrderId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: { priority: command.priority, version: mutation.version },
          idempotency: { command: idempotency, result: mutation },
        });
        return success(mutation);
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_priority_failed',
          message: 'Order priority could not be updated.',
          safeMessage: 'Order priority could not be updated.',
          status: 503,
          cause,
        }),
      );
    }
  };
