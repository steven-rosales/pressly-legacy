import type {
  SourceLocationBindingChange,
  SourceLocationBindingRejection,
} from './reconcile-source-location-bindings.model.ts';
import type { SourceLocationBinding } from './source-location-binding.entity.ts';

export type SourceLocationBindingPlan = Readonly<{
  status: 'converged' | 'rejected';
  operations: readonly SourceLocationBindingChange[];
  rejections: readonly SourceLocationBindingRejection[];
  additions: readonly SourceLocationBinding[];
}>;

const naturalKey = (binding: {
  source: string;
  externalLocationId: string;
}): string => `${binding.source}\u0000${binding.externalLocationId}`;

export const planSourceLocationBindings = (input: {
  existing: readonly SourceLocationBinding[];
  desired: readonly SourceLocationBinding[];
}): SourceLocationBindingPlan => {
  const existingByKey = new Map(
    input.existing.map((binding) => [naturalKey(binding), binding]),
  );
  const desiredKeys = new Set(input.desired.map(naturalKey));
  const desiredSources = new Set(
    input.desired.map((binding) => binding.source),
  );
  const desiredLocations = new Set(
    input.desired.map((binding) => binding.locationId),
  );
  const operations: SourceLocationBindingChange[] = [];
  const rejections: SourceLocationBindingRejection[] = [];

  for (const binding of input.desired) {
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

  for (const stored of input.existing)
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

  return Object.freeze({
    status: rejections.length === 0 ? 'converged' : 'rejected',
    operations: Object.freeze(operations),
    rejections: Object.freeze(rejections),
    additions: Object.freeze(
      input.desired.filter(
        (binding) => !existingByKey.has(naturalKey(binding)),
      ),
    ),
  });
};
