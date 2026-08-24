import { proveOperation } from '@pressly/testkit/operation-proof';
import { assignStageMachinesCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { eq } from '@pressly/postgres/query';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeExecuteAssignStageMachines } from './execute.ts';
import { assignStageMachinesIdempotency } from './idempotency.ts';
import { makeAssignStageMachinesPostgresRepository } from './postgres.ts';

const tables = [
  'work_events',
  'production_order_stage_attempts',
  'stage_machine_assignments',
  'stage_runs',
  'production_batch_orders',
  'production_batches',
  'production_runs',
  'schedule_runs',
  'scheduler_configs',
  'production_machines',
  'production_stations',
  'production_shifts',
  'production_locations',
] as const;
const databaseUrl = getTestDatabaseUrl(
  'PRESSLY_TEST_DATABASE_URL',
  'postgres://pressly:pressly@localhost:55434/pressly_test',
);
const resetDatabaseUrl = getTestDatabaseUrl(
  'PRESSLY_TEST_DATABASE_RESET_URL',
  databaseUrl,
);
const database = createTestDatabaseRuntime({
  databaseUrl,
  resetDatabaseUrl,
  tableNames: tables,
  maxConnections: 4,
});
beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  shift: '10000000-0000-4000-8000-000000000002',
  station: '10000000-0000-4000-8000-000000000003',
  config: '10000000-0000-4000-8000-000000000004',
  schedule: '10000000-0000-4000-8000-000000000005',
  run: '10000000-0000-4000-8000-000000000006',
  batch: '10000000-0000-4000-8000-000000000007',
  stage: '10000000-0000-4000-8000-000000000008',
  machine: '10000000-0000-4000-8000-000000000009',
} as const;
const locationId = 'location-1';
const now = new Date('2026-08-21T15:00:00.000Z');

const idSource = (): IdSource => {
  let next = 1;
  return {
    next: () => `20000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
  };
};

const seed = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId: '00000000-0000-4000-8000-000000000100',
    name: 'Assignment Facility',
    timezone: 'America/New_York',
  });
  await database.db.insert(productionTestSchema.productionShifts).values({
    id: ids.shift,
    locationId,
    startsAt: new Date('2026-08-21T08:00:00.000Z'),
    endsAt: new Date('2026-08-21T22:00:00.000Z'),
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
  });
  await database.db.insert(productionTestSchema.stations).values({
    id: ids.station,
    locationId,
    kind: 'washing',
    label: 'Washer',
    sortOrder: 1,
  });
  await database.db.insert(productionTestSchema.machines).values({
    id: ids.machine,
    locationId,
    stationId: ids.station,
    label: 'W1',
    effectiveCapacityLbs: 50,
  });
  await database.db.insert(productionTestSchema.schedulerConfigs).values({
    id: ids.config,
    locationId,
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: 1,
    stageFitAssertion: {},
    assertedBy: ids.actor,
  });
  await database.db.insert(productionTestSchema.scheduleRuns).values({
    id: ids.schedule,
    locationId,
    productionShiftId: ids.shift,
    schedulerConfigId: ids.config,
    status: 'accepted',
    inputSnapshot: {},
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: {},
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 1,
    makespanMinutes: 56,
    plannedCompletionAt: new Date('2026-08-21T18:00:00.000Z'),
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: now,
    acceptedBy: ids.actor,
  });
  await database.db.insert(productionTestSchema.productionRuns).values({
    id: ids.run,
    locationId,
    productionShiftId: ids.shift,
    scheduleRunId: ids.schedule,
    status: 'started',
    startedAt: now,
    plannedCompletionAt: new Date('2026-08-21T18:00:00.000Z'),
  });
  await database.db.insert(productionTestSchema.productionBatches).values({
    id: ids.batch,
    locationId,
    productionRunId: ids.run,
    sequenceIndex: 0,
    status: 'sorting',
    pulseCapacityLbs: 100,
    derivedWeightLbs: 40,
    pulseMinutes: 56,
    plannedDoneAt: new Date('2026-08-21T18:00:00.000Z'),
    startedAt: now,
    membershipFrozenAt: now,
    membershipFrozenBy: ids.actor,
  });
  await database.db.insert(productionTestSchema.stageRuns).values({
    id: ids.stage,
    locationId,
    productionBatchId: ids.batch,
    stationId: ids.station,
    stageKind: 'washing',
    status: 'planned',
    plannedStartAt: new Date('2026-08-21T16:00:00.000Z'),
    plannedEndAt: new Date('2026-08-21T17:00:00.000Z'),
    version: 2,
  });
};

const command = (key = 'machine-command-1') => ({
  locationId,
  stageRunId: ids.stage,
  actorId: ids.actor,
  expectedVersion: 2,
  idempotencyKey: key,
  machineIds: [ids.machine],
});

describe('assign stage machines native Postgres cell', () => {
  proveOperation({
    operationId: 'production.assign-stage-machines.v1',
    declaration: assignStageMachinesCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'commits once, advances live revision, and replays',
        proves: ['postgres-commit', 'same-payload-replay'],
        run: async () => {
          await seed();
          const execute = makeExecuteAssignStageMachines({
            repo: makeAssignStageMachinesPostgresRepository(
              {
                db: database.db,
                ids: idSource(),
              },
              productionTestSchema,
            ),
            idempotency: assignStageMachinesIdempotency,
            policy: productionRules,
            clock: { now: () => now },
          });
          await expect(execute(command())).resolves.toMatchObject({
            kind: 'success',
            value: { version: 3, replayed: false },
          });
          await expect(execute(command())).resolves.toMatchObject({
            kind: 'success',
            value: { version: 3, replayed: true },
          });
          const assignments = await database.db
            .select()
            .from(productionTestSchema.stageMachineAssignments);
          const events = await database.db
            .select()
            .from(productionTestSchema.workEvents);
          const [location] = await database.db
            .select({
              revision: productionTestSchema.productionLocations.liveRevision,
            })
            .from(productionTestSchema.productionLocations)
            .where(eq(productionTestSchema.productionLocations.id, locationId));
          expect(assignments).toHaveLength(1);
          expect(assignments[0]).toMatchObject({
            stageRunId: ids.stage,
            machineId: ids.machine,
            status: 'planned',
          });
          expect(events).toHaveLength(1);
          expect(events[0]).toMatchObject({ eventType: 'machine_assigned' });
          expect(location?.revision).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.assign-stage-machines.v1',
    declaration: assignStageMachinesCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes same-version assignments so exactly one commits',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seed();
          const makeExecute = () =>
            makeExecuteAssignStageMachines({
              repo: makeAssignStageMachinesPostgresRepository(
                {
                  db: database.db,
                  ids: idSource(),
                },
                productionTestSchema,
              ),
              idempotency: assignStageMachinesIdempotency,
              policy: productionRules,
              clock: { now: () => now },
            });
          const outcomes = await Promise.all([
            makeExecute()(command('machine-race-1')),
            makeExecute()(command('machine-race-2')),
          ]);
          expect(
            outcomes.filter((outcome) => outcome.kind === 'success'),
          ).toHaveLength(1);
          expect(
            outcomes.filter((outcome) => outcome.kind === 'failure'),
          ).toEqual([
            expect.objectContaining({
              failure: expect.objectContaining({
                code: 'stage_run_version_conflict',
              }),
            }),
          ]);
          expect(
            await database.db.select().from(productionTestSchema.workEvents),
          ).toHaveLength(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.assign-stage-machines.v1',
    declaration: assignStageMachinesCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'returns typed not-found without writing assignment state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed();
          const execute = makeExecuteAssignStageMachines({
            repo: makeAssignStageMachinesPostgresRepository(
              { db: database.db, ids: idSource() },
              productionTestSchema,
            ),
            idempotency: assignStageMachinesIdempotency,
            policy: productionRules,
            clock: { now: () => now },
          });
          const [stageBefore] = await database.db
            .select()
            .from(productionTestSchema.stageRuns)
            .where(eq(productionTestSchema.stageRuns.id, ids.stage));

          await expect(
            execute({
              ...command('machine-missing-stage'),
              stageRunId: ids.config,
            }),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'not_found',
              code: 'stage_run_not_found',
            },
          });

          const [stageAfter] = await database.db
            .select()
            .from(productionTestSchema.stageRuns)
            .where(eq(productionTestSchema.stageRuns.id, ids.stage));
          expect(stageAfter).toEqual(stageBefore);
          await expect(
            database.db
              .select()
              .from(productionTestSchema.stageMachineAssignments),
          ).resolves.toEqual([]);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toEqual([]);
          const [location] = await database.db
            .select({
              revision: productionTestSchema.productionLocations.liveRevision,
            })
            .from(productionTestSchema.productionLocations)
            .where(eq(productionTestSchema.productionLocations.id, locationId));
          expect(location?.revision).toBe(0);
        },
      },
      {
        name: 'rejects divergent assignment reuse without changing the committed graph',
        proves: [
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seed();
          const execute = makeExecuteAssignStageMachines({
            repo: makeAssignStageMachinesPostgresRepository(
              { db: database.db, ids: idSource() },
              productionTestSchema,
            ),
            idempotency: assignStageMachinesIdempotency,
            policy: productionRules,
            clock: { now: () => now },
          });
          await expect(execute(command())).resolves.toMatchObject({
            kind: 'success',
          });
          const beforeAssignments = await database.db
            .select()
            .from(productionTestSchema.stageMachineAssignments);

          await expect(
            execute({ ...command(), machineIds: [] }),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_idempotency_conflict',
            },
          });
          await expect(
            database.db
              .select()
              .from(productionTestSchema.stageMachineAssignments),
          ).resolves.toEqual(beforeAssignments);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
        },
      },
      {
        name: 'collapses concurrent identical assignment commands after the locked context',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seed();
          const makeExecute = () =>
            makeExecuteAssignStageMachines({
              repo: makeAssignStageMachinesPostgresRepository(
                { db: database.db, ids: idSource() },
                productionTestSchema,
              ),
              idempotency: assignStageMachinesIdempotency,
              policy: productionRules,
              clock: { now: () => now },
            });
          const input = command('machine-same-key-race');

          const outcomes = await Promise.all([
            makeExecute()(input),
            makeExecute()(input),
          ]);

          expect(outcomes.every(({ kind }) => kind === 'success')).toBe(true);
          await expect(
            database.db
              .select()
              .from(productionTestSchema.stageMachineAssignments),
          ).resolves.toHaveLength(1);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
        },
      },
      {
        name: 'rolls back assignment and stage version when the late event insert fails',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seed();
          const collision = '20000000-0000-4000-8000-000000000002';
          await database.db.insert(productionTestSchema.workEvents).values({
            id: collision,
            locationId,
            eventType: 'fixture_event',
            entityType: 'fixture',
            entityId: ids.stage,
            actorId: ids.actor,
            idempotencyKey: 'fixture-assignment-event',
            payload: {},
          });
          const execute = makeExecuteAssignStageMachines({
            repo: makeAssignStageMachinesPostgresRepository(
              { db: database.db, ids: idSource() },
              productionTestSchema,
            ),
            idempotency: assignStageMachinesIdempotency,
            policy: productionRules,
            clock: { now: () => now },
          });

          await expect(
            execute(command('machine-late-event-failure')),
          ).rejects.toMatchObject({ code: 'machine_assignment_failed' });
          await expect(
            database.db
              .select()
              .from(productionTestSchema.stageMachineAssignments),
          ).resolves.toHaveLength(0);
          const [stage] = await database.db
            .select({ version: productionTestSchema.stageRuns.version })
            .from(productionTestSchema.stageRuns)
            .where(eq(productionTestSchema.stageRuns.id, ids.stage));
          expect(stage?.version).toBe(2);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
        },
      },
    ],
  });
});
