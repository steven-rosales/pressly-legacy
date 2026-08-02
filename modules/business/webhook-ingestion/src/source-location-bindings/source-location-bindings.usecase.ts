import type {
  SourceLocationBindingChange,
  SourceLocationBindingRejection,
} from '@pressly/contracts';
import { databaseError, mapUnknownError, type AppError } from '@pressly/errors';
import { result } from '@pressly/kernel';
import type { WebhookIngestionClockPort } from '../ingestion/webhook-ingestion.port.ts';
import type {
  ManageSourceLocationBindings,
  ResolveSourceLocation,
  SourceLocationBindingsRepository,
} from './source-location-bindings.port.ts';

const sourceLocationBindingsFailed = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'source_location_bindings_failed',
      message: 'Source-location bindings could not be managed.',
      safeMessage: 'Source-location bindings could not be managed.',
      status: 503,
      cause: unknownCause,
    }),
  );

const naturalKey = (binding: { source: string; externalLocationId: string }) =>
  `${binding.source}\u0000${binding.externalLocationId}`;

export const makeResolveSourceLocation = (
  repo: SourceLocationBindingsRepository,
): ResolveSourceLocation => repo.resolve;

export const makeManageSourceLocationBindings =
  (deps: {
    repo: SourceLocationBindingsRepository;
    clock: WebhookIngestionClockPort;
  }): ManageSourceLocationBindings =>
  async ({ manifest, dryRun }) => {
    try {
      const existing = await deps.repo.loadAll();
      const existingByKey = new Map(
        existing.map((binding) => [naturalKey(binding), binding]),
      );
      const desiredKeys = new Set(
        manifest.sourceLocationBindings.map(naturalKey),
      );
      const desiredSources = new Set(
        manifest.sourceLocationBindings.map((binding) => binding.source),
      );
      const desiredLocations = new Set(
        manifest.sourceLocationBindings.map((binding) => binding.locationId),
      );
      const operations: SourceLocationBindingChange[] = [];
      const rejections: SourceLocationBindingRejection[] = [];

      for (const binding of manifest.sourceLocationBindings) {
        const stored = existingByKey.get(naturalKey(binding));
        if (stored === undefined) {
          if (!binding.isActive)
            rejections.push({
              source: binding.source,
              externalLocationId: binding.externalLocationId,
              code: 'binding_deactivation',
              message: 'A new source-location binding must be active.',
            });
          else
            operations.push({
              source: binding.source,
              externalLocationId: binding.externalLocationId,
              locationId: binding.locationId,
              outcome: 'created',
            });
          continue;
        }
        if (stored.locationId !== binding.locationId)
          rejections.push({
            source: binding.source,
            externalLocationId: binding.externalLocationId,
            code: 'binding_location_change',
            message:
              'A source location cannot be reassigned to another production location.',
          });
        else if (stored.isActive && !binding.isActive)
          rejections.push({
            source: binding.source,
            externalLocationId: binding.externalLocationId,
            code: 'binding_deactivation',
            message: 'Bootstrap cannot deactivate a source-location binding.',
          });
        else
          operations.push({
            source: binding.source,
            externalLocationId: binding.externalLocationId,
            locationId: binding.locationId,
            outcome: 'noop',
          });
      }

      for (const stored of existing)
        if (
          desiredSources.has(stored.source) &&
          desiredLocations.has(stored.locationId) &&
          !desiredKeys.has(naturalKey(stored))
        )
          rejections.push({
            source: stored.source,
            externalLocationId: stored.externalLocationId,
            code: 'binding_removal',
            message: 'Bootstrap cannot remove a source-location binding.',
          });

      const status = rejections.length === 0 ? 'converged' : 'rejected';
      const additions = manifest.sourceLocationBindings.filter(
        (binding) => !existingByKey.has(naturalKey(binding)),
      );
      if (status === 'converged' && !dryRun && additions.length > 0)
        await deps.repo.insert(additions, deps.clock.now());

      return result.ok({
        mode: dryRun ? 'dry_run' : 'apply',
        status,
        applied: status === 'converged' && !dryRun,
        operations,
        rejections,
      });
    } catch (error) {
      return result.err(sourceLocationBindingsFailed(error));
    }
  };
