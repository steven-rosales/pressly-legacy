import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc, eq, sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import type {
  ManageResourcesCommand,
  ManageResourcesResult,
} from '@pressly/production-system/operations/resources/manage-resources/types';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  captureManageResourcesOutcome,
  manageResourcesFixtureIds as ids,
  manageResourcesInitialTime as initialTime,
  manageResourcesLocationId as locationId,
  manageResourcesNow as now,
  manageResourcesScenarios,
  runManageResourcesScenario,
  type CanonicalManageResourcesOutcome,
  type ManageResourcesAuditEvent,
  type ManageResourcesFixture,
  type ManageResourcesObservation,
  type ManageResourcesScenario,
  type ManageResourcesState,
} from '../src/public.ts';
import { seedProductionLocationConformanceFacts } from '../src/production-location-conformance.postgres.ts';
import { productionCommandSystemDependencies } from '../src/production-command-system-dependencies.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: [
    'work_events',
    'scheduler_configs',
    'production_machines',
    'production_stations',
    'production_locations',
  ],
  maxConnections: 8,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : {
        resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
      }),
});

beforeAll(database.check);
afterAll(database.close);

const configurationHash =
  '3041d103cc41971b66458427ba7eaa3a2136ba00ca3247774aaeccd6c5adb829';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const baseNoopOperations = () => [
  {
    resourceType: 'location' as const,
    naturalKey: locationId,
    outcome: 'noop' as const,
    changedFields: [],
  },
  {
    resourceType: 'station' as const,
    naturalKey: 'washing',
    outcome: 'noop' as const,
    changedFields: [],
  },
  {
    resourceType: 'station' as const,
    naturalKey: 'drying',
    outcome: 'noop' as const,
    changedFields: [],
  },
  {
    resourceType: 'machine' as const,
    naturalKey: 'washing:W-01',
    outcome: 'noop' as const,
    changedFields: [],
  },
  {
    resourceType: 'machine' as const,
    naturalKey: 'drying:D-01',
    outcome: 'noop' as const,
    changedFields: [],
  },
  {
    resourceType: 'scheduler_config' as const,
    naturalKey: locationId,
    outcome: 'noop' as const,
    changedFields: [],
  },
];

const baseCreatedOperations = () =>
  baseNoopOperations().map((operation) => ({
    ...operation,
    outcome: 'created' as const,
    changedFields: ['resource'],
  }));

const expectedResult = (input: {
  applied: boolean;
  mode: 'apply' | 'dry_run';
  operations?: ManageResourcesResult['operations'];
  replayed?: boolean;
}): ManageResourcesResult => ({
  mode: input.mode,
  status: 'converged',
  configurationHash,
  operations: input.operations ?? baseCreatedOperations(),
  rejections: [],
  summary: (input.operations ?? baseCreatedOperations()).reduce(
    (summary, operation) => ({
      ...summary,
      [operation.outcome]: summary[operation.outcome] + 1,
    }),
    { created: 0, updated: 0, noop: 0, rejected: 0 },
  ),
  replayed: input.replayed ?? false,
  applied: input.applied,
});

const malformedStoredResult = (): Omit<ManageResourcesResult, 'replayed'> => ({
  mode: 'apply',
  status: 'converged',
  configurationHash,
  operations: baseNoopOperations(),
  rejections: [],
  summary: { created: 0, updated: 0, noop: 6, rejected: 0 },
  applied: true,
});

const seedLocation = async (fixture: ManageResourcesFixture): Promise<void> => {
  const inactive = fixture.kind === 'inactive';
  const location = {
    id: locationId,
    businessId: ids.business,
    name: inactive
      ? 'Existing Facility'
      : 'Manage Resources Conformance Facility',
    timezone: 'America/New_York',
    isActive: true,
    createdAt: initialTime,
    updatedAt: initialTime,
  };
  await seedProductionLocationConformanceFacts(database.db, [location]);
};

const seedConvergedResources = async (
  fixture: ManageResourcesFixture,
): Promise<void> => {
  const inactive = fixture.kind === 'inactive';
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.stations)
    .values([
      {
        id: ids.storedStations[0]!,
        locationId,
        kind: 'washing',
        label: inactive ? 'Wash Old' : 'Wash',
        sortOrder: inactive ? 3 : 1,
        isActive: true,
      },
      {
        id: ids.storedStations[1]!,
        locationId,
        kind: 'drying',
        label: 'Dry',
        sortOrder: 2,
        isActive: true,
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.machines)
    .values([
      {
        id: ids.storedMachines[0]!,
        locationId,
        stationId: ids.storedStations[0]!,
        label: 'W-01',
        manufacturerCapacityLbs: inactive ? 50 : 60,
        effectiveCapacityLbs: inactive ? 45 : 54,
        capacitySafetyMarginLbs: inactive ? 5 : 6,
        isActive: !inactive,
        createdAt: initialTime,
        updatedAt: initialTime,
      },
      {
        id: ids.storedMachines[1]!,
        locationId,
        stationId: ids.storedStations[1]!,
        label: 'D-01',
        manufacturerCapacityLbs: 30,
        effectiveCapacityLbs: 30,
        capacitySafetyMarginLbs: 0,
        isActive: true,
        createdAt: initialTime,
        updatedAt: initialTime,
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .values({
      id: ids.storedConfig,
      locationId,
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v1',
      version: 1,
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
        assertedBy: ids.actor,
        assertedAt: initialTime.toISOString(),
      },
      assertedBy: ids.actor,
      publishedAt: initialTime,
    });
};

const seedMalformedReceipt = async (
  scenario: ManageResourcesScenario,
): Promise<void> => {
  if (scenario.fixture.malformedReceipt !== true) return;
  const command = scenario.commands[0]!;
  const storedResult = malformedStoredResult();
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.workEvents)
    .values({
      id: ids.evidenceEvent,
      locationId,
      eventType: 'production_resources_bootstrapped',
      entityType: 'production_resource_manifest',
      entityId: ids.generated[0]!,
      actorId: ids.actor,
      expectedVersion: null,
      idempotencyKey: command.idempotencyKey,
      payload: {
        result: storedResult,
        _idempotency: {
          version: 1,
          command: {
            operation: 'production_resources_bootstrapped',
            locationId,
            actorId: ids.actor,
            target: {
              entityType: 'production_resource_manifest',
              entityId: locationId,
            },
            expectedVersion: null,
            payload: { dryRun: false, configurationHash },
          },
          result: storedResult,
        },
      },
      createdAt: initialTime,
    });
};

const seedCollision = async (
  fixture: ManageResourcesFixture,
): Promise<void> => {
  if (fixture.forceWorkEventAppendFailure !== true) return;
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.workEvents)
    .values({
      id: ids.collision,
      locationId,
      eventType: 'production_fixture_collision',
      entityType: 'production_resource_manifest',
      entityId: ids.evidenceEvent,
      actorId: ids.actor,
      expectedVersion: null,
      idempotencyKey: 'manage-resources-collision-evidence',
      payload: {},
      createdAt: initialTime,
    });
};

const seed = async (scenario: ManageResourcesScenario): Promise<void> => {
  if (scenario.fixture.kind !== 'empty') {
    await seedLocation(scenario.fixture);
    if (
      scenario.fixture.kind === 'converged' ||
      scenario.fixture.kind === 'inactive'
    )
      await seedConvergedResources(scenario.fixture);
  }
  await seedMalformedReceipt(scenario);
  await seedCollision(scenario.fixture);
};

const makeIds = (
  fixture: ManageResourcesFixture,
): Readonly<{ source: IdSource; issued: () => number }> => {
  let next = 0;
  const values =
    fixture.forceWorkEventAppendFailure === true
      ? [...ids.generated.slice(0, 6), ids.collision]
      : ids.generated;
  return {
    source: {
      next: () =>
        values[next++] ??
        `76000000-0000-4000-8000-${String(next).padStart(12, '0')}`,
    },
    issued: () => next,
  };
};

const readState = async (
  db: PostgresDatabase,
): Promise<ManageResourcesState> => {
  const [location] = await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionLocations)
    .where(
      eq(
        presslyPostgresOwnerSchemas.production.productionLocations.id,
        locationId,
      ),
    );
  const stations = await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.stations)
    .where(
      eq(
        presslyPostgresOwnerSchemas.production.stations.locationId,
        locationId,
      ),
    )
    .orderBy(asc(presslyPostgresOwnerSchemas.production.stations.kind));
  const machines = await db
    .select({
      id: presslyPostgresOwnerSchemas.production.machines.id,
      locationId: presslyPostgresOwnerSchemas.production.machines.locationId,
      stationId: presslyPostgresOwnerSchemas.production.machines.stationId,
      stationKind: presslyPostgresOwnerSchemas.production.stations.kind,
      label: presslyPostgresOwnerSchemas.production.machines.label,
      manufacturerCapacityLbs:
        presslyPostgresOwnerSchemas.production.machines.manufacturerCapacityLbs,
      effectiveCapacityLbs:
        presslyPostgresOwnerSchemas.production.machines.effectiveCapacityLbs,
      capacitySafetyMarginLbs:
        presslyPostgresOwnerSchemas.production.machines.capacitySafetyMarginLbs,
      isActive: presslyPostgresOwnerSchemas.production.machines.isActive,
      updatedAt: presslyPostgresOwnerSchemas.production.machines.updatedAt,
    })
    .from(presslyPostgresOwnerSchemas.production.machines)
    .innerJoin(
      presslyPostgresOwnerSchemas.production.stations,
      eq(
        presslyPostgresOwnerSchemas.production.machines.stationId,
        presslyPostgresOwnerSchemas.production.stations.id,
      ),
    )
    .where(
      eq(
        presslyPostgresOwnerSchemas.production.machines.locationId,
        locationId,
      ),
    )
    .orderBy(asc(presslyPostgresOwnerSchemas.production.machines.label));
  const configs = await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .where(
      eq(
        presslyPostgresOwnerSchemas.production.schedulerConfigs.locationId,
        locationId,
      ),
    )
    .orderBy(
      asc(presslyPostgresOwnerSchemas.production.schedulerConfigs.version),
    );
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
            liveRevision: location.liveRevision,
            updatedAt: location.updatedAt.toISOString(),
          },
    stations: stations.map((station) => ({
      id: station.id,
      locationId: station.locationId,
      kind: station.kind,
      label: station.label,
      sortOrder: station.sortOrder,
      isActive: station.isActive,
    })),
    machines: machines.map((machine) => ({
      ...machine,
      updatedAt: machine.updatedAt.toISOString(),
    })),
    configs: configs.map((config) => ({
      id: config.id,
      locationId: config.locationId,
      pulseMinutes: config.pulseMinutes,
      foldLbsPerFolderMinute: config.foldLbsPerFolderMinute,
      algorithmVersion: config.algorithmVersion,
      version: config.version,
      stageFitAssertion: config.stageFitAssertion,
      assertedBy: config.assertedBy,
      publishedAt: config.publishedAt.toISOString(),
    })),
  };
};

const readEvents = async (
  scenario: ManageResourcesScenario,
): Promise<readonly ManageResourcesAuditEvent[]> => {
  const keys = new Set(
    scenario.commands.map((command) => command.idempotencyKey),
  );
  const events = await database.db
    .select()
    .from(presslyPostgresOwnerSchemas.production.workEvents)
    .orderBy(
      asc(presslyPostgresOwnerSchemas.production.workEvents.createdAt),
      asc(presslyPostgresOwnerSchemas.production.workEvents.id),
    );
  return events
    .filter((event) => keys.has(event.idempotencyKey))
    .map((event) => ({
      id: event.id,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      actorId: event.actorId,
      expectedVersion: event.expectedVersion,
      idempotencyKey: event.idempotencyKey,
      payload: event.payload,
    }));
};

const readLiveRevision = async (): Promise<number> =>
  (await readState(database.db)).location?.liveRevision ?? 0;

const observe = async (
  scenario: ManageResourcesScenario,
): Promise<ManageResourcesObservation> => {
  await database.reset();
  await seed(scenario);
  const before = await readState(database.db);
  const revisionBefore = await readLiveRevision();
  const idSource = makeIds(scenario.fixture);
  const clock = { now: () => now };
  const execute = makeProductionSystem({
    ...productionCommandSystemDependencies(),
    db: database.db,
    ids: idSource.source,
    clock,
  }).cells.manageResources.execute;

  const executeConcurrent = async (
    commands: readonly ManageResourcesCommand[],
  ): Promise<readonly CanonicalManageResourcesOutcome[]> => {
    let running:
      | Promise<readonly CanonicalManageResourcesOutcome[]>
      | undefined;
    await database.db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select id from production_locations where id = ${locationId} for update`,
      );
      running = Promise.all(
        commands.map((command) =>
          captureManageResourcesOutcome(execute, command),
        ),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    });
    return running ?? [];
  };

  const outcome = await runManageResourcesScenario({
    execute,
    executeConcurrent,
    scenario,
  });
  const workEvents = await readEvents(scenario);
  const payload = workEvents[0]?.payload;
  return {
    outcome,
    stateDelta: { before, after: await readState(database.db) },
    workEvents,
    idempotencyReceipt: isRecord(payload)
      ? (payload['_idempotency'] ?? null)
      : null,
    liveRevision: { before: revisionBefore, after: await readLiveRevision() },
    signals: [],
    issuedIds: idSource.issued(),
  };
};

const expectNoMutation = (observation: ManageResourcesObservation): void => {
  expect(observation.stateDelta.after).toEqual(observation.stateDelta.before);
  expect(observation.workEvents).toEqual([]);
  expect(observation.idempotencyReceipt).toBeNull();
  expect(observation.liveRevision.after).toBe(observation.liveRevision.before);
  expect(observation.issuedIds).toBe(0);
};

const successValue = (
  outcome: CanonicalManageResourcesOutcome | undefined,
): ManageResourcesResult | null =>
  outcome?.kind === 'success' ? outcome.value : null;

const outcomeCode = (
  outcome: CanonicalManageResourcesOutcome | undefined,
): string | null =>
  outcome?.kind === 'failure'
    ? outcome.failure.code
    : outcome?.kind === 'unexpected'
      ? outcome.error.code
      : null;

describe('production.manage-resources.v1 behavioral conformance', () => {
  it.each(manageResourcesScenarios)('$name', async (scenario) => {
    const observation = await observe(scenario);

    expect(observation.signals).toEqual([]);

    if (scenario.name.startsWith('preview reports')) {
      expect(observation.outcome).toEqual([
        {
          kind: 'success',
          value: expectedResult({ mode: 'dry_run', applied: false }),
        },
      ]);
      expectNoMutation(observation);
      return;
    }

    if (scenario.name.startsWith('weak array-order')) {
      const first = successValue(observation.outcome[0]);
      const second = successValue(observation.outcome[1]);
      expect(first?.configurationHash).toBe(configurationHash);
      expect(second?.configurationHash).toBe(configurationHash);
      expect(
        first?.operations.map((operation) => operation.naturalKey),
      ).toEqual([
        locationId,
        'washing',
        'drying',
        'washing:W-01',
        'drying:D-01',
        locationId,
      ]);
      expect(
        second?.operations.map((operation) => operation.naturalKey),
      ).toEqual([
        locationId,
        'drying',
        'washing',
        'drying:D-01',
        'washing:W-01',
        locationId,
      ]);
      expectNoMutation(observation);
      return;
    }

    if (scenario.name.startsWith('apply commits')) {
      const result = expectedResult({ mode: 'apply', applied: true });
      expect(observation.outcome).toEqual([{ kind: 'success', value: result }]);
      expect(observation.stateDelta.before).toEqual({
        location: null,
        stations: [],
        machines: [],
        configs: [],
      });
      expect(observation.stateDelta.after).toEqual({
        location: {
          id: locationId,
          businessId: ids.business,
          name: 'Manage Resources Conformance Facility',
          timezone: 'America/New_York',
          isActive: true,
          liveRevision: 1,
          updatedAt: now.toISOString(),
        },
        stations: [
          {
            id: ids.generated[1],
            locationId,
            kind: 'drying',
            label: 'Dry',
            sortOrder: 2,
            isActive: true,
          },
          {
            id: ids.generated[0],
            locationId,
            kind: 'washing',
            label: 'Wash',
            sortOrder: 1,
            isActive: true,
          },
        ],
        machines: [
          {
            id: ids.generated[3],
            locationId,
            stationId: ids.generated[1],
            stationKind: 'drying',
            label: 'D-01',
            manufacturerCapacityLbs: 30,
            effectiveCapacityLbs: 30,
            capacitySafetyMarginLbs: 0,
            isActive: true,
            updatedAt: now.toISOString(),
          },
          {
            id: ids.generated[2],
            locationId,
            stationId: ids.generated[0],
            stationKind: 'washing',
            label: 'W-01',
            manufacturerCapacityLbs: 60,
            effectiveCapacityLbs: 54,
            capacitySafetyMarginLbs: 6,
            isActive: true,
            updatedAt: now.toISOString(),
          },
        ],
        configs: [
          {
            id: ids.generated[4],
            locationId,
            pulseMinutes: 56,
            foldLbsPerFolderMinute: 2,
            algorithmVersion: 'fixed-pulse-ffd-v1',
            version: 1,
            stageFitAssertion: {
              sortingFits: true,
              washingFits: true,
              dryingFits: true,
              assertedBy: ids.actor,
              assertedAt: now.toISOString(),
            },
            assertedBy: ids.actor,
            publishedAt: now.toISOString(),
          },
        ],
      });
      expect(observation.workEvents).toEqual([
        {
          id: ids.generated[6],
          eventType: 'production_resources_bootstrapped',
          entityType: 'production_resource_manifest',
          entityId: ids.generated[5],
          actorId: ids.actor,
          expectedVersion: null,
          idempotencyKey: 'manage-resources-apply',
          payload: {
            result,
            _idempotency: {
              version: 1,
              command: {
                operation: 'production_resources_bootstrapped',
                locationId,
                actorId: ids.actor,
                target: {
                  entityType: 'production_resource_manifest',
                  entityId: locationId,
                },
                expectedVersion: null,
                payload: { dryRun: false, configurationHash },
              },
              result,
            },
          },
        },
      ]);
      expect(observation.idempotencyReceipt).toEqual(
        (observation.workEvents[0]?.payload as Record<string, unknown>)[
          '_idempotency'
        ],
      );
      expect(observation.liveRevision).toEqual({ before: 0, after: 1 });
      expect(observation.issuedIds).toBe(7);
      return;
    }

    if (scenario.name.startsWith('machine without')) {
      expect(observation.outcome).toEqual([
        {
          kind: 'failure',
          failure: {
            kind: 'validation',
            code: 'production_bootstrap_machine_station_missing',
            message:
              'Every production machine must reference a station in the same manifest.',
            safeMessage:
              'Every production machine must reference a station in the same manifest.',
            status: null,
          },
        },
      ]);
      expectNoMutation(observation);
      return;
    }

    if (scenario.name.startsWith('destructive and')) {
      const result = successValue(observation.outcome[0]);
      expect(result).toMatchObject({
        mode: 'apply',
        status: 'rejected',
        applied: false,
        replayed: false,
        operations: [
          {
            resourceType: 'scheduler_config',
            naturalKey: locationId,
            outcome: 'noop',
            changedFields: [],
          },
        ],
        rejections: [
          {
            resourceType: 'location',
            naturalKey: locationId,
            outcome: 'rejected',
            code: 'destructive_resource_deactivation',
          },
          {
            resourceType: 'station',
            naturalKey: 'washing',
            outcome: 'rejected',
            code: 'natural_key_change',
          },
          {
            resourceType: 'station',
            naturalKey: 'drying',
            outcome: 'rejected',
            code: 'destructive_resource_removal',
          },
          {
            resourceType: 'machine',
            naturalKey: 'washing:W-01',
            outcome: 'rejected',
            code: 'destructive_resource_deactivation',
          },
          {
            resourceType: 'machine',
            naturalKey: 'drying:D-01',
            outcome: 'rejected',
            code: 'destructive_resource_removal',
          },
        ],
        summary: { created: 0, updated: 0, noop: 1, rejected: 5 },
      });
      expectNoMutation(observation);
      return;
    }

    if (scenario.name.startsWith('updates and')) {
      const result = successValue(observation.outcome[0]);
      expect(result).toMatchObject({
        mode: 'apply',
        status: 'converged',
        applied: true,
        operations: [
          {
            resourceType: 'location',
            outcome: 'updated',
            changedFields: ['name', 'timezone'],
          },
          {
            resourceType: 'station',
            naturalKey: 'washing',
            outcome: 'updated',
            changedFields: ['label', 'sortOrder'],
          },
          {
            resourceType: 'station',
            naturalKey: 'drying',
            outcome: 'noop',
          },
          {
            resourceType: 'machine',
            naturalKey: 'washing:W-01',
            outcome: 'updated',
            changedFields: [
              'capacitySafetyMarginLbs',
              'effectiveCapacityLbs',
              'isActive',
              'manufacturerCapacityLbs',
            ],
          },
          {
            resourceType: 'machine',
            naturalKey: 'drying:D-01',
            outcome: 'noop',
          },
          {
            resourceType: 'scheduler_config',
            outcome: 'updated',
            changedFields: ['algorithmVersion', 'pulseMinutes'],
          },
        ],
        summary: { created: 0, updated: 4, noop: 2, rejected: 0 },
      });
      expect(observation.stateDelta.after.location).toMatchObject({
        businessId: ids.business,
        name: 'Updated Facility',
        timezone: 'America/Chicago',
        liveRevision: 1,
        updatedAt: now.toISOString(),
      });
      expect(
        observation.stateDelta.after.stations.find(
          (station) => station.kind === 'washing',
        ),
      ).toMatchObject({
        id: ids.storedStations[0],
        label: 'Wash Updated',
        sortOrder: 9,
        isActive: true,
      });
      expect(
        observation.stateDelta.after.machines.find(
          (machine) => machine.label === 'W-01',
        ),
      ).toMatchObject({
        id: ids.storedMachines[0],
        manufacturerCapacityLbs: 65,
        effectiveCapacityLbs: 58,
        capacitySafetyMarginLbs: 7,
        isActive: true,
        updatedAt: now.toISOString(),
      });
      expect(observation.stateDelta.after.configs).toHaveLength(2);
      expect(observation.stateDelta.after.configs[1]).toMatchObject({
        id: ids.generated[4],
        pulseMinutes: 42,
        algorithmVersion: 'fixed-pulse-ffd-v2',
        version: 2,
        assertedBy: ids.actor,
        publishedAt: now.toISOString(),
      });
      expect(observation.workEvents).toHaveLength(1);
      expect(observation.liveRevision).toEqual({ before: 0, after: 1 });
      expect(observation.issuedIds).toBe(7);
      return;
    }

    if (scenario.name.startsWith('fresh-key all-noop')) {
      const result = expectedResult({
        mode: 'apply',
        applied: true,
        operations: baseNoopOperations(),
      });
      expect(observation.outcome).toEqual([{ kind: 'success', value: result }]);
      expect(observation.stateDelta.after.location).toEqual({
        ...observation.stateDelta.before.location,
        liveRevision: 1,
        updatedAt: now.toISOString(),
      });
      expect(
        observation.stateDelta.after.machines.map((machine) => ({
          id: machine.id,
          updatedAt: machine.updatedAt,
        })),
      ).toEqual([
        { id: ids.storedMachines[1], updatedAt: now.toISOString() },
        { id: ids.storedMachines[0], updatedAt: now.toISOString() },
      ]);
      expect(observation.stateDelta.after.stations).toEqual(
        observation.stateDelta.before.stations,
      );
      expect(observation.stateDelta.after.configs).toEqual(
        observation.stateDelta.before.configs,
      );
      expect(observation.workEvents).toHaveLength(1);
      expect(observation.workEvents[0]).toMatchObject({
        id: ids.generated[5],
        entityId: ids.generated[4],
        idempotencyKey: 'manage-resources-noop',
        payload: { result },
      });
      expect(observation.idempotencyReceipt).toMatchObject({ result });
      expect(observation.liveRevision).toEqual({ before: 0, after: 1 });
      expect(observation.issuedIds).toBe(6);
      return;
    }

    if (scenario.name.startsWith('replay divergence')) {
      expect(successValue(observation.outcome[0])).toEqual(
        expectedResult({ mode: 'apply', applied: true }),
      );
      expect(successValue(observation.outcome[1])).toEqual(
        expectedResult({ mode: 'apply', applied: true, replayed: true }),
      );
      expect(observation.outcome[2]).toEqual({
        kind: 'failure',
        failure: {
          kind: 'conflict',
          code: 'production_idempotency_conflict',
          message:
            'The idempotency key belongs to a different production command.',
          safeMessage:
            'The idempotency key belongs to a different production command.',
          status: null,
        },
      });
      expect(successValue(observation.outcome[3])).toMatchObject({
        mode: 'dry_run',
        status: 'converged',
        applied: false,
        replayed: false,
        operations: [
          ...baseNoopOperations().slice(0, 5),
          {
            resourceType: 'scheduler_config',
            naturalKey: locationId,
            outcome: 'updated',
            changedFields: ['pulseMinutes'],
          },
        ],
        summary: { created: 0, updated: 1, noop: 5, rejected: 0 },
      });
      expect(observation.workEvents).toHaveLength(1);
      expect(observation.liveRevision).toEqual({ before: 0, after: 1 });
      expect(observation.issuedIds).toBe(7);
      return;
    }

    if (scenario.name.startsWith('malformed receipt')) {
      expect(observation.outcome).toEqual([
        {
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'production_idempotency_conflict',
            message:
              'The idempotency key belongs to a different production command.',
            safeMessage:
              'The idempotency key belongs to a different production command.',
            status: null,
          },
        },
      ]);
      expect(observation.stateDelta.after).toEqual(
        observation.stateDelta.before,
      );
      expect(observation.workEvents).toHaveLength(1);
      expect(observation.workEvents[0]?.id).toBe(ids.evidenceEvent);
      expect(observation.idempotencyReceipt).toMatchObject({
        version: 1,
        result: expect.not.objectContaining({ replayed: expect.anything() }),
      });
      expect(observation.liveRevision).toEqual({ before: 1, after: 1 });
      expect(observation.issuedIds).toBe(0);
      return;
    }

    if (scenario.name.startsWith('same-key race')) {
      expect(observation.outcome).toHaveLength(2);
      expect(
        observation.outcome.filter(({ kind }) => kind === 'success'),
      ).toHaveLength(2);
      expect(successValue(observation.outcome[0])).toMatchObject({
        mode: 'apply',
        status: 'converged',
        applied: true,
        replayed: false,
        operations: baseNoopOperations(),
        summary: { created: 0, updated: 0, noop: 6, rejected: 0 },
      });
      expect(successValue(observation.outcome[1])).toMatchObject({
        mode: 'apply',
        status: 'converged',
        applied: true,
        replayed: true,
        operations: baseNoopOperations(),
        summary: { created: 0, updated: 0, noop: 6, rejected: 0 },
      });
      expect(observation.stateDelta.after.configs).toEqual(
        observation.stateDelta.before.configs,
      );
      expect(observation.workEvents).toHaveLength(1);
      expect(observation.liveRevision).toEqual({ before: 0, after: 1 });
      expect(observation.issuedIds).toBe(6);
      return;
    }

    if (scenario.name.startsWith('location business ID')) {
      expect(successValue(observation.outcome[0])).toMatchObject({
        mode: 'apply',
        status: 'converged',
        applied: true,
        operations: [
          {
            resourceType: 'location',
            naturalKey: locationId,
            outcome: 'updated',
            changedFields: ['businessId'],
          },
          ...baseNoopOperations().slice(1),
        ],
        summary: { created: 0, updated: 1, noop: 5, rejected: 0 },
      });
      expect(observation.stateDelta.after.location).toMatchObject({
        businessId: ids.business,
        liveRevision: 1,
        updatedAt: now.toISOString(),
      });
      expect(observation.workEvents).toHaveLength(1);
      expect(observation.liveRevision).toEqual({ before: 0, after: 1 });
      expect(observation.issuedIds).toBe(6);
      return;
    }

    expect(scenario.name).toBe(
      'late event collision rolls all SQL back after issuing IDs',
    );
    expect(observation.outcome).toHaveLength(1);
    expect(outcomeCode(observation.outcome[0])).toBe(
      'production_bootstrap_failed',
    );
    expect(
      observation.outcome[0]?.kind === 'unexpected'
        ? observation.outcome[0].error
        : null,
    ).toMatchObject({
      kind: 'DatabaseError',
      code: 'production_bootstrap_failed',
      message: 'Production resources could not be bootstrapped.',
      safeMessage: 'Production resources could not be bootstrapped.',
      status: 503,
    });
    expect(observation.stateDelta.after).toEqual(observation.stateDelta.before);
    expect(observation.workEvents).toEqual([]);
    expect(observation.idempotencyReceipt).toBeNull();
    expect(observation.liveRevision).toEqual({ before: 1, after: 1 });
    expect(observation.issuedIds).toBe(7);
  });
});
