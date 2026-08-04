import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import type { SourceLocationBindingStore } from '../../../foundations/ports/source-location-binding-store/source-location-binding-store.port.ts';
import type { ReconcileSourceLocationBindings } from './reconcile-source-location-bindings.port.ts';
import { planSourceLocationBindings } from './source-location-binding-plan.policy.ts';

const sourceLocationBindingReconciliationFailure = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'source_location_bindings_failed',
      message: 'Source-location bindings could not be managed.',
      safeMessage: 'Source-location bindings could not be managed.',
      status: 503,
      cause: unknownCause,
    }),
  );

export const makeReconcileSourceLocationBindings =
  (deps: {
    store: SourceLocationBindingStore;
    clock: Clock;
  }): ReconcileSourceLocationBindings =>
  async ({ manifest, dryRun }) => {
    try {
      const existing = await deps.store.loadAll();
      const plan = planSourceLocationBindings({
        existing,
        desired: manifest.sourceLocationBindings,
      });
      if (plan.status === 'converged' && !dryRun && plan.additions.length > 0)
        await deps.store.insert(plan.additions, deps.clock.now());

      return result.ok({
        mode: dryRun ? 'dry_run' : 'apply',
        status: plan.status,
        applied: plan.status === 'converged' && !dryRun,
        operations: plan.operations,
        rejections: plan.rejections,
      });
    } catch (error) {
      throw sourceLocationBindingReconciliationFailure(error);
    }
  };
