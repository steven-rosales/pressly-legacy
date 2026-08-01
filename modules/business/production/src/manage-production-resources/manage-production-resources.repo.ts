import {
  and,
  desc,
  eq,
  laundryProduction,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import type { ProductionBootstrapManifest } from '@pressly/contracts';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';
import type { ManageProductionResourcesRepository } from './manage-production-resources.port.ts';

const bootstrapEventType = 'production_resources_bootstrapped';

const mapStageFitAssertion = (
  value: unknown,
): ProductionBootstrapManifest['schedulerConfig']['stageFitAssertion'] => {
  const assertion = value as Record<string, unknown>;
  if (
    assertion['sortingFits'] !== true ||
    assertion['washingFits'] !== true ||
    assertion['dryingFits'] !== true
  )
    throw new Error('Stored scheduler stage-fit assertion is invalid.');
  return { sortingFits: true, washingFits: true, dryingFits: true };
};

export const makeManageProductionResourcesRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): ManageProductionResourcesRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),

    loadResources: async (locationId) => {
      const [location] = await db
        .select()
        .from(laundryProduction.productionLocations)
        .where(eq(laundryProduction.productionLocations.id, locationId))
        .limit(1);
      const stations = await db
        .select()
        .from(laundryProduction.stations)
        .where(eq(laundryProduction.stations.locationId, locationId));
      const machines = await db
        .select({
          stationKind: laundryProduction.stations.kind,
          label: laundryProduction.machines.label,
          manufacturerCapacityLbs:
            laundryProduction.machines.manufacturerCapacityLbs,
          effectiveCapacityLbs: laundryProduction.machines.effectiveCapacityLbs,
          capacitySafetyMarginLbs:
            laundryProduction.machines.capacitySafetyMarginLbs,
          isActive: laundryProduction.machines.isActive,
        })
        .from(laundryProduction.machines)
        .innerJoin(
          laundryProduction.stations,
          and(
            eq(
              laundryProduction.stations.id,
              laundryProduction.machines.stationId,
            ),
            eq(
              laundryProduction.stations.locationId,
              laundryProduction.machines.locationId,
            ),
          ),
        )
        .where(eq(laundryProduction.machines.locationId, locationId));
      const [config] = await db
        .select()
        .from(laundryProduction.schedulerConfigs)
        .where(eq(laundryProduction.schedulerConfigs.locationId, locationId))
        .orderBy(desc(laundryProduction.schedulerConfigs.version))
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
                stageFitAssertion: mapStageFitAssertion(
                  config.stageFitAssertion,
                ),
              },
      };
    },

    applyResources: async ({
      manifest,
      result,
      actorId,
      idempotencyKey,
      idempotency,
      now,
    }) => {
      const location = manifest.location;
      await db
        .insert(laundryProduction.productionLocations)
        .values({ ...location, updatedAt: now })
        .onConflictDoUpdate({
          target: laundryProduction.productionLocations.id,
          set: {
            name: location.name,
            timezone: location.timezone,
            isActive: location.isActive,
            updatedAt: now,
          },
        });

      for (const station of manifest.stations)
        await db
          .insert(laundryProduction.stations)
          .values({
            id: deps.ids.next(),
            locationId: station.locationId,
            kind: station.kind,
            label: station.label,
            sortOrder: station.sortOrder,
            isActive: station.isActive,
          })
          .onConflictDoUpdate({
            target: [
              laundryProduction.stations.locationId,
              laundryProduction.stations.kind,
            ],
            set: {
              label: station.label,
              sortOrder: station.sortOrder,
              isActive: station.isActive,
            },
          });

      const storedStations = await db
        .select({
          id: laundryProduction.stations.id,
          kind: laundryProduction.stations.kind,
        })
        .from(laundryProduction.stations)
        .where(eq(laundryProduction.stations.locationId, location.id));
      const stationIdByKind = new Map(
        storedStations.map((station) => [station.kind, station.id]),
      );

      for (const machine of manifest.machines) {
        const stationId = stationIdByKind.get(machine.stationKind);
        if (stationId === undefined)
          throw new Error('Bootstrap machine station was not found.');
        await db
          .insert(laundryProduction.machines)
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
            target: [
              laundryProduction.machines.stationId,
              laundryProduction.machines.label,
            ],
            set: {
              manufacturerCapacityLbs: machine.manufacturerCapacityLbs,
              effectiveCapacityLbs: machine.effectiveCapacityLbs,
              capacitySafetyMarginLbs: machine.capacitySafetyMarginLbs,
              isActive: machine.isActive,
              updatedAt: now,
            },
          });
      }

      const configOperation = result.operations.find(
        (operation) => operation.resourceType === 'scheduler_config',
      );
      if (configOperation?.outcome !== 'noop') {
        const [latest] = await db
          .select({ version: laundryProduction.schedulerConfigs.version })
          .from(laundryProduction.schedulerConfigs)
          .where(eq(laundryProduction.schedulerConfigs.locationId, location.id))
          .orderBy(desc(laundryProduction.schedulerConfigs.version))
          .limit(1);
        const config = manifest.schedulerConfig;
        await db.insert(laundryProduction.schedulerConfigs).values({
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

      await appendWorkEvent(db, deps.ids, {
        locationId: location.id,
        eventType: bootstrapEventType,
        entityType: 'production_resource_manifest',
        entityId: deps.ids.next(),
        actorId,
        idempotencyKey,
        payload: { result },
        idempotency: { command: idempotency, result },
      });
    },
  }));
