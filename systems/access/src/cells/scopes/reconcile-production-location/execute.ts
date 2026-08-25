import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { decideReconcileProductionLocation } from './decide.ts';
import type {
  AccessProductionLocation,
  ReconcileProductionLocationCommand,
  ReconcileProductionLocationResult,
  ReconcileProductionLocationState,
} from './types.ts';

export type ReconcileProductionLocationTransactionRepository = Readonly<{
  lock: (locationId: string) => Promise<void>;
  load: (
    location: AccessProductionLocation,
  ) => Promise<ReconcileProductionLocationState>;
  save: (location: AccessProductionLocation, now: Date) => Promise<void>;
}>;

export type ReconcileProductionLocationRepository = Readonly<{
  transaction: <Value>(
    work: (
      repository: ReconcileProductionLocationTransactionRepository,
    ) => Promise<Value>,
  ) => Promise<Value>;
}>;

export type ReconcileProductionLocationDependencies = Readonly<{
  repository: ReconcileProductionLocationRepository;
  clock: Readonly<{ now: () => Date }>;
}>;

export const makeExecuteReconcileProductionLocation =
  (dependencies: ReconcileProductionLocationDependencies) =>
  async (
    command: ReconcileProductionLocationCommand,
  ): Promise<CellOutcome<ReconcileProductionLocationResult, never>> => {
    try {
      const value = await dependencies.repository.transaction(
        async (repository) => {
          await repository.lock(command.location.id);
          const result = decideReconcileProductionLocation(
            command,
            await repository.load(command.location),
          );
          if (result.status === 'converged' && !command.dryRun)
            await repository.save(command.location, dependencies.clock.now());
          return result;
        },
      );
      return { kind: 'success', value };
    } catch (error: unknown) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'access_production_location_reconciliation_failed',
          message: 'The production location could not be reconciled.',
          safeMessage: 'The production location could not be reconciled.',
          status: 503,
          cause,
        }),
      );
    }
  };
