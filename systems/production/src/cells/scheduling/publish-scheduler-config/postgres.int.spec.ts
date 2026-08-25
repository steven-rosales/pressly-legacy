import { proveOperation } from '@pressly/testkit/operation-proof';
import { publishSchedulerConfigCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { asc, eq } from '@pressly/postgres/query';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect } from 'vitest';
import { publishSchedulerConfigContract } from './contract.ts';
import {
  makeExecutePublishSchedulerConfig,
  type ExecutePublishSchedulerConfig,
  type PublishSchedulerConfigRepository,
} from './execute.ts';
import {
  publishSchedulerConfigIdempotency,
  type StoredPublishSchedulerConfigWorkEvent,
} from './idempotency.ts';
import { makePublishSchedulerConfigPostgresRepository } from './postgres.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: ['work_events', 'scheduler_configs', 'production_locations'],
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

const ids = {
  actor: '22000000-0000-4000-8000-000000000001',
  config1: '22000000-0000-4000-8000-000000000002',
  event1: '22000000-0000-4000-8000-000000000003',
  config2: '22000000-0000-4000-8000-000000000004',
  event2: '22000000-0000-4000-8000-000000000005',
  raceConfig1: '22000000-0000-4000-8000-000000000006',
  raceEvent1: '22000000-0000-4000-8000-000000000007',
  raceConfig2: '22000000-0000-4000-8000-000000000008',
  raceEvent2: '22000000-0000-4000-8000-000000000009',
  rollbackConfig: '22000000-0000-4000-8000-000000000010',
  collisionEvent: '22000000-0000-4000-8000-000000000011',
} as const;

const locationId = 'location-publish-scheduler-config';
const businessId = '00000000-0000-4000-8000-000000000100';
const now = new Date('2026-08-22T14:00:00.000Z');

const seedLocation = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId,
    name: 'Publish Scheduler Config Facility',
    timezone: 'America/New_York',
  });
};

const idSource = (...values: readonly string[]): IdSource => {
  let index = 0;
  return {
    next: () =>
      values[index++] ??
      `32000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  };
};

const serializedCommand = (
  overrides: {
    foldLbsPerFolderMinute?: number;
    idempotencyKey?: string;
  } = {},
) => ({
  params: { locationId },
  body: {
    pulseMinutes: 56,
    foldLbsPerFolderMinute: overrides.foldLbsPerFolderMinute ?? 2,
    stageFitAssertion: {
      sortingFits: true as const,
      washingFits: true as const,
      dryingFits: true as const,
    },
    idempotencyKey:
      overrides.idempotencyKey ?? 'scheduler-config-postgres-command-1',
  },
  actorId: ids.actor,
});

const executeSerialized = async (
  execute: ExecutePublishSchedulerConfig,
  serialized: ReturnType<typeof serializedCommand>,
) => {
  const decoded = publishSchedulerConfigContract.input.decode(serialized);
  if (decoded.kind === 'invalid') return decoded;
  const outcome = await execute(decoded.value);
  return outcome.kind === 'success'
    ? {
        kind: 'success' as const,
        value: publishSchedulerConfigContract.output.encode(outcome.value),
      }
    : {
        kind: 'failure' as const,
        failure: publishSchedulerConfigContract.failure.encode(outcome.failure),
      };
};

const makeExecute = (
  idsSource: IdSource,
  repo: PublishSchedulerConfigRepository<StoredPublishSchedulerConfigWorkEvent> = makePublishSchedulerConfigPostgresRepository(
    {
      db: database.db,
      ids: idsSource,
    },
    productionTestSchema,
  ),
): ExecutePublishSchedulerConfig =>
  makeExecutePublishSchedulerConfig({
    repo,
    idempotency: publishSchedulerConfigIdempotency,
    clock: { now: () => now },
    ids: idsSource,
  });

describe('publish scheduler config serialized native Postgres cell', () => {
  proveOperation({
    operationId: 'production.publish-scheduler-config.v1',
    declaration: publishSchedulerConfigCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'commits each monotonic version and receipt once, advances live revision, replays, and rejects divergence',
        proves: [
          'postgres-commit',
          'same-payload-replay',
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seedLocation();
          const execute = makeExecute(
            idSource(ids.config1, ids.event1, ids.config2, ids.event2),
          );
          const first = serializedCommand();

          await expect(executeSerialized(execute, first)).resolves.toEqual({
            kind: 'success',
            value: {
              id: ids.config1,
              pulseMinutes: 56,
              foldLbsPerFolderMinute: 2,
              algorithmVersion: 'fixed-pulse-ffd-v2',
              version: 1,
              stageFitAssertion: {
                sortingFits: true,
                washingFits: true,
                dryingFits: true,
                assertedBy: ids.actor,
                assertedAt: now.toISOString(),
              },
              publishedAt: now.toISOString(),
            },
          });
          await expect(
            executeSerialized(execute, first),
          ).resolves.toMatchObject({
            kind: 'success',
            value: { id: ids.config1, version: 1 },
          });
          await expect(
            executeSerialized(
              execute,
              serializedCommand({ foldLbsPerFolderMinute: 3 }),
            ),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_idempotency_conflict',
            },
          });
          await expect(
            executeSerialized(
              execute,
              serializedCommand({
                foldLbsPerFolderMinute: 3,
                idempotencyKey: 'scheduler-config-postgres-command-2',
              }),
            ),
          ).resolves.toMatchObject({
            kind: 'success',
            value: { id: ids.config2, version: 2 },
          });

          const configs = await database.db
            .select()
            .from(productionTestSchema.schedulerConfigs)
            .orderBy(asc(productionTestSchema.schedulerConfigs.version));
          expect(configs).toHaveLength(2);
          expect(configs.map(({ id, version }) => ({ id, version }))).toEqual([
            { id: ids.config1, version: 1 },
            { id: ids.config2, version: 2 },
          ]);
          expect(configs[0]).toMatchObject({
            locationId,
            pulseMinutes: 56,
            foldLbsPerFolderMinute: 2,
            algorithmVersion: 'fixed-pulse-ffd-v2',
            assertedBy: ids.actor,
            publishedAt: now,
            stageFitAssertion: {
              sortingFits: true,
              washingFits: true,
              dryingFits: true,
              assertedBy: ids.actor,
              assertedAt: now.toISOString(),
            },
          });

          const events = await database.db
            .select()
            .from(productionTestSchema.workEvents)
            .orderBy(asc(productionTestSchema.workEvents.createdAt));
          expect(events).toHaveLength(2);
          expect(events[0]).toMatchObject({
            id: ids.event1,
            locationId,
            eventType: 'scheduler_config_published',
            entityType: 'scheduler_config',
            entityId: ids.config1,
            actorId: ids.actor,
            expectedVersion: null,
            idempotencyKey: 'scheduler-config-postgres-command-1',
            payload: {
              version: 1,
              _idempotency: {
                version: 1,
                command: {
                  operation: 'scheduler_config_published',
                  locationId,
                  actorId: ids.actor,
                  target: { entityType: 'scheduler_config', entityId: null },
                  expectedVersion: null,
                  payload: {
                    pulseMinutes: 56,
                    foldLbsPerFolderMinute: 2,
                    stageFitAssertion: {
                      sortingFits: true,
                      washingFits: true,
                      dryingFits: true,
                    },
                  },
                },
                result: {
                  id: ids.config1,
                  pulseMinutes: 56,
                  foldLbsPerFolderMinute: 2,
                  algorithmVersion: 'fixed-pulse-ffd-v2',
                  version: 1,
                  stageFitAssertion: {
                    sortingFits: true,
                    washingFits: true,
                    dryingFits: true,
                    assertedBy: ids.actor,
                    assertedAt: now.toISOString(),
                  },
                  publishedAt: now.toISOString(),
                },
              },
            },
          });

          const [location] = await database.db
            .select({
              liveRevision:
                productionTestSchema.productionLocations.liveRevision,
            })
            .from(productionTestSchema.productionLocations)
            .where(eq(productionTestSchema.productionLocations.id, locationId));
          expect(location?.liveRevision).toBe(2);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.publish-scheduler-config.v1',
    declaration: publishSchedulerConfigCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rejects scheduler_config_invalid before persistence without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seedLocation();
          const before = {
            configs: await database.db
              .select()
              .from(productionTestSchema.schedulerConfigs),
            events: await database.db
              .select()
              .from(productionTestSchema.workEvents),
          };
          const decoded = publishSchedulerConfigContract.input.decode(
            serializedCommand({ idempotencyKey: 'scheduler-config-invalid' }),
          );
          expect(decoded.kind).toBe('valid');
          if (decoded.kind === 'invalid') return;
          await expect(
            makeExecute(idSource(ids.config1, ids.event1))({
              ...decoded.value,
              pulseMinutes: 0,
            }),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'validation',
              code: 'scheduler_config_invalid',
            },
          });
          await expect(
            Promise.all([
              database.db.select().from(productionTestSchema.schedulerConfigs),
              database.db.select().from(productionTestSchema.workEvents),
            ]),
          ).resolves.toEqual([before.configs, before.events]);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.publish-scheduler-config.v1',
    declaration: publishSchedulerConfigCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes concurrent config publications into monotonic versions',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seedLocation();
          const first = makeExecute(idSource(ids.raceConfig1, ids.raceEvent1));
          const second = makeExecute(idSource(ids.raceConfig2, ids.raceEvent2));

          const outcomes = await Promise.all([
            executeSerialized(
              first,
              serializedCommand({
                idempotencyKey: 'scheduler-config-race-command-1',
              }),
            ),
            executeSerialized(
              second,
              serializedCommand({
                foldLbsPerFolderMinute: 3,
                idempotencyKey: 'scheduler-config-race-command-2',
              }),
            ),
          ]);

          expect(outcomes.every(({ kind }) => kind === 'success')).toBe(true);

          const configs = await database.db
            .select()
            .from(productionTestSchema.schedulerConfigs)
            .orderBy(asc(productionTestSchema.schedulerConfigs.version));
          const events = await database.db
            .select()
            .from(productionTestSchema.workEvents);
          const [location] = await database.db
            .select({
              liveRevision:
                productionTestSchema.productionLocations.liveRevision,
            })
            .from(productionTestSchema.productionLocations)
            .where(eq(productionTestSchema.productionLocations.id, locationId));
          expect(configs.map(({ version }) => version)).toEqual([1, 2]);
          expect(events).toHaveLength(2);
          expect(location?.liveRevision).toBe(2);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.publish-scheduler-config.v1',
    declaration: publishSchedulerConfigCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back the config and live-revision increment when receipt append fails',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seedLocation();
          await database.db.insert(productionTestSchema.workEvents).values({
            id: ids.collisionEvent,
            locationId,
            eventType: 'fixture_event',
            entityType: 'fixture',
            entityId: ids.collisionEvent,
            actorId: ids.actor,
            expectedVersion: null,
            idempotencyKey: 'fixture-existing-event',
            payload: {},
          });
          const execute = makeExecute(
            idSource(ids.rollbackConfig, ids.collisionEvent),
          );

          await expect(
            executeSerialized(
              execute,
              serializedCommand({
                idempotencyKey: 'scheduler-config-rollback-command-1',
              }),
            ),
          ).rejects.toMatchObject({
            kind: 'DatabaseError',
            code: 'scheduler_config_publish_failed',
            status: 503,
          });

          await expect(
            database.db
              .select()
              .from(productionTestSchema.schedulerConfigs)
              .where(
                eq(
                  productionTestSchema.schedulerConfigs.id,
                  ids.rollbackConfig,
                ),
              ),
          ).resolves.toEqual([]);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
          const [location] = await database.db
            .select({
              liveRevision:
                productionTestSchema.productionLocations.liveRevision,
            })
            .from(productionTestSchema.productionLocations)
            .where(eq(productionTestSchema.productionLocations.id, locationId));
          expect(location?.liveRevision).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.publish-scheduler-config.v1',
    declaration: publishSchedulerConfigCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'collapses concurrent identical config publication to one version',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seedLocation();
          const request = serializedCommand({
            idempotencyKey: 'scheduler-config-same-key-race',
          });
          const outcomes = await Promise.all([
            executeSerialized(
              makeExecute(
                idSource(
                  '73000000-0000-4000-8000-000000000001',
                  '73000000-0000-4000-8000-000000000002',
                ),
              ),
              request,
            ),
            executeSerialized(
              makeExecute(
                idSource(
                  '74000000-0000-4000-8000-000000000001',
                  '74000000-0000-4000-8000-000000000002',
                ),
              ),
              request,
            ),
          ]);

          expect(outcomes.every((outcome) => outcome.kind === 'success')).toBe(
            true,
          );
          await expect(
            database.db.select().from(productionTestSchema.schedulerConfigs),
          ).resolves.toHaveLength(1);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
        },
      },
    ],
  });
});
