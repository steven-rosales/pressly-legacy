import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { decideAutomaticPlacementRun } from './decide.ts';
import type {
  AttemptAutomaticPlacementCommand,
  AttemptAutomaticPlacementExpectedFailure,
  AttemptAutomaticPlacementResult,
  AutomaticPlacementDelegationCommand,
  PendingRunResolution,
  StartedProductionRun,
} from './types.ts';

export type AttemptAutomaticPlacementTransactionRepository = Readonly<{
  lockLocationScheduling: (locationId: string) => Promise<void>;
  findStartedRuns: (
    locationId: string,
  ) => Promise<readonly StartedProductionRun[]>;
  recordPendingRunResolution: (
    input: Readonly<{
      locationId: string;
      productionOrderId: string;
      actorId: string;
      idempotencyKey: string;
      placement: PendingRunResolution;
      now: Date;
    }>,
  ) => Promise<'recorded' | 'replayed' | 'conflict'>;
  placeAutomatically: (
    command: AutomaticPlacementDelegationCommand,
  ) => Promise<
    CellOutcome<
      Exclude<AttemptAutomaticPlacementResult, null>,
      AttemptAutomaticPlacementExpectedFailure
    >
  >;
}>;

export type AttemptAutomaticPlacementRepository = Readonly<{
  transaction: (
    work: (
      repository: AttemptAutomaticPlacementTransactionRepository,
    ) => Promise<
      CellOutcome<
        AttemptAutomaticPlacementResult,
        AttemptAutomaticPlacementExpectedFailure
      >
    >,
  ) => Promise<
    CellOutcome<
      AttemptAutomaticPlacementResult,
      AttemptAutomaticPlacementExpectedFailure
    >
  >;
}>;

export type AttemptAutomaticPlacementDependencies = Readonly<{
  repo: AttemptAutomaticPlacementRepository;
  clock: Readonly<{ now: () => Date }>;
}>;

export type ExecuteAttemptAutomaticPlacement = (
  command: AttemptAutomaticPlacementCommand,
) => Promise<
  CellOutcome<
    AttemptAutomaticPlacementResult,
    AttemptAutomaticPlacementExpectedFailure
  >
>;

const success = (value: AttemptAutomaticPlacementResult) =>
  ({ kind: 'success', value }) as const;

const failure = (value: AttemptAutomaticPlacementExpectedFailure) =>
  ({ kind: 'failure', failure: value }) as const;

const idempotencyConflict = (): AttemptAutomaticPlacementExpectedFailure => ({
  kind: 'conflict',
  code: 'production_idempotency_conflict',
  message: 'The idempotency key belongs to a different placement attempt.',
  safeMessage: 'The idempotency key belongs to a different request.',
});

export const makeExecuteAttemptAutomaticPlacement =
  (
    deps: AttemptAutomaticPlacementDependencies,
  ): ExecuteAttemptAutomaticPlacement =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repository) => {
        await repository.lockLocationScheduling(command.locationId);
        const decision = decideAutomaticPlacementRun(
          await repository.findStartedRuns(command.locationId),
        );
        if (decision.kind === 'record') {
          const result = await repository.recordPendingRunResolution({
            locationId: command.locationId,
            productionOrderId: command.productionOrderId,
            actorId: command.actorId,
            idempotencyKey: command.idempotencyKey,
            placement: decision.placement,
            now: deps.clock.now(),
          });
          if (result === 'conflict') return failure(idempotencyConflict());
          return success(null);
        }
        return repository.placeAutomatically({
          ...command,
          productionRunId: decision.run.productionRunId,
          expectedQueueVersion: decision.run.queueVersion,
        });
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_order_placement_failed',
          message: 'The eligible order could not be placed.',
          safeMessage: 'The eligible order could not be placed.',
          status: 503,
          cause,
        }),
      );
    }
  };
