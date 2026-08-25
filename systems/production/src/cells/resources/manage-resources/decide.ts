import { sha256Text } from '@pressly/codec/node';
import type {
  ManageResourcesCommand,
  ManageResourcesResult,
  ManageResourcesValidationFailure,
  ProductionBootstrapDestructiveRejection,
  ProductionBootstrapManifest,
  ProductionBootstrapResourceChange,
  ProductionBootstrapResourceType,
  ProductionBootstrapSummary,
  ProductionResourceComparison,
  StoredProductionResources,
} from './types.ts';

const canonicalManifest = (manifest: ProductionBootstrapManifest) => ({
  ...manifest,
  stations: [...manifest.stations].sort((left, right) =>
    left.kind.localeCompare(right.kind),
  ),
  machines: [...manifest.machines].sort((left, right) =>
    `${left.stationKind}\0${left.label}`.localeCompare(
      `${right.stationKind}\0${right.label}`,
    ),
  ),
});

export const hashProductionBootstrapManifest = (
  manifest: ProductionBootstrapManifest,
): string => sha256Text(JSON.stringify(canonicalManifest(manifest)));

export const validateProductionBootstrapManifest = (
  manifest: ProductionBootstrapManifest,
): ManageResourcesValidationFailure | null => {
  const stationKinds = new Set(
    manifest.stations.map((station) => station.kind),
  );
  return manifest.machines.some(
    (machine) => !stationKinds.has(machine.stationKind),
  )
    ? {
        kind: 'validation',
        classification: 'malformed',
        code: 'production_bootstrap_machine_station_missing',
        message:
          'Every production machine must reference a station in the same manifest.',
        safeMessage:
          'Every production machine must reference a station in the same manifest.',
      }
    : null;
};

const changedFields = <Value extends object>(
  existing: Value,
  desired: Value,
  ignored: readonly (keyof Value)[] = [],
): string[] =>
  (Object.keys(desired) as (keyof Value)[])
    .filter((key) => !ignored.includes(key))
    .filter(
      (key) => JSON.stringify(existing[key]) !== JSON.stringify(desired[key]),
    )
    .map(String)
    .sort();

const change = (
  resourceType: ProductionBootstrapResourceType,
  naturalKey: string,
  fields: string[],
  created = false,
): ProductionBootstrapResourceChange => ({
  resourceType,
  naturalKey,
  outcome: created ? 'created' : fields.length === 0 ? 'noop' : 'updated',
  changedFields: created ? ['resource'] : fields,
});

const rejection = (
  resourceType: ProductionBootstrapResourceType,
  naturalKey: string,
  code: ProductionBootstrapDestructiveRejection['code'],
  message: string,
): ProductionBootstrapDestructiveRejection => ({
  resourceType,
  naturalKey,
  outcome: 'rejected',
  code,
  message,
});

const deactivation = (
  resourceType: ProductionBootstrapResourceType,
  naturalKey: string,
  existing: { isActive: boolean },
  desired: { isActive: boolean },
): ProductionBootstrapDestructiveRejection | null =>
  existing.isActive && !desired.isActive
    ? rejection(
        resourceType,
        naturalKey,
        'destructive_resource_deactivation',
        'Bootstrap cannot deactivate an existing production resource.',
      )
    : null;

export const compareProductionResources = (
  manifest: ProductionBootstrapManifest,
  stored: StoredProductionResources,
): ProductionResourceComparison => {
  const operations: ProductionBootstrapResourceChange[] = [];
  const rejections: ProductionBootstrapDestructiveRejection[] = [];

  if (stored.location === null)
    operations.push(change('location', manifest.location.id, [], true));
  else {
    const blocked = deactivation(
      'location',
      manifest.location.id,
      stored.location,
      manifest.location,
    );
    if (blocked !== null) rejections.push(blocked);
    else
      operations.push(
        change(
          'location',
          manifest.location.id,
          changedFields(stored.location, manifest.location, ['id']),
        ),
      );
  }

  const compareCollection = <Value extends { isActive: boolean }>(input: {
    resourceType: ProductionBootstrapResourceType;
    desired: readonly Value[];
    existing: readonly Value[];
    key: (value: Value) => string;
    ignored?: readonly (keyof Value)[];
  }): void => {
    const existingByKey = new Map(
      input.existing.map((value) => [input.key(value), value]),
    );
    const desiredKeys = new Set(input.desired.map(input.key));

    for (const desired of input.desired) {
      const naturalKey = input.key(desired);
      const existing = existingByKey.get(naturalKey);
      if (existing === undefined) {
        operations.push(change(input.resourceType, naturalKey, [], true));
        continue;
      }
      if (
        'locationId' in existing &&
        'locationId' in desired &&
        existing.locationId !== desired.locationId
      ) {
        rejections.push(
          rejection(
            input.resourceType,
            naturalKey,
            'natural_key_change',
            'A natural key is already owned by another production location.',
          ),
        );
        continue;
      }
      const blocked = deactivation(
        input.resourceType,
        naturalKey,
        existing,
        desired,
      );
      if (blocked !== null) rejections.push(blocked);
      else
        operations.push(
          change(
            input.resourceType,
            naturalKey,
            changedFields(existing, desired, input.ignored ?? []),
          ),
        );
    }

    for (const existing of input.existing) {
      const naturalKey = input.key(existing);
      if (!desiredKeys.has(naturalKey))
        rejections.push(
          rejection(
            input.resourceType,
            naturalKey,
            'destructive_resource_removal',
            'Bootstrap cannot remove an existing production resource.',
          ),
        );
    }
  };

  compareCollection({
    resourceType: 'station',
    desired: manifest.stations,
    existing: stored.stations,
    key: (station) => station.kind,
    ignored: ['kind'],
  });
  compareCollection({
    resourceType: 'machine',
    desired: manifest.machines,
    existing: stored.machines,
    key: (machine) => `${machine.stationKind}:${machine.label}`,
    ignored: ['stationKind', 'label'],
  });

  operations.push(
    stored.schedulerConfig === null
      ? change('scheduler_config', manifest.location.id, [], true)
      : change(
          'scheduler_config',
          manifest.location.id,
          changedFields(stored.schedulerConfig, manifest.schedulerConfig),
        ),
  );

  return { operations, rejections };
};

export const summarizeProductionResourceComparison = (
  comparison: ProductionResourceComparison,
): ProductionBootstrapSummary => ({
  created: comparison.operations.filter(
    (operation) => operation.outcome === 'created',
  ).length,
  updated: comparison.operations.filter(
    (operation) => operation.outcome === 'updated',
  ).length,
  noop: comparison.operations.filter(
    (operation) => operation.outcome === 'noop',
  ).length,
  rejected: comparison.rejections.length,
});

export const decideManageResourcesResult = (input: {
  command: ManageResourcesCommand;
  configurationHash: string;
  stored: StoredProductionResources;
}): ManageResourcesResult => {
  const comparison = compareProductionResources(
    input.command.manifest,
    input.stored,
  );
  const common = {
    mode: input.command.dryRun ? ('dry_run' as const) : ('apply' as const),
    configurationHash: input.configurationHash,
    operations: comparison.operations,
    summary: summarizeProductionResourceComparison(comparison),
    replayed: false,
  };
  return comparison.rejections.length > 0
    ? {
        ...common,
        status: 'rejected',
        rejections: comparison.rejections as [
          ProductionBootstrapDestructiveRejection,
          ...ProductionBootstrapDestructiveRejection[],
        ],
        applied: false,
      }
    : {
        ...common,
        status: 'converged',
        rejections: [],
        applied: !input.command.dryRun,
      };
};
