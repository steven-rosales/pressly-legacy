import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { asc, eq, sql } from '@pressly/postgres/query';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { proveOperation } from '@pressly/testkit/operation-proof';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { manageResourcesContract } from './contract.ts';
import { manageResourcesCellDeclaration } from './cell.ts';
import {
  makeExecuteManageResources,
  type ExecuteManageResources,
  type ManageResourcesRepository,
} from './execute.ts';
import {
  manageResourcesIdempotency,
  type StoredManageResourcesWorkEvent,
} from './idempotency.ts';
import { makeManageResourcesPostgresRepository } from './postgres.ts';
import type {
  ManageResourcesCommand,
  ManageResourcesResult,
  ProductionBootstrapManifest,
} from './types.ts';

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
  maxConnections: 6,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : {
        resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
      }),
});

beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

const locationId = 'location-manage-resources';
const businessId = '00000000-0000-4000-8000-000000000100';
const actorId = '19000000-0000-4000-8000-000000000001';
const now = new Date('2026-08-21T15:00:00.000Z');
const later = new Date('2026-08-21T16:00:00.000Z');
const configurationHash =
  '8e53691148de5f2bd785b4301a9eb5912403eea4e301cb146839b2177917d74d';
const exactIds = Object.freeze({
  sorting: '19000000-0000-4000-8000-000000000010',
  washing: '19000000-0000-4000-8000-000000000011',
  drying: '19000000-0000-4000-8000-000000000012',
  folding: '19000000-0000-4000-8000-000000000013',
  washer: '19000000-0000-4000-8000-000000000014',
  dryer: '19000000-0000-4000-8000-000000000015',
  config: '19000000-0000-4000-8000-000000000016',
  entity: '19000000-0000-4000-8000-000000000017',
  event: '19000000-0000-4000-8000-000000000018',
  collision: '19000000-0000-4000-8000-000000000099',
});

const manifest = (): ProductionBootstrapManifest => ({
  schemaVersion: 1,
  location: {
    id: locationId,
    businessId,
    name: 'Manage Resources Facility',
    timezone: 'America/New_York',
    isActive: true,
  },
  stations: (
    ['sorting', 'washing', 'drying', 'folding_packaging'] as const
  ).map((kind, index) => ({
    locationId,
    kind,
    label: kind,
    sortOrder: index + 1,
    isActive: true,
  })),
  machines: [
    {
      locationId,
      stationKind: 'washing',
      label: 'W-01',
      manufacturerCapacityLbs: 60,
      effectiveCapacityLbs: 54,
      capacitySafetyMarginLbs: 6,
      isActive: true,
    },
    {
      locationId,
      stationKind: 'drying',
      label: 'D-01',
      manufacturerCapacityLbs: 30,
      effectiveCapacityLbs: 30,
      capacitySafetyMarginLbs: 0,
      isActive: true,
    },
  ],
  schedulerConfig: {
    locationId,
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v1',
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
    },
  },
});

const expectedOperations = [
  {
    resourceType: 'location',
    naturalKey: locationId,
    outcome: 'created',
    changedFields: ['resource'],
  },
  ...manifest().stations.map((station) => ({
    resourceType: 'station' as const,
    naturalKey: station.kind,
    outcome: 'created' as const,
    changedFields: ['resource'],
  })),
  ...manifest().machines.map((machine) => ({
    resourceType: 'machine' as const,
    naturalKey: `${machine.stationKind}:${machine.label}`,
    outcome: 'created' as const,
    changedFields: ['resource'],
  })),
  {
    resourceType: 'scheduler_config',
    naturalKey: locationId,
    outcome: 'created',
    changedFields: ['resource'],
  },
] as const;

const appliedResult = (): ManageResourcesResult => ({
  mode: 'apply',
  status: 'converged',
  configurationHash,
  operations: expectedOperations,
  rejections: [],
  summary: { created: 8, updated: 0, noop: 0, rejected: 0 },
  replayed: false,
  applied: true,
});

const command = (
  input: {
    dryRun?: boolean;
    key?: string;
    manifest?: ProductionBootstrapManifest;
  } = {},
): ManageResourcesCommand => ({
  manifest: input.manifest ?? manifest(),
  dryRun: input.dryRun ?? false,
  idempotencyKey: input.key ?? 'manage-resources-apply-1',
  actorId,
});

const idsFrom = (values: readonly string[] = []): IdSource => {
  let index = 0;
  return {
    next: () =>
      values[index++] ??
      `29000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  };
};

const exactIdSource = (): IdSource =>
  idsFrom([
    exactIds.sorting,
    exactIds.washing,
    exactIds.drying,
    exactIds.folding,
    exactIds.washer,
    exactIds.dryer,
    exactIds.config,
    exactIds.entity,
    exactIds.event,
  ]);

const makeRepository = (
  input: {
    ids?: IdSource;
    observeUnitOfWork?: Parameters<
      typeof makeManageResourcesPostgresRepository
    >[0]['observeUnitOfWork'];
  } = {},
) =>
  makeManageResourcesPostgresRepository(
    {
      db: database.db,
      ids: input.ids ?? idsFrom(),
      ...(input.observeUnitOfWork === undefined
        ? {}
        : { observeUnitOfWork: input.observeUnitOfWork }),
    },
    productionTestSchema,
  );

const makeExecute = (
  input: {
    ids?: IdSource;
    at?: Date;
    repo?: ManageResourcesRepository<StoredManageResourcesWorkEvent>;
    observeUnitOfWork?: Parameters<
      typeof makeManageResourcesPostgresRepository
    >[0]['observeUnitOfWork'];
  } = {},
): ExecuteManageResources =>
  makeExecuteManageResources({
    repo:
      input.repo ??
      makeRepository({
        ...(input.ids === undefined ? {} : { ids: input.ids }),
        ...(input.observeUnitOfWork === undefined
          ? {}
          : { observeUnitOfWork: input.observeUnitOfWork }),
      }),
    idempotency: manageResourcesIdempotency,
    clock: { now: () => input.at ?? now },
  });

const executeSerialized = async (
  execute: ExecuteManageResources,
  value: ManageResourcesCommand,
): Promise<unknown> => {
  const decoded = manageResourcesContract.input.decode(value);
  if (decoded.kind === 'invalid') return decoded;
  const outcome = await execute(decoded.value);
  return outcome.kind === 'success'
    ? {
        kind: 'success',
        value: manageResourcesContract.output.encode(outcome.value),
      }
    : {
        kind: 'failure',
        failure: manageResourcesContract.failure.encode(outcome.failure),
      };
};

const readState = async () => {
  const [location] = await database.db
    .select({
      id: productionTestSchema.productionLocations.id,
      businessId: productionTestSchema.productionLocations.businessId,
      name: productionTestSchema.productionLocations.name,
      timezone: productionTestSchema.productionLocations.timezone,
      isActive: productionTestSchema.productionLocations.isActive,
      liveRevision: productionTestSchema.productionLocations.liveRevision,
      updatedAt: productionTestSchema.productionLocations.updatedAt,
    })
    .from(productionTestSchema.productionLocations)
    .where(eq(productionTestSchema.productionLocations.id, locationId));
  const stations = await database.db
    .select({
      id: productionTestSchema.stations.id,
      kind: productionTestSchema.stations.kind,
      label: productionTestSchema.stations.label,
      sortOrder: productionTestSchema.stations.sortOrder,
      isActive: productionTestSchema.stations.isActive,
    })
    .from(productionTestSchema.stations)
    .where(eq(productionTestSchema.stations.locationId, locationId))
    .orderBy(asc(productionTestSchema.stations.sortOrder));
  const machines = await database.db
    .select({
      id: productionTestSchema.machines.id,
      stationKind: productionTestSchema.stations.kind,
      label: productionTestSchema.machines.label,
      manufacturerCapacityLbs:
        productionTestSchema.machines.manufacturerCapacityLbs,
      effectiveCapacityLbs: productionTestSchema.machines.effectiveCapacityLbs,
      capacitySafetyMarginLbs:
        productionTestSchema.machines.capacitySafetyMarginLbs,
      isActive: productionTestSchema.machines.isActive,
      updatedAt: productionTestSchema.machines.updatedAt,
    })
    .from(productionTestSchema.machines)
    .innerJoin(
      productionTestSchema.stations,
      eq(
        productionTestSchema.stations.id,
        productionTestSchema.machines.stationId,
      ),
    )
    .where(eq(productionTestSchema.machines.locationId, locationId))
    .orderBy(asc(productionTestSchema.machines.label));
  const configs = await database.db
    .select({
      id: productionTestSchema.schedulerConfigs.id,
      pulseMinutes: productionTestSchema.schedulerConfigs.pulseMinutes,
      foldLbsPerFolderMinute:
        productionTestSchema.schedulerConfigs.foldLbsPerFolderMinute,
      algorithmVersion: productionTestSchema.schedulerConfigs.algorithmVersion,
      version: productionTestSchema.schedulerConfigs.version,
      stageFitAssertion:
        productionTestSchema.schedulerConfigs.stageFitAssertion,
      assertedBy: productionTestSchema.schedulerConfigs.assertedBy,
      publishedAt: productionTestSchema.schedulerConfigs.publishedAt,
    })
    .from(productionTestSchema.schedulerConfigs)
    .where(eq(productionTestSchema.schedulerConfigs.locationId, locationId))
    .orderBy(asc(productionTestSchema.schedulerConfigs.version));
  const events = await database.db
    .select({
      id: productionTestSchema.workEvents.id,
      eventType: productionTestSchema.workEvents.eventType,
      entityType: productionTestSchema.workEvents.entityType,
      entityId: productionTestSchema.workEvents.entityId,
      actorId: productionTestSchema.workEvents.actorId,
      expectedVersion: productionTestSchema.workEvents.expectedVersion,
      idempotencyKey: productionTestSchema.workEvents.idempotencyKey,
      payload: productionTestSchema.workEvents.payload,
    })
    .from(productionTestSchema.workEvents)
    .where(eq(productionTestSchema.workEvents.locationId, locationId))
    .orderBy(asc(productionTestSchema.workEvents.id));
  return {
    location: location ?? null,
    stations,
    machines,
    configs,
    events,
  };
};

describe('manage resources native Postgres cell', () => {
  it('previews exact creation without any database effect', async () => {
    await expect(
      executeSerialized(makeExecute(), command({ dryRun: true })),
    ).resolves.toEqual({
      kind: 'success',
      value: {
        ...appliedResult(),
        mode: 'dry_run',
        applied: false,
      },
    });
    expect(await readState()).toEqual({
      location: null,
      stations: [],
      machines: [],
      configs: [],
      events: [],
    });
  });

  proveOperation({
    operationId: 'production.manage-resources.v1',
    declaration: manageResourcesCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'applies exact rows, IDs, event, receipt and revision then replays',
        proves: [
          'postgres-commit',
          'same-payload-replay',
          'divergent-key-conflict',
        ],
        run: async () => {
          const observeUnitOfWork = vi.fn((unitOfWork) => unitOfWork);
          const execute = makeExecute({
            ids: exactIdSource(),
            observeUnitOfWork,
          });
          await expect(executeSerialized(execute, command())).resolves.toEqual({
            kind: 'success',
            value: appliedResult(),
          });
          await expect(executeSerialized(execute, command())).resolves.toEqual({
            kind: 'success',
            value: { ...appliedResult(), replayed: true },
          });
          await expect(
            executeSerialized(
              execute,
              command({
                manifest: {
                  ...manifest(),
                  stations: [...manifest().stations].reverse(),
                  machines: [...manifest().machines].reverse(),
                },
              }),
            ),
          ).resolves.toEqual({
            kind: 'success',
            value: { ...appliedResult(), replayed: true },
          });
          await expect(
            executeSerialized(
              execute,
              command({
                manifest: {
                  ...manifest(),
                  schedulerConfig: {
                    ...manifest().schedulerConfig,
                    pulseMinutes: 42,
                  },
                },
              }),
            ),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: { code: 'production_idempotency_conflict' },
          });
          expect(observeUnitOfWork).toHaveBeenCalledOnce();

          const state = await readState();
          expect(state.location).toEqual({
            id: locationId,
            businessId,
            name: 'Manage Resources Facility',
            timezone: 'America/New_York',
            isActive: true,
            liveRevision: 1,
            updatedAt: now,
          });
          expect(state.stations.map(({ id, kind }) => ({ id, kind }))).toEqual([
            { id: exactIds.sorting, kind: 'sorting' },
            { id: exactIds.washing, kind: 'washing' },
            { id: exactIds.drying, kind: 'drying' },
            { id: exactIds.folding, kind: 'folding_packaging' },
          ]);
          expect(state.machines).toEqual([
            {
              id: exactIds.dryer,
              stationKind: 'drying',
              label: 'D-01',
              manufacturerCapacityLbs: 30,
              effectiveCapacityLbs: 30,
              capacitySafetyMarginLbs: 0,
              isActive: true,
              updatedAt: now,
            },
            {
              id: exactIds.washer,
              stationKind: 'washing',
              label: 'W-01',
              manufacturerCapacityLbs: 60,
              effectiveCapacityLbs: 54,
              capacitySafetyMarginLbs: 6,
              isActive: true,
              updatedAt: now,
            },
          ]);
          expect(state.configs).toEqual([
            {
              id: exactIds.config,
              pulseMinutes: 56,
              foldLbsPerFolderMinute: 2,
              algorithmVersion: 'fixed-pulse-ffd-v1',
              version: 1,
              stageFitAssertion: {
                sortingFits: true,
                washingFits: true,
                dryingFits: true,
                assertedBy: actorId,
                assertedAt: now.toISOString(),
              },
              assertedBy: actorId,
              publishedAt: now,
            },
          ]);
          expect(state.events).toEqual([
            {
              id: exactIds.event,
              eventType: 'production_resources_bootstrapped',
              entityType: 'production_resource_manifest',
              entityId: exactIds.entity,
              actorId,
              expectedVersion: null,
              idempotencyKey: 'manage-resources-apply-1',
              payload: {
                result: appliedResult(),
                _idempotency: {
                  version: 1,
                  command: {
                    operation: 'production_resources_bootstrapped',
                    locationId,
                    actorId,
                    target: {
                      entityType: 'production_resource_manifest',
                      entityId: locationId,
                    },
                    expectedVersion: null,
                    payload: { dryRun: false, configurationHash },
                  },
                  result: appliedResult(),
                },
              },
            },
          ]);
        },
      },
    ],
  });

  it('fresh-key noop apply rewrites timestamps and emits without a config version', async () => {
    await executeSerialized(makeExecute({ ids: exactIdSource() }), command());
    const outcome = await executeSerialized(
      makeExecute({ at: later }),
      command({ key: 'manage-resources-apply-2' }),
    );
    expect(outcome).toMatchObject({
      kind: 'success',
      value: {
        status: 'converged',
        applied: true,
        replayed: false,
        summary: { created: 0, updated: 0, noop: 8, rejected: 0 },
      },
    });
    const state = await readState();
    expect(state.location).toMatchObject({ liveRevision: 2, updatedAt: later });
    expect(
      state.machines.every((machine) => +machine.updatedAt === +later),
    ).toBe(true);
    expect(state.configs).toHaveLength(1);
    expect(state.events).toHaveLength(2);
  });

  it('updates every mutable resource family and appends config version two', async () => {
    await executeSerialized(makeExecute({ ids: exactIdSource() }), command());
    const desired = manifest();
    const changedBusinessId = '00000000-0000-4000-8000-000000000200';
    const changed: ProductionBootstrapManifest = {
      ...desired,
      location: {
        ...desired.location,
        businessId: changedBusinessId,
        name: 'Updated Facility',
        timezone: 'America/Chicago',
      },
      stations: desired.stations.map((station) =>
        station.kind === 'washing'
          ? { ...station, label: 'Wash Updated', sortOrder: 9 }
          : station,
      ),
      machines: desired.machines.map((machine) =>
        machine.label === 'W-01'
          ? {
              ...machine,
              manufacturerCapacityLbs: 65,
              effectiveCapacityLbs: 58,
              capacitySafetyMarginLbs: 7,
            }
          : machine,
      ),
      schedulerConfig: {
        ...desired.schedulerConfig,
        pulseMinutes: 42,
        algorithmVersion: 'fixed-pulse-ffd-v2',
      },
    };
    const updateOutcome = await executeSerialized(
      makeExecute({ at: later }),
      command({ key: 'manage-resources-update-1', manifest: changed }),
    );
    expect(updateOutcome).toMatchObject({
      kind: 'success',
      value: {
        summary: { created: 0, updated: 4, noop: 4, rejected: 0 },
      },
    });
    expect(
      (updateOutcome as { value: { operations: unknown[] } }).value
        .operations[0],
    ).toMatchObject({
      resourceType: 'location',
      changedFields: ['businessId', 'name', 'timezone'],
    });
    const state = await readState();
    expect(state.location).toMatchObject({
      businessId,
      name: 'Updated Facility',
      timezone: 'America/Chicago',
      liveRevision: 2,
    });
    expect(state.stations).toContainEqual(
      expect.objectContaining({
        kind: 'washing',
        label: 'Wash Updated',
        sortOrder: 9,
      }),
    );
    expect(state.machines).toContainEqual(
      expect.objectContaining({
        label: 'W-01',
        manufacturerCapacityLbs: 65,
        effectiveCapacityLbs: 58,
        capacitySafetyMarginLbs: 7,
      }),
    );
    expect(state.configs).toHaveLength(2);
    expect(state.configs[1]).toMatchObject({
      version: 2,
      pulseMinutes: 42,
      algorithmVersion: 'fixed-pulse-ffd-v2',
    });
  });

  proveOperation({
    operationId: 'production.manage-resources.v1',
    declaration: manageResourcesCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'returns ordered destructive rejections with no apply-side mutation',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await executeSerialized(
            makeExecute({ ids: exactIdSource() }),
            command(),
          );
          const before = await readState();
          const desired = manifest();
          const rejected: ProductionBootstrapManifest = {
            ...desired,
            location: { ...desired.location, isActive: false },
            machines: [desired.machines[0]!],
          };
          await expect(
            executeSerialized(
              makeExecute(),
              command({
                key: 'manage-resources-rejected-1',
                manifest: rejected,
              }),
            ),
          ).resolves.toMatchObject({
            kind: 'success',
            value: {
              status: 'rejected',
              applied: false,
              rejections: [
                { code: 'destructive_resource_deactivation' },
                { code: 'destructive_resource_removal' },
              ],
            },
          });
          expect(await readState()).toEqual(before);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.manage-resources.v1',
    declaration: manageResourcesCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'waits for the shared location scheduling lock before changing resources or config',
        proves: ['declared-concurrency-race'],
        run: async () => {
          let releaseLock = (): void => undefined;
          const holdLock = new Promise<void>((resolve) => {
            releaseLock = resolve;
          });
          let markLocked = (): void => undefined;
          const lockHeld = new Promise<void>((resolve) => {
            markLocked = resolve;
          });
          const holder = database.db.transaction(async (transaction) => {
            await transaction.execute(
              sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
            );
            markLocked();
            await holdLock;
          });
          await lockHeld;

          let markRequested = (): void => undefined;
          const lockRequested = new Promise<void>((resolve) => {
            markRequested = resolve;
          });
          const base = makeRepository({ ids: exactIdSource() });
          const lockedRepository: ManageResourcesRepository<StoredManageResourcesWorkEvent> =
            {
              transaction: (work) =>
                base.transaction((repository) =>
                  work({
                    ...repository,
                    lockLocationScheduling: async (selectedLocationId) => {
                      markRequested();
                      await repository.lockLocationScheduling(
                        selectedLocationId,
                      );
                    },
                  }),
                ),
            };
          const outcome = executeSerialized(
            makeExecute({ repo: lockedRepository }),
            command({ key: 'manage-resources-shared-lock' }),
          );
          await lockRequested;
          expect(await readState()).toEqual({
            location: null,
            stations: [],
            machines: [],
            configs: [],
            events: [],
          });

          releaseLock();
          await holder;
          await expect(outcome).resolves.toMatchObject({
            kind: 'success',
            value: { applied: true, replayed: false },
          });
          const state = await readState();
          expect(state.configs).toHaveLength(1);
          expect(state.events).toHaveLength(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.manage-resources.v1',
    declaration: manageResourcesCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'collapses concurrent identical applies after the location lock',
        proves: ['same-key-concurrency'],
        run: async () => {
          let arrivals = 0;
          let release = (): void => undefined;
          const bothRead = new Promise<void>((resolve) => {
            release = resolve;
          });
          const wrap = (
            base: ManageResourcesRepository<StoredManageResourcesWorkEvent>,
          ): ManageResourcesRepository<StoredManageResourcesWorkEvent> => ({
            transaction: (work) =>
              base.transaction((repo) =>
                work({
                  ...repo,
                  findWorkEvent: async (key) => {
                    const value = await repo.findWorkEvent(key);
                    arrivals += 1;
                    if (arrivals === 2) release();
                    await bothRead;
                    return value;
                  },
                }),
              ),
          });
          const executions = await Promise.all([
            executeSerialized(
              makeExecute({ repo: wrap(makeRepository({ ids: idsFrom() })) }),
              command({ key: 'manage-resources-race-1' }),
            ),
            executeSerialized(
              makeExecute({
                repo: wrap(
                  makeRepository({
                    ids: idsFrom(
                      Array.from(
                        { length: 9 },
                        (_, index) =>
                          `39000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
                      ),
                    ),
                  }),
                ),
              }),
              command({ key: 'manage-resources-race-1' }),
            ),
          ]);
          expect(executions).toHaveLength(2);
          expect(executions).toEqual(
            expect.arrayContaining([
              {
                kind: 'success',
                value: expect.objectContaining({ replayed: false }),
              },
              {
                kind: 'success',
                value: expect.objectContaining({ replayed: true }),
              },
            ]),
          );
          const state = await readState();
          expect(state.events).toHaveLength(1);
          expect(state.location).toMatchObject({ liveRevision: 1 });
          expect(state.configs).toHaveLength(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.manage-resources.v1',
    declaration: manageResourcesCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back all resource writes and revision after a late event collision',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await database.db
            .insert(productionTestSchema.productionLocations)
            .values({
              id: locationId,
              businessId,
              name: 'Existing Facility',
              timezone: 'America/New_York',
              isActive: true,
            });
          await database.db.insert(productionTestSchema.workEvents).values({
            id: exactIds.collision,
            locationId,
            eventType: 'fixture',
            entityType: 'production_resource_manifest',
            entityId: exactIds.entity,
            actorId,
            idempotencyKey: 'fixture-event',
            payload: {},
          });
          const before = await readState();
          const rollbackIds = [
            exactIds.sorting,
            exactIds.washing,
            exactIds.drying,
            exactIds.folding,
            exactIds.washer,
            exactIds.dryer,
            exactIds.config,
            '49000000-0000-4000-8000-000000000001',
            exactIds.collision,
          ];
          let issuedIds = 0;
          await expect(
            executeSerialized(
              makeExecute({
                ids: {
                  next: () => rollbackIds[issuedIds++]!,
                },
              }),
              command({ key: 'manage-resources-rollback-1' }),
            ),
          ).rejects.toMatchObject({
            code: 'production_bootstrap_failed',
            status: 503,
          });
          expect(issuedIds).toBe(9);
          expect(await readState()).toEqual(before);
        },
      },
    ],
  });
});
