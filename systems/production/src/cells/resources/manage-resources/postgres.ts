import { isJsonObject } from '@pressly/codec';
import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, desc, eq, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import type {
  ManageResourcesRepository,
  ManageResourcesTransactionRepository,
} from './execute.ts';
import type { StoredManageResourcesWorkEvent } from './idempotency.ts';
import type { ProductionBootstrapManifest } from './types.ts';
import {
  appendManageResourcesWorkEvent,
  findManageResourcesWorkEvent,
} from './work-event.postgres.ts';

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const stageFitAssertion = (
  value: unknown,
): ProductionBootstrapManifest['schedulerConfig']['stageFitAssertion'] => {
  if (
    !isJsonObject(value) ||
    value['sortingFits'] !== true ||
    value['washingFits'] !== true ||
    value['dryingFits'] !== true
  )
    throw invariant(
      'production_resources_stage_fit_assertion_invalid',
      'Stored scheduler stage-fit assertion is invalid.',
    );
  return { sortingFits: true, washingFits: true, dryingFits: true };
};

export type ManageResourcesPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeManageResourcesPostgresRepository = (
  deps: ManageResourcesPostgresDependencies,
  schema: ProductionSchema,
): ManageResourcesRepository<StoredManageResourcesWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): ManageResourcesTransactionRepository<StoredManageResourcesWorkEvent> => ({
      findWorkEvent: (key) => findManageResourcesWorkEvent(db, schema, key),
      lockLocationScheduling: async (locationId) => {
        await db.execute(
          sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
        );
      },
      loadResources: async (locationId) => {
        const [location] = await db
          .select()
          .from(schema.productionLocations)
          .where(eq(schema.productionLocations.id, locationId))
          .limit(1);
        const stations = await db
          .select()
          .from(schema.stations)
          .where(eq(schema.stations.locationId, locationId));
        const machines = await db
          .select({
            stationKind: schema.stations.kind,
            label: schema.machines.label,
            manufacturerCapacityLbs: schema.machines.manufacturerCapacityLbs,
            effectiveCapacityLbs: schema.machines.effectiveCapacityLbs,
            capacitySafetyMarginLbs: schema.machines.capacitySafetyMarginLbs,
            isActive: schema.machines.isActive,
          })
          .from(schema.machines)
          .innerJoin(
            schema.stations,
            and(
              eq(schema.stations.id, schema.machines.stationId),
              eq(schema.stations.locationId, schema.machines.locationId),
            ),
          )
          .where(eq(schema.machines.locationId, locationId));
        const [config] = await db
          .select()
          .from(schema.schedulerConfigs)
          .where(eq(schema.schedulerConfigs.locationId, locationId))
          .orderBy(desc(schema.schedulerConfigs.version))
          .limit(1);
        return {
          location:
            location === undefined
              ? null
              : {
                  id: location.id,
                  businessId: location.businessId,
                  name: location.name,
                  timezone: location.timezone,
                  isActive: location.isActive,
                },
          stations: stations.map((station) => ({
            locationId: station.locationId,
            kind: station.kind as ProductionBootstrapManifest['stations'][number]['kind'],
            label: station.label,
            sortOrder: station.sortOrder,
            isActive: station.isActive,
          })),
          machines: machines.map((machine) => ({
            locationId,
            stationKind: machine.stationKind as 'washing' | 'drying',
            label: machine.label,
            manufacturerCapacityLbs: machine.manufacturerCapacityLbs,
            effectiveCapacityLbs: machine.effectiveCapacityLbs,
            capacitySafetyMarginLbs: machine.capacitySafetyMarginLbs,
            isActive: machine.isActive,
          })),
          schedulerConfig:
            config === undefined
              ? null
              : {
                  locationId,
                  pulseMinutes: config.pulseMinutes,
                  foldLbsPerFolderMinute: config.foldLbsPerFolderMinute,
                  algorithmVersion:
                    config.algorithmVersion as ProductionBootstrapManifest['schedulerConfig']['algorithmVersion'],
                  stageFitAssertion: stageFitAssertion(
                    config.stageFitAssertion,
                  ),
                },
        };
      },
      applyResources: async ({
        manifest,
        result: bootstrapResult,
        actorId,
        idempotencyKey,
        idempotency,
        now,
      }) => {
        const location = manifest.location;
        await db
          .insert(schema.productionLocations)
          .values({ ...location, updatedAt: now })
          .onConflictDoUpdate({
            target: schema.productionLocations.id,
            set: {
              name: location.name,
              timezone: location.timezone,
              isActive: location.isActive,
              updatedAt: now,
            },
          });

        for (const station of manifest.stations)
          await db
            .insert(schema.stations)
            .values({
              id: deps.ids.next(),
              locationId: station.locationId,
              kind: station.kind,
              label: station.label,
              sortOrder: station.sortOrder,
              isActive: station.isActive,
            })
            .onConflictDoUpdate({
              target: [schema.stations.locationId, schema.stations.kind],
              set: {
                label: station.label,
                sortOrder: station.sortOrder,
                isActive: station.isActive,
              },
            });

        const storedStations = await db
          .select({
            id: schema.stations.id,
            kind: schema.stations.kind,
          })
          .from(schema.stations)
          .where(eq(schema.stations.locationId, location.id));
        const stationIdByKind = new Map(
          storedStations.map((station) => [station.kind, station.id]),
        );

        for (const machine of manifest.machines) {
          const stationId = stationIdByKind.get(machine.stationKind);
          if (stationId === undefined)
            throw invariant(
              'production_resources_machine_station_missing',
              'Bootstrap machine station was not found.',
            );
          await db
            .insert(schema.machines)
            .values({
              id: deps.ids.next(),
              locationId: machine.locationId,
              stationId,
              label: machine.label,
              manufacturerCapacityLbs: machine.manufacturerCapacityLbs,
              effectiveCapacityLbs: machine.effectiveCapacityLbs,
              capacitySafetyMarginLbs: machine.capacitySafetyMarginLbs,
              isActive: machine.isActive,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [schema.machines.stationId, schema.machines.label],
              set: {
                manufacturerCapacityLbs: machine.manufacturerCapacityLbs,
                effectiveCapacityLbs: machine.effectiveCapacityLbs,
                capacitySafetyMarginLbs: machine.capacitySafetyMarginLbs,
                isActive: machine.isActive,
                updatedAt: now,
              },
            });
        }

        const configOperation = bootstrapResult.operations.find(
          (operation) => operation.resourceType === 'scheduler_config',
        );
        if (configOperation?.outcome !== 'noop') {
          const [latest] = await db
            .select({ version: schema.schedulerConfigs.version })
            .from(schema.schedulerConfigs)
            .where(eq(schema.schedulerConfigs.locationId, location.id))
            .orderBy(desc(schema.schedulerConfigs.version))
            .limit(1);
          const config = manifest.schedulerConfig;
          await db.insert(schema.schedulerConfigs).values({
            id: deps.ids.next(),
            locationId: location.id,
            pulseMinutes: config.pulseMinutes,
            foldLbsPerFolderMinute: config.foldLbsPerFolderMinute,
            algorithmVersion: config.algorithmVersion,
            version: (latest?.version ?? 0) + 1,
            stageFitAssertion: {
              ...config.stageFitAssertion,
              assertedBy: actorId,
              assertedAt: now.toISOString(),
            },
            assertedBy: actorId,
            publishedAt: now,
          });
        }

        await appendManageResourcesWorkEvent(db, schema, deps.ids, {
          locationId: location.id,
          entityId: deps.ids.next(),
          actorId,
          idempotencyKey,
          result: bootstrapResult,
          idempotency,
        });
      },
    }),
  );
  const unitOfWork =
    deps.observeUnitOfWork?.(nativeUnitOfWork) ?? nativeUnitOfWork;
  return Object.freeze({
    transaction: async (work) => {
      const outcome = await unitOfWork.transaction(async (repository) => {
        const cellOutcome = await work(repository);
        return cellOutcome.kind === 'success'
          ? result.ok(cellOutcome.value)
          : result.err(cellOutcome.failure);
      });
      return outcome.tag === 'ok'
        ? { kind: 'success', value: outcome.value }
        : { kind: 'failure', failure: outcome.error };
    },
  });
};
