import { proveOperation } from '@pressly/testkit/operation-proof';
import { updateShiftCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { createPostgresRuntime } from '@pressly/postgres/client';
import { eq, sql } from '@pressly/postgres/query';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { productionRules } from '../../../model/public.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import { makeExecuteUpdateShift, type ExecuteUpdateShift } from './execute.ts';
import { updateShiftIdempotency } from './idempotency.ts';
import { makeUpdateShiftPostgresRepository } from './postgres.ts';
import type { ProductionShiftStatus, UpdateShiftCommand } from './types.ts';

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
  tableNames: [
    'work_events',
    'production_runs',
    'schedule_runs',
    'scheduler_configs',
    'production_shifts',
    'production_locations',
  ],
  maxConnections: 4,
});
const faultDatabase = createPostgresRuntime({
  databaseUrl: resetDatabaseUrl,
  schema: productionTestSchema,
  maxConnections: 1,
});

const ids = {
  actor: '25000000-0000-4000-8000-000000000001',
  shift: '25000000-0000-4000-8000-000000000002',
  config: '25000000-0000-4000-8000-000000000003',
  schedule: '25000000-0000-4000-8000-000000000004',
  run: '25000000-0000-4000-8000-000000000005',
  event: '25000000-0000-4000-8000-000000000006',
  eventB: '25000000-0000-4000-8000-000000000007',
  collision: '25000000-0000-4000-8000-000000000008',
} as const;

const locationId = 'location-update-shift';
const businessId = '00000000-0000-4000-8000-000000000100';
const originalStart = new Date('2026-08-22T13:00:00.000Z');
const originalEnd = new Date('2026-08-22T21:00:00.000Z');
const now = new Date('2026-08-22T12:00:00.000Z');

type TransactionObservation = 'err' | 'ok' | 'threw';

const removeScheduleCasFault = async (): Promise<void> => {
  await faultDatabase.db.execute(
    sql`drop trigger if exists update_shift_conformance_schedule_cas on schedule_runs`,
  );
  await faultDatabase.db.execute(
    sql`drop function if exists update_shift_conformance_reject_schedule_update()`,
  );
};

const installScheduleCasFault = async (): Promise<void> => {
  await faultDatabase.db.execute(
    sql`create function update_shift_conformance_reject_schedule_update() returns trigger language plpgsql as $$ begin return null; end; $$`,
  );
  await faultDatabase.db.execute(
    sql`create trigger update_shift_conformance_schedule_cas before update on schedule_runs for each row execute function update_shift_conformance_reject_schedule_update()`,
  );
};

beforeAll(async () => {
  await database.check();
  await faultDatabase.check();
});
beforeEach(async () => {
  await removeScheduleCasFault();
  await database.reset();
});
afterAll(async () => {
  await removeScheduleCasFault();
  await database.close();
  await faultDatabase.close();
});

const idSource = (...values: readonly string[]): IdSource => {
  let index = 0;
  return {
    next: () =>
      values[index++] ??
      `35000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  };
};

const seed = async (
  input: {
    shiftStatus?: ProductionShiftStatus;
    shiftVersion?: number;
    scheduleStatus?: 'accepted' | 'draft' | null;
    runExists?: boolean;
  } = {},
): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId,
    name: 'Update Shift Conformance Facility',
    timezone: 'America/New_York',
  });
  await database.db.insert(productionTestSchema.productionShifts).values({
    id: ids.shift,
    locationId,
    startsAt: originalStart,
    endsAt: originalEnd,
    timezone: 'America/New_York',
    effectiveFolderCount: 2,
    status: input.shiftStatus ?? 'open',
    version: input.shiftVersion ?? 1,
  });

  const scheduleStatus = input.scheduleStatus ?? null;
  if (scheduleStatus === null && input.runExists !== true) return;
  await database.db.insert(productionTestSchema.schedulerConfigs).values({
    id: ids.config,
    locationId,
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: 1,
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
    },
    assertedBy: ids.actor,
  });
  const effectiveScheduleStatus = scheduleStatus ?? 'accepted';
  await database.db.insert(productionTestSchema.scheduleRuns).values({
    id: ids.schedule,
    locationId,
    productionShiftId: ids.shift,
    schedulerConfigId: ids.config,
    status: effectiveScheduleStatus,
    inputSnapshot: {},
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: {},
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 0,
    makespanMinutes: 0,
    plannedCompletionAt: originalStart,
    warnings: [],
    acknowledgedWarningCodes: [],
    ...(effectiveScheduleStatus === 'accepted'
      ? { acceptedAt: now, acceptedBy: ids.actor }
      : {}),
  });
  if (input.runExists !== true) return;
  await database.db.insert(productionTestSchema.productionRuns).values({
    id: ids.run,
    locationId,
    productionShiftId: ids.shift,
    scheduleRunId: ids.schedule,
    status: 'started',
    startedAt: now,
    plannedCompletionAt: originalEnd,
  });
};

const command = (
  overrides: Partial<UpdateShiftCommand> = {},
): UpdateShiftCommand => ({
  locationId,
  productionShiftId: ids.shift,
  startsAt: '2026-08-22T12:30:00.000Z',
  endsAt: '2026-08-22T22:00:00.000Z',
  effectiveFolderCount: 4,
  expectedVersion: 1,
  actorId: ids.actor,
  idempotencyKey: 'update-shift-conformance-1',
  ...overrides,
});

const observer =
  (
    observations: TransactionObservation[],
  ): ProductionResultUnitOfWorkObserver =>
  (unitOfWork) => ({
    transaction: async (work) => {
      try {
        const outcome = await unitOfWork.transaction(work);
        observations.push(outcome.tag);
        return outcome;
      } catch (error) {
        observations.push('threw');
        throw error;
      }
    },
  });

const makeExecute = (
  input: {
    eventIds?: readonly string[];
    observations?: TransactionObservation[];
    planSuperseded?: () => void;
  } = {},
): ExecuteUpdateShift => {
  const events = idSource(...(input.eventIds ?? [ids.event]));
  return makeExecuteUpdateShift({
    repo: makeUpdateShiftPostgresRepository(
      {
        db: database.db,
        ids: events,
        ...(input.observations === undefined
          ? {}
          : { observeUnitOfWork: observer(input.observations) }),
      },
      productionTestSchema,
    ),
    idempotency: updateShiftIdempotency,
    policy: productionRules,
    clock: { now: () => new Date(now) },
    ...(input.planSuperseded === undefined
      ? {}
      : { signals: { planSuperseded: input.planSuperseded } }),
  });
};

const readShift = async () => {
  const [shift] = await database.db
    .select()
    .from(productionTestSchema.productionShifts)
    .where(eq(productionTestSchema.productionShifts.id, ids.shift));
  return shift;
};

const readSchedule = async () => {
  const [schedule] = await database.db
    .select()
    .from(productionTestSchema.scheduleRuns)
    .where(eq(productionTestSchema.scheduleRuns.id, ids.schedule));
  return schedule;
};

const readLiveRevision = async (): Promise<number> => {
  const [location] = await database.db
    .select({
      liveRevision: productionTestSchema.productionLocations.liveRevision,
    })
    .from(productionTestSchema.productionLocations)
    .where(eq(productionTestSchema.productionLocations.id, locationId));
  return location?.liveRevision ?? -1;
};

describe('update shift native Postgres cell', () => {
  proveOperation({
    operationId: 'production.update-shift.v1',
    declaration: updateShiftCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'updates accepted or draft plans once then replays and rejects divergence',
        proves: [
          'postgres-commit',
          'expected-rejection-no-partial-write',
          'same-payload-replay',
          'divergent-key-conflict',
        ],
        run: async () => {
          for (const scheduleStatus of ['accepted', 'draft'] as const) {
            await database.reset();

            await seed({ scheduleStatus });
            const observations: TransactionObservation[] = [];
            const planSuperseded = vi.fn();
            const execute = makeExecute({ observations, planSuperseded });
            const input = command();

            await expect(execute(input)).resolves.toEqual({
              kind: 'success',
              value: {
                productionShift: {
                  id: ids.shift,
                  locationId,
                  startsAt: input.startsAt,
                  endsAt: input.endsAt,
                  timezone: 'America/New_York',
                  effectiveFolderCount: 4,
                  status: 'open',
                  version: 2,
                },
                supersededScheduleRunId: ids.schedule,
                replayed: false,
              },
            });
            await expect(execute(input)).resolves.toMatchObject({
              kind: 'success',
              value: { replayed: true, supersededScheduleRunId: ids.schedule },
            });
            await expect(
              execute(command({ effectiveFolderCount: 5 })),
            ).resolves.toMatchObject({
              kind: 'failure',
              failure: {
                kind: 'conflict',
                code: 'production_idempotency_conflict',
              },
            });

            expect(observations).toEqual(['ok', 'ok', 'err']);
            expect(planSuperseded).toHaveBeenCalledOnce();
            expect(await readShift()).toMatchObject({
              startsAt: new Date(input.startsAt),
              endsAt: new Date(input.endsAt),
              effectiveFolderCount: 4,
              version: 2,
            });
            expect(await readSchedule()).toMatchObject({
              status: 'superseded',
              supersededAt: now,
            });
            expect(await readLiveRevision()).toBe(1);

            const events = await database.db
              .select()
              .from(productionTestSchema.workEvents);
            expect(events).toEqual([
              expect.objectContaining({
                id: ids.event,
                locationId,
                eventType: 'production_shift_updated',
                entityType: 'production_shift',
                entityId: ids.shift,
                actorId: ids.actor,
                expectedVersion: 1,
                idempotencyKey: input.idempotencyKey,
                payload: {
                  changedFields: ['startsAt', 'endsAt', 'effectiveFolderCount'],
                  previous: {
                    startsAt: originalStart.toISOString(),
                    endsAt: originalEnd.toISOString(),
                    effectiveFolderCount: 2,
                    version: 1,
                  },
                  current: {
                    startsAt: input.startsAt,
                    endsAt: input.endsAt,
                    effectiveFolderCount: 4,
                    version: 2,
                  },
                  supersededScheduleRunId: ids.schedule,
                  _idempotency: {
                    version: 1,
                    command: {
                      operation: 'production_shift_updated',
                      locationId,
                      actorId: ids.actor,
                      target: {
                        entityType: 'production_shift',
                        entityId: ids.shift,
                      },
                      expectedVersion: 1,
                      payload: {
                        startsAt: input.startsAt,
                        endsAt: input.endsAt,
                        effectiveFolderCount: 4,
                      },
                    },
                    result: {
                      productionShift: {
                        id: ids.shift,
                        locationId,
                        startsAt: input.startsAt,
                        endsAt: input.endsAt,
                        timezone: 'America/New_York',
                        effectiveFolderCount: 4,
                        status: 'open',
                        version: 2,
                      },
                      supersededScheduleRunId: ids.schedule,
                      replayed: false,
                    },
                  },
                },
              }),
            ]);
          }
        },
      },
    ],
  });

  it('records a no-op audit while preserving shift, plan, revision semantics, and signal silence', async () => {
    await seed({ scheduleStatus: 'accepted' });
    const observations: TransactionObservation[] = [];
    const planSuperseded = vi.fn();
    const execute = makeExecute({ observations, planSuperseded });

    await expect(
      execute(
        command({
          startsAt: originalStart.toISOString(),
          endsAt: originalEnd.toISOString(),
          effectiveFolderCount: 2,
          idempotencyKey: 'update-shift-noop-1',
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'success',
      value: {
        productionShift: { version: 1 },
        supersededScheduleRunId: null,
        replayed: false,
      },
    });
    expect(observations).toEqual(['ok']);
    expect(planSuperseded).not.toHaveBeenCalled();
    expect(await readShift()).toMatchObject({ version: 1 });
    expect(await readSchedule()).toMatchObject({ status: 'accepted' });
    expect(await readLiveRevision()).toBe(1);
    const events = await database.db
      .select()
      .from(productionTestSchema.workEvents);
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      changedFields: [],
      previous: { version: 1 },
      current: { version: 1 },
      supersededScheduleRunId: null,
    });
  });

  it.each([
    {
      name: 'missing shift',
      seedInput: null,
      input: { productionShiftId: ids.config },
      code: 'production_shift_not_found',
    },
    {
      name: 'stale version',
      seedInput: {},
      input: { expectedVersion: 2 },
      code: 'production_shift_version_conflict',
    },
    {
      name: 'closed shift',
      seedInput: { shiftStatus: 'closed' as const },
      input: {},
      code: 'production_shift_closed',
    },
    {
      name: 'started shift',
      seedInput: { scheduleStatus: 'accepted' as const, runExists: true },
      input: {},
      code: 'production_shift_already_started',
    },
  ])('returns $name without mutation or signal', async (testCase) => {
    if (testCase.seedInput === null) {
      await seed();
    } else {
      await seed(testCase.seedInput);
    }
    const observations: TransactionObservation[] = [];
    const planSuperseded = vi.fn();
    const execute = makeExecute({ observations, planSuperseded });
    await expect(execute(command(testCase.input))).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: testCase.code },
    });
    expect(observations).toEqual(['err']);
    expect(planSuperseded).not.toHaveBeenCalled();
    expect(await readShift()).toMatchObject({ version: 1 });
    expect(
      await database.db.select().from(productionTestSchema.workEvents),
    ).toEqual([]);
    expect(await readLiveRevision()).toBe(0);
  });

  proveOperation({
    operationId: 'production.update-shift.v1',
    declaration: updateShiftCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes same-version edits so exactly one commits',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seed();
          const observationsA: TransactionObservation[] = [];
          const observationsB: TransactionObservation[] = [];
          const first = makeExecute({
            eventIds: [ids.event],
            observations: observationsA,
          });
          const second = makeExecute({
            eventIds: [ids.eventB],
            observations: observationsB,
          });
          const outcomes = await Promise.all([
            first(command({ idempotencyKey: 'update-shift-race-a' })),
            second(
              command({
                endsAt: '2026-08-22T23:00:00.000Z',
                effectiveFolderCount: 5,
                idempotencyKey: 'update-shift-race-b',
              }),
            ),
          ]);
          expect(
            outcomes.filter((outcome) => outcome.kind === 'success'),
          ).toHaveLength(1);
          expect(outcomes).toContainEqual(
            expect.objectContaining({
              kind: 'failure',
              failure: expect.objectContaining({
                code: 'production_shift_version_conflict',
              }),
            }),
          );
          expect([observationsA, observationsB].flat().sort()).toEqual([
            'err',
            'ok',
          ]);
          expect(await readShift()).toMatchObject({ version: 2 });
          expect(
            await database.db.select().from(productionTestSchema.workEvents),
          ).toHaveLength(1);
          expect(await readLiveRevision()).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.update-shift.v1',
    declaration: updateShiftCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back shift and plan when the work-event append fails late',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seed({ scheduleStatus: 'accepted' });
          await database.db.insert(productionTestSchema.workEvents).values({
            id: ids.collision,
            locationId,
            eventType: 'fixture_event',
            entityType: 'fixture',
            entityId: ids.collision,
            actorId: ids.actor,
            expectedVersion: null,
            idempotencyKey: 'update-shift-existing-event',
            payload: {},
          });
          const revisionBefore = await readLiveRevision();
          const observations: TransactionObservation[] = [];
          const planSuperseded = vi.fn();
          const execute = makeExecute({
            eventIds: [ids.collision],
            observations,
            planSuperseded,
          });

          await expect(
            execute(command({ idempotencyKey: 'update-shift-late-fault' })),
          ).rejects.toMatchObject({
            code: 'production_shift_update_failed',
            status: 503,
          });
          expect(observations).toEqual(['threw']);
          expect(planSuperseded).not.toHaveBeenCalled();
          expect(await readShift()).toMatchObject({ version: 1 });
          expect(await readSchedule()).toMatchObject({ status: 'accepted' });
          expect(
            await database.db.select().from(productionTestSchema.workEvents),
          ).toHaveLength(1);
          expect(await readLiveRevision()).toBe(revisionBefore);
        },
      },
    ],
  });

  it('rolls back the shift on a typed schedule CAS conflict', async () => {
    await seed({ scheduleStatus: 'accepted' });
    await installScheduleCasFault();
    const observations: TransactionObservation[] = [];
    const planSuperseded = vi.fn();
    const execute = makeExecute({ observations, planSuperseded });

    await expect(
      execute(command({ idempotencyKey: 'update-shift-schedule-cas' })),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_shift_schedule_version_conflict' },
    });
    expect(observations).toEqual(['err']);
    expect(planSuperseded).not.toHaveBeenCalled();
    expect(await readShift()).toMatchObject({ version: 1 });
    expect(await readSchedule()).toMatchObject({ status: 'accepted' });
    expect(
      await database.db.select().from(productionTestSchema.workEvents),
    ).toEqual([]);
    expect(await readLiveRevision()).toBe(0);
  });

  proveOperation({
    operationId: 'production.update-shift.v1',
    declaration: updateShiftCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'collapses concurrent identical shift edits after the location lock',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seed({ scheduleStatus: 'accepted' });
          const input = command({
            idempotencyKey: 'update-shift-same-key-race',
          });
          const outcomes = await Promise.all([
            makeExecute({
              eventIds: ['77000000-0000-4000-8000-000000000001'],
            })(input),
            makeExecute({
              eventIds: ['78000000-0000-4000-8000-000000000001'],
            })(input),
          ]);

          expect(outcomes.every(({ kind }) => kind === 'success')).toBe(true);
          expect(
            outcomes
              .flatMap((outcome) =>
                outcome.kind === 'success' ? [outcome.value.replayed] : [],
              )
              .sort(),
          ).toEqual([false, true]);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
          expect(await readLiveRevision()).toBe(1);
          expect(await readShift()).toMatchObject({ version: 2 });
        },
      },
    ],
  });
});
