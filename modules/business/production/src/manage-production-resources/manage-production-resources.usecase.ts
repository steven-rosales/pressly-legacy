import {
  databaseError,
  mapUnknownError,
  validationError,
} from '@pressly/errors';
import { createHash } from 'node:crypto';
import type {
  ProductionBootstrapDestructiveRejection,
  ProductionBootstrapManifest,
  ProductionBootstrapResourceChange,
  ProductionBootstrapResult,
} from '@pressly/contracts';
import { result } from '@pressly/kernel';
import { productionIdempotencyConflict } from '../command-execution/production-command.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../command-execution/production-idempotency.policy.ts';
import type { ClockPort } from '../command-execution/production-command.port.ts';
import type {
  ManageProductionResources,
  ManageProductionResourcesRepository,
  StoredProductionResources,
} from './manage-production-resources.port.ts';

type ResourceType = ProductionBootstrapResourceChange['resourceType'];

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
): string =>
  createHash('sha256')
    .update(JSON.stringify(canonicalManifest(manifest)))
    .digest('hex');

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
  resourceType: ResourceType,
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
  resourceType: ResourceType,
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
  resourceType: ResourceType,
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

const compareResources = (
  manifest: ProductionBootstrapManifest,
  stored: StoredProductionResources,
): {
  operations: ProductionBootstrapResourceChange[];
  rejections: ProductionBootstrapDestructiveRejection[];
} => {
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
    resourceType: ResourceType;
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

const summarize = (
  operations: readonly ProductionBootstrapResourceChange[],
  rejections: readonly ProductionBootstrapDestructiveRejection[],
) => ({
  created: operations.filter((operation) => operation.outcome === 'created')
    .length,
  updated: operations.filter((operation) => operation.outcome === 'updated')
    .length,
  noop: operations.filter((operation) => operation.outcome === 'noop').length,
  rejected: rejections.length,
});

export const makeManageProductionResources =
  (deps: {
    repo: ManageProductionResourcesRepository;
    clock: ClockPort;
  }): ManageProductionResources =>
  async (command) => {
    const stationKinds = new Set(
      command.manifest.stations.map((station) => station.kind),
    );
    const machineWithoutStation = command.manifest.machines.find(
      (machine) => !stationKinds.has(machine.stationKind),
    );
    if (machineWithoutStation !== undefined)
      return result.err(
        validationError({
          code: 'production_bootstrap_machine_station_missing',
          message:
            'Every production machine must reference a station in the same manifest.',
          safeMessage:
            'Every production machine must reference a station in the same manifest.',
        }),
      );

    try {
      return await deps.repo.transaction(async (repo) => {
        const locationId = command.manifest.location.id;
        const idempotency = defineWorkEventCommand({
          operation: 'production_resources_bootstrapped',
          locationId,
          actorId: command.actorId,
          entityType: 'production_resource_manifest',
          entityId: locationId,
          payload: {
            dryRun: command.dryRun,
            configurationHash: hashProductionBootstrapManifest(
              command.manifest,
            ),
          },
        });
        if (!command.dryRun) {
          const replay = resolveWorkEventReplay<ProductionBootstrapResult>(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          );
          if (replay.tag === 'conflict')
            return result.err(productionIdempotencyConflict());
          if (replay.tag === 'replay') return result.ok(replay.result);
        }

        const stored = await repo.loadResources(locationId);
        const compared = compareResources(command.manifest, stored);
        const mode = command.dryRun ? ('dry_run' as const) : ('apply' as const);
        const common = {
          mode,
          configurationHash: hashProductionBootstrapManifest(command.manifest),
          operations: compared.operations,
          rejections: compared.rejections,
          summary: summarize(compared.operations, compared.rejections),
          replayed: false,
        };
        const outcome: ProductionBootstrapResult =
          compared.rejections.length > 0
            ? {
                ...common,
                status: 'rejected',
                applied: false,
                rejections: compared.rejections as [
                  ProductionBootstrapDestructiveRejection,
                  ...ProductionBootstrapDestructiveRejection[],
                ],
              }
            : {
                ...common,
                status: 'converged',
                applied: !command.dryRun,
                rejections: [],
              };

        if (outcome.status === 'converged' && !command.dryRun)
          await repo.applyResources({
            manifest: command.manifest,
            result: outcome,
            actorId: command.actorId,
            idempotencyKey: command.idempotencyKey,
            idempotency,
            now: deps.clock.now(),
          });

        return result.ok(outcome);
      });
    } catch (error) {
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'production_bootstrap_failed',
            message: 'Production resources could not be bootstrapped.',
            safeMessage: 'Production resources could not be bootstrapped.',
            status: 503,
            cause: unknownCause,
          }),
        ),
      );
    }
  };
