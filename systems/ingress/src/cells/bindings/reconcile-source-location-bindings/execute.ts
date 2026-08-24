import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { ReconcileSourceLocationBindingsResult } from './model.ts';
import { planSourceLocationBindings } from './decide.ts';
import type {
  ReconcileSourceLocationBindingsClock,
  ReconcileSourceLocationBindingsCommand,
  ReconcileSourceLocationBindingsExpectedFailure,
  ReconcileSourceLocationBindingsRepository,
} from './types.ts';

export type ReconcileSourceLocationBindingsDependencies = Readonly<{
  repo: ReconcileSourceLocationBindingsRepository;
  clock: ReconcileSourceLocationBindingsClock;
}>;

export const makeExecuteReconcileSourceLocationBindings =
  (deps: ReconcileSourceLocationBindingsDependencies) =>
  async (
    command: ReconcileSourceLocationBindingsCommand,
  ): Promise<
    CellOutcome<
      ReconcileSourceLocationBindingsResult,
      ReconcileSourceLocationBindingsExpectedFailure
    >
  > => {
    try {
      const value = await deps.repo.transaction(async (repo) => {
        const plan = planSourceLocationBindings({
          existing: await repo.loadAll(),
          desired: command.manifest.sourceLocationBindings,
        });
        if (
          plan.status === 'converged' &&
          !command.dryRun &&
          plan.additions.length > 0
        )
          await repo.insert(plan.additions, deps.clock.now());
        return {
          mode: command.dryRun ? ('dry_run' as const) : ('apply' as const),
          status: plan.status,
          applied: plan.status === 'converged' && !command.dryRun,
          operations: plan.operations,
          rejections: plan.rejections,
        };
      });
      return { kind: 'success', value };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'source_location_bindings_failed',
          message: 'Source-location bindings could not be managed.',
          safeMessage: 'Source-location bindings could not be managed.',
          status: 503,
          cause,
        }),
      );
    }
  };
