import { proveOperation } from '@pressly/testkit/operation-proof';
import { createScheduleCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { createPostgresRuntime } from '@pressly/postgres/client';
import { sql } from '@pressly/postgres/query';
import type { IdSource } from '@pressly/cells/id-source';
import * as result from '@pressly/cells/result';
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
import type { SchedulingOutput } from '../../../model/production-schedule/model.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import { makeExecuteCreateSchedule } from './execute.ts';
import { createScheduleIdempotency } from './idempotency.ts';
import { makeCreateSchedulePostgresRepository } from './postgres.ts';
import type { CreateScheduleCommand, CreateSchedulePolicy } from './types.ts';

const databaseUrl = getTestDatabaseUrl(
  'PRESSLY_TEST_DATABASE_URL',
  'postgres://pressly:pressly@localhost:55434/pressly_test',
);
const resetDatabaseUrl = getTestDatabaseUrl(
  'PRESSLY_TEST_DATABASE_RESET_URL',
  databaseUrl,
);
const db = createTestDatabaseRuntime({
  databaseUrl,
  resetDatabaseUrl,
  tableNames: [
    'work_events',
    'production_runs',
    'schedule_runs',
    'production_shift_selected_orders',
    'production_shift_selections',
    'scheduler_configs',
    'production_orders',
    'order_demands',
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
const id = {
  business: '00000000-0000-4000-8000-000000000100',
  actor: '26000000-0000-4000-8000-000000000001',
  order: '26000000-0000-4000-8000-000000000002',
  fulfillment: '26000000-0000-4000-8000-000000000003',
  demand: '26000000-0000-4000-8000-000000000004',
  productionOrder: '26000000-0000-4000-8000-000000000005',
  shift: '26000000-0000-4000-8000-000000000006',
  config: '26000000-0000-4000-8000-000000000007',
  oldSchedule: '26000000-0000-4000-8000-000000000008',
  schedule: '26000000-0000-4000-8000-000000000009',
  event: '26000000-0000-4000-8000-000000000010',
  collision: '26000000-0000-4000-8000-000000000011',
} as const;
const locationId = 'location-create-schedule';
const now = new Date('2026-08-22T12:00:00.000Z');
const output: SchedulingOutput = {
  algorithmVersion: 'fixed-pulse-ffd-v2',
  inputSnapshotHash: 'a'.repeat(64),
  outputPlanHash: 'b'.repeat(64),
  canonicalOutput: '{"batches":[]}',
  pulseMinutes: 56,
  pulseCapacityLbs: 100,
  batchCount: 0,
  makespanMinutes: 0,
  plannedCompletionAt: '2026-08-22T21:00:00.000Z',
  batches: [],
  unplacedOrderIds: [],
  warnings: [],
};
const command = (
  patch: Partial<CreateScheduleCommand> = {},
): CreateScheduleCommand => ({
  locationId,
  productionShiftId: id.shift,
  schedulerConfigId: id.config,
  idempotencyKey: 'create-schedule-pg-1',
  actorId: id.actor,
  ...patch,
});
const source = (...values: string[]): IdSource => {
  let i = 0;
  return {
    next: () =>
      values[i++] ?? `36000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  };
};
type Observation = 'ok' | 'err' | 'threw';
const observer =
  (seen: Observation[]): ProductionResultUnitOfWorkObserver =>
  (unit) => ({
    transaction: async (work) => {
      try {
        const result = await unit.transaction(work);
        seen.push(result.tag);
        return result;
      } catch (error) {
        seen.push('threw');
        throw error;
      }
    },
  });
const make = (
  values: readonly string[] = [id.schedule, id.event],
  seen?: Observation[],
  signal?: () => void,
  proposedOutput: SchedulingOutput = output,
  clock: Readonly<{ now: () => Date }> = { now: () => new Date(now) },
  policy: CreateSchedulePolicy = productionRules,
) => {
  const ids = source(...values);
  return makeExecuteCreateSchedule({
    repo: makeCreateSchedulePostgresRepository(
      {
        db: db.db,
        ids,
        ...(seen === undefined ? {} : { observeUnitOfWork: observer(seen) }),
      },
      productionTestSchema,
    ),
    idempotency: createScheduleIdempotency,
    scheduler: {
      propose: (input) => {
        expect(input.orders.map((order) => order.id)).toEqual([
          id.productionOrder,
        ]);
        return proposedOutput;
      },
    },
    policy,
    clock,
    ids,
    ...(signal === undefined ? {} : { signals: { planSuperseded: signal } }),
  });
};
const seed = async (
  options: { selection?: boolean; current?: boolean } = {},
) => {
  await db.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId: id.business,
    name: 'Schedule Facility',
    timezone: 'America/New_York',
  });
  await db.db.insert(productionTestSchema.productionShifts).values({
    id: id.shift,
    locationId,
    startsAt: new Date('2026-08-22T13:00:00.000Z'),
    endsAt: new Date('2026-08-22T21:00:00.000Z'),
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
    version: 1,
  });
  await db.db.insert(productionTestSchema.schedulerConfigs).values({
    id: id.config,
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
    assertedBy: id.actor,
  });
  if (options.selection !== false) {
    await db.db.insert(productionTestSchema.orderDemands).values({
      id: id.demand,
      fulfillmentId: id.fulfillment,
      fulfillmentVersion: 1,
      projectionHash: 'c'.repeat(64),
      admissionState: 'released',
      commercialState: 'open',
      displayReference: 'SCHEDULE-1',
      locationId,
      revisionAt: now,
      phase: 'production_released',
      estimatedWeightLbs: 20,
      estimatedWeightSource: 'test',
      dueAt: new Date('2026-08-22T20:00:00.000Z'),
    });
    await db.db.insert(productionTestSchema.productionOrders).values({
      id: id.productionOrder,
      orderDemandId: id.demand,
      locationId,
      dueAt: new Date('2026-08-22T20:00:00.000Z'),
      operationalStatus: 'eligible',
      executionStatus: 'unassigned',
      resolutionState: 'open',
      derivedWeightLbs: 20,
      bagCount: 1,
      bagCountSource: 'operator_intake',
      intakeRecordedAt: now,
      intakeVersion: 1,
      eligibleAt: now,
      version: 1,
    });
    await db.db.insert(productionTestSchema.productionShiftSelections).values({
      productionShiftId: id.shift,
      locationId,
      version: 1,
      selectedBy: id.actor,
    });
    await db.db
      .insert(productionTestSchema.productionShiftSelectedOrders)
      .values({
        productionShiftId: id.shift,
        locationId,
        productionOrderId: id.productionOrder,
        selectedBy: id.actor,
      });
  }
  if (options.current === true)
    await db.db.insert(productionTestSchema.scheduleRuns).values({
      id: id.oldSchedule,
      locationId,
      productionShiftId: id.shift,
      schedulerConfigId: id.config,
      status: 'accepted',
      inputSnapshot: {},
      inputSnapshotHash: 'e'.repeat(64),
      outputPlan: {},
      outputPlanHash: 'f'.repeat(64),
      algorithmVersion: 'fixed-pulse-ffd-v2',
      pulseCapacityLbs: 100,
      batchCount: 0,
      makespanMinutes: 0,
      plannedCompletionAt: new Date(output.plannedCompletionAt),
      warnings: [],
      acknowledgedWarningCodes: [],
      acceptedAt: now,
      acceptedBy: id.actor,
    });
};
const removeFault = async () => {
  await faultDatabase.db.execute(
    sql`drop trigger if exists create_schedule_cas_fault on schedule_runs`,
  );
  await faultDatabase.db.execute(
    sql`drop function if exists create_schedule_reject_update()`,
  );
};
beforeAll(async () => {
  await db.check();
  await faultDatabase.check();
});
beforeEach(async () => {
  await removeFault();
  await db.reset();
});
afterAll(async () => {
  await removeFault();
  await db.close();
  await faultDatabase.close();
});
describe('create schedule native Postgres cell', () => {
  proveOperation({
    operationId: 'production.create-schedule.v1',
    declaration: createScheduleCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'stores deterministic snapshots/hashes, event and live revision',
        proves: ['postgres-commit'],
        run: async () => {
          await seed();
          const seen: Observation[] = [];
          await expect(make(undefined, seen)(command())).resolves.toMatchObject(
            {
              kind: 'success',
              value: {
                scheduleRunId: id.schedule,
                inputSnapshotHash: output.inputSnapshotHash,
                outputPlanHash: output.outputPlanHash,
                status: 'draft',
              },
            },
          );
          expect(seen).toEqual(['ok']);
          const [row] = await db.db
            .select()
            .from(productionTestSchema.scheduleRuns);
          expect(row).toMatchObject({
            inputSnapshotHash: output.inputSnapshotHash,
            outputPlanHash: output.outputPlanHash,
            outputPlan: expect.objectContaining({
              canonicalOutput: output.canonicalOutput,
            }),
          });
          expect(
            (row?.inputSnapshot as { orders: { id: string }[] }).orders.map(
              (x) => x.id,
            ),
          ).toEqual([id.productionOrder]);
          expect(
            await db.db.select().from(productionTestSchema.workEvents),
          ).toHaveLength(1);
          const [location] = await db.db
            .select()
            .from(productionTestSchema.productionLocations);
          expect(location?.liveRevision).toBe(1);
        },
      },
    ],
  });
  proveOperation({
    operationId: 'production.create-schedule.v1',
    declaration: createScheduleCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rejects production_shift_window_invalid without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed({ current: true });
          const before = {
            schedules: await db.db
              .select()
              .from(productionTestSchema.scheduleRuns),
            shifts: await db.db
              .select()
              .from(productionTestSchema.productionShifts),
            events: await db.db.select().from(productionTestSchema.workEvents),
          };
          const seen: Observation[] = [];
          await expect(
            make(undefined, seen, undefined, output, {
              now: () => new Date(Number.NaN),
            })(command({ idempotencyKey: 'invalid-shift-window' })),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_shift_window_invalid',
            },
          });
          expect(seen).toEqual(['err']);
          await expect(
            Promise.all([
              db.db.select().from(productionTestSchema.scheduleRuns),
              db.db.select().from(productionTestSchema.productionShifts),
              db.db.select().from(productionTestSchema.workEvents),
            ]),
          ).resolves.toEqual([before.schedules, before.shifts, before.events]);
        },
      },
      {
        name: 'rejects schedule_current_plan_state_invalid without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed({ current: true });
          const before = {
            schedules: await db.db
              .select()
              .from(productionTestSchema.scheduleRuns),
            shifts: await db.db
              .select()
              .from(productionTestSchema.productionShifts),
            events: await db.db.select().from(productionTestSchema.workEvents),
          };
          const seen: Observation[] = [];
          await expect(
            make(
              undefined,
              seen,
              undefined,
              output,
              { now: () => new Date(now) },
              {
                ...productionRules,
                evaluateScheduleRevisionTransition: () =>
                  result.err({
                    code: 'SCHEDULE_STATE_INVALID',
                    message: 'The current plan cannot be superseded.',
                  }),
              },
            )(command({ idempotencyKey: 'current-plan-state-invalid' })),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'schedule_current_plan_state_invalid',
            },
          });
          expect(seen).toEqual(['err']);
          await expect(
            Promise.all([
              db.db.select().from(productionTestSchema.scheduleRuns),
              db.db.select().from(productionTestSchema.productionShifts),
              db.db.select().from(productionTestSchema.workEvents),
            ]),
          ).resolves.toEqual([before.schedules, before.shifts, before.events]);
        },
      },
    ],
  });
  it('supersedes current plan and signals only after commit', async () => {
    await seed({ current: true });
    const signal = vi.fn();
    await make(undefined, undefined, signal)(command());
    expect(signal).toHaveBeenCalledOnce();
    const rows = await db.db.select().from(productionTestSchema.scheduleRuns);
    expect(rows.map((x) => x.status).sort()).toEqual(['draft', 'superseded']);
  });
  proveOperation({
    operationId: 'production.create-schedule.v1',
    declaration: createScheduleCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'replays concurrent identical commands into one schedule and event',
        proves: [
          'same-payload-replay',
          'same-key-concurrency',
          'declared-concurrency-race',
        ],
        run: async () => {
          await seed();
          const a = make([id.schedule, id.event]);
          const b = make([
            '26000000-0000-4000-8000-000000000012',
            '26000000-0000-4000-8000-000000000013',
          ]);
          const results = await Promise.all([a(command()), b(command())]);
          expect(results.every((x) => x.kind === 'success')).toBe(true);
          expect(
            await db.db.select().from(productionTestSchema.scheduleRuns),
          ).toHaveLength(1);
          expect(
            await db.db.select().from(productionTestSchema.workEvents),
          ).toHaveLength(1);
        },
      },
    ],
  });
  proveOperation({
    operationId: 'production.create-schedule.v1',
    declaration: createScheduleCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'returns empty selection as expected rollback',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed({ selection: false });
          const seen: Observation[] = [];
          await expect(make(undefined, seen)(command())).resolves.toMatchObject(
            {
              kind: 'failure',
              failure: { code: 'schedule_selection_empty' },
            },
          );
          expect(seen).toEqual(['err']);
          expect(
            await db.db.select().from(productionTestSchema.scheduleRuns),
          ).toEqual([]);
        },
      },
    ],
  });
  proveOperation({
    operationId: 'production.create-schedule.v1',
    declaration: createScheduleCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back supersession/new schedule on late event failure',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seed({ current: true });
          await db.db.insert(productionTestSchema.workEvents).values({
            id: id.collision,
            locationId,
            eventType: 'fixture',
            entityType: 'fixture',
            entityId: id.collision,
            actorId: id.actor,
            idempotencyKey: 'fixture',
            payload: {},
          });
          const seen: Observation[] = [];
          const signal = vi.fn();
          await expect(
            make(
              [id.schedule, id.collision],
              seen,
              signal,
            )(command({ idempotencyKey: 'late-fault' })),
          ).rejects.toMatchObject({ code: 'schedule_create_failed' });
          expect(seen).toEqual(['threw']);
          expect(signal).not.toHaveBeenCalled();
          const rows = await db.db
            .select()
            .from(productionTestSchema.scheduleRuns);
          expect(rows).toHaveLength(1);
          expect(rows[0]?.status).toBe('accepted');
        },
      },
    ],
  });
  it('returns typed CAS conflict and rolls back new schedule', async () => {
    await seed({ current: true });
    await faultDatabase.db.execute(
      sql`create function create_schedule_reject_update() returns trigger language plpgsql as $$ begin return null; end; $$`,
    );
    await faultDatabase.db.execute(
      sql`create trigger create_schedule_cas_fault before update on schedule_runs for each row execute function create_schedule_reject_update()`,
    );
    const seen: Observation[] = [];
    const signal = vi.fn();
    await expect(
      make(undefined, seen, signal)(command()),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_schedule_revision_version_conflict' },
    });
    expect(seen).toEqual(['err']);
    expect(signal).not.toHaveBeenCalled();
    expect(
      await db.db.select().from(productionTestSchema.scheduleRuns),
    ).toHaveLength(1);
  });
  it('rejects invalid scheduler output before supersession or persistence', async () => {
    await seed({ current: true });
    const seen: Observation[] = [];
    const signal = vi.fn();
    const invalidOutput = { ...output, pulseCapacityLbs: Number.NaN };

    await expect(
      make(
        undefined,
        seen,
        signal,
        invalidOutput,
      )(command({ idempotencyKey: 'invalid-output' })),
    ).rejects.toMatchObject({
      code: 'production_schedule_output_plan_invalid',
    });
    expect(seen).toEqual(['threw']);
    expect(signal).not.toHaveBeenCalled();
    const schedules = await db.db
      .select()
      .from(productionTestSchema.scheduleRuns);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]?.status).toBe('accepted');
    expect(await db.db.select().from(productionTestSchema.workEvents)).toEqual(
      [],
    );
  });

  proveOperation({
    operationId: 'production.create-schedule.v1',
    declaration: createScheduleCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rejects divergent reuse of a committed schedule key without another plan',
        proves: ['divergent-key-conflict'],
        run: async () => {
          await seed();
          const execute = make([id.schedule, id.event]);
          await expect(execute(command())).resolves.toMatchObject({
            kind: 'success',
          });
          const beforeSchedules = await db.db
            .select()
            .from(productionTestSchema.scheduleRuns);
          const beforeEvents = await db.db
            .select()
            .from(productionTestSchema.workEvents);

          await expect(
            execute(
              command({
                schedulerConfigId: '76000000-0000-4000-8000-000000000001',
              }),
            ),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: { code: 'production_idempotency_conflict' },
          });
          await expect(
            db.db.select().from(productionTestSchema.scheduleRuns),
          ).resolves.toEqual(beforeSchedules);
          await expect(
            db.db.select().from(productionTestSchema.workEvents),
          ).resolves.toEqual(beforeEvents);
        },
      },
    ],
  });
});
