import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { laundryProduction } from '@pressly/db';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { makeAcceptScheduleRepository } from '../../src/accept-schedule/accept-schedule.repo.ts';
import { makeCreateScheduleRepository } from '../../src/create-schedule/create-schedule.repo.ts';
import { makeLoadScheduleRepository } from '../../src/load-schedule/load-schedule.repo.ts';
import { makePublishSchedulerConfigRepository } from '../../src/publish-scheduler-config/publish-scheduler-config.repo.ts';
import { makeSetProductionOrderPriorityRepository } from '../../src/set-production-order-priority/set-production-order-priority.repo.ts';
import { makeSetProductionOrderPriority } from '../../src/set-production-order-priority/set-production-order-priority.usecase.ts';
import { makeStartScheduleRepository } from '../../src/start-schedule/start-schedule.repo.ts';
import { defineWorkEventCommand } from '../../src/production-idempotency.policy.ts';
import {
  allowPolicy,
  makeClock,
  makeIds,
  simpleScheduler,
} from '../support/production.fake.ts';
import { seedProductionDemands } from '../support/database.ts';

const location = {
  first: 'test-location-closure-1',
  second: 'test-location-closure-2',
} as const;

const id = {
  actor: '10000000-0000-4000-8000-000000000001',
  shift: '10000000-0000-4000-8000-000000000002',
  configFirst: '10000000-0000-4000-8000-000000000003',
  configSecond: '10000000-0000-4000-8000-000000000004',
  demandEligible: '10000000-0000-4000-8000-000000000005',
  demandPending: '10000000-0000-4000-8000-000000000006',
  demandOther: '10000000-0000-4000-8000-000000000007',
  orderEligible: '10000000-0000-4000-8000-000000000008',
  orderPending: '10000000-0000-4000-8000-000000000009',
  orderOther: '10000000-0000-4000-8000-000000000010',
  sorting: '10000000-0000-4000-8000-000000000011',
  washing: '10000000-0000-4000-8000-000000000012',
  drying: '10000000-0000-4000-8000-000000000013',
  folding: '10000000-0000-4000-8000-000000000014',
  otherWashing: '10000000-0000-4000-8000-000000000015',
  washer: '10000000-0000-4000-8000-000000000016',
  dryer: '10000000-0000-4000-8000-000000000017',
  otherWasher: '10000000-0000-4000-8000-000000000018',
} as const;

const productionTables = [
  'work_events',
  'stage_machine_assignments',
  'stage_runs',
  'production_batch_orders',
  'production_batches',
  'production_runs',
  'schedule_runs',
  'production_shift_selected_orders',
  'production_shift_selections',
  'scheduler_configs',
  'production_machines',
  'production_stations',
  'production_bags',
  'production_orders',
  'production_shifts',
  'order_demands',
  'order_outbox_events',
  'order_source_snapshots',
  'order_source_customer_refs',
  'order_source_links',
  'order_items',
  'order_fulfillments',
  'orders',
  'webhook_events',
  'source_location_bindings',
  'production_locations',
] as const;

const testDb = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: productionTables,
  maxConnections: 1,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : {
        resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
      }),
});

const seedLocationClosure = async (): Promise<void> => {
  const now = new Date('2026-07-10T14:00:00.000Z');
  const due = new Date('2026-07-10T20:00:00.000Z');

  await testDb.db.insert(laundryProduction.productionLocations).values([
    {
      id: location.first,
      businessId: '00000000-0000-4000-8000-000000000100',
      name: 'Synthetic Location One',
      timezone: 'America/New_York',
    },
    {
      id: location.second,
      businessId: '00000000-0000-4000-8000-000000000100',
      name: 'Synthetic Location Two',
      timezone: 'America/Chicago',
    },
  ]);
  await testDb.db.insert(laundryProduction.stations).values([
    {
      id: id.sorting,
      locationId: location.first,
      kind: 'sorting',
      label: 'Sorting',
      sortOrder: 1,
    },
    {
      id: id.washing,
      locationId: location.first,
      kind: 'washing',
      label: 'Washing',
      sortOrder: 2,
    },
    {
      id: id.drying,
      locationId: location.first,
      kind: 'drying',
      label: 'Drying',
      sortOrder: 3,
    },
    {
      id: id.folding,
      locationId: location.first,
      kind: 'folding_packaging',
      label: 'Folding',
      sortOrder: 4,
    },
    {
      id: id.otherWashing,
      locationId: location.second,
      kind: 'washing',
      label: 'Other washing',
      sortOrder: 2,
    },
  ]);
  await testDb.db.insert(laundryProduction.machines).values([
    {
      id: id.washer,
      locationId: location.first,
      stationId: id.washing,
      label: 'Washer 1',
      effectiveCapacityLbs: 100,
    },
    {
      id: id.dryer,
      locationId: location.first,
      stationId: id.drying,
      label: 'Dryer 1',
      effectiveCapacityLbs: 100,
    },
    {
      id: id.otherWasher,
      locationId: location.second,
      stationId: id.otherWashing,
      label: 'Other washer',
      effectiveCapacityLbs: 100,
    },
  ]);
  await testDb.db.insert(laundryProduction.productionShifts).values({
    id: id.shift,
    locationId: location.first,
    startsAt: now,
    endsAt: new Date('2026-07-10T22:00:00.000Z'),
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
  });
  await testDb.db.insert(laundryProduction.schedulerConfigs).values([
    {
      id: id.configFirst,
      locationId: location.first,
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 1,
      stageFitAssertion: {},
      assertedBy: id.actor,
    },
    {
      id: id.configSecond,
      locationId: location.second,
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 1,
      stageFitAssertion: {},
      assertedBy: id.actor,
    },
  ]);
  await seedProductionDemands(testDb.db, [
    {
      id: id.demandEligible,
      demandKey: 'test:eligible-first-location',
      displayReference: 'eligible-first-location',
      locationId: location.first,
      revisionHash: 'eligible-source-hash',
      revisionAt: now,
      phase: 'production_released',
      dueAt: due,
    },
    {
      id: id.demandPending,
      demandKey: 'test:intake-pending-first-location',
      displayReference: 'intake-pending-first-location',
      locationId: location.first,
      revisionHash: 'pending-source-hash',
      revisionAt: now,
      phase: 'production_released',
      dueAt: due,
    },
    {
      id: id.demandOther,
      demandKey: 'test:eligible-second-location',
      displayReference: 'eligible-second-location',
      locationId: location.second,
      revisionHash: 'other-source-hash',
      revisionAt: now,
      phase: 'production_released',
      dueAt: due,
    },
  ]);
  await testDb.db.insert(laundryProduction.productionOrders).values([
    {
      id: id.orderEligible,
      orderDemandId: id.demandEligible,
      locationId: location.first,
      dueAt: due,
      operationalStatus: 'eligible',
      executionStatus: 'unassigned',
      derivedWeightLbs: 74,
      bagCount: 2,
      bagCountSource: 'operator_intake',
      intakeRecordedAt: now,
      intakeVersion: 1,
      eligibleAt: now,
    },
    {
      id: id.orderPending,
      orderDemandId: id.demandPending,
      locationId: location.first,
      dueAt: due,
      operationalStatus: 'intake_pending',
      executionStatus: 'unassigned',
      derivedWeightLbs: 40,
      bagCount: null,
      eligibleAt: now,
    },
    {
      id: id.orderOther,
      orderDemandId: id.demandOther,
      locationId: location.second,
      dueAt: due,
      operationalStatus: 'eligible',
      executionStatus: 'unassigned',
      derivedWeightLbs: 60,
      bagCount: 3,
      bagCountSource: 'operator_intake',
      intakeRecordedAt: now,
      intakeVersion: 1,
      eligibleAt: now,
    },
  ]);
  await testDb.db.insert(laundryProduction.productionShiftSelections).values({
    productionShiftId: id.shift,
    locationId: location.first,
    version: 1,
    selectedBy: id.actor,
    selectedAt: now,
    updatedAt: now,
  });
  await testDb.db
    .insert(laundryProduction.productionShiftSelectedOrders)
    .values({
      productionShiftId: id.shift,
      locationId: location.first,
      productionOrderId: id.orderEligible,
      selectedBy: id.actor,
      selectedAt: now,
    });
};

beforeAll(testDb.check);
beforeEach(async () => {
  await testDb.reset();
  await seedLocationClosure();
});
afterAll(testDb.close);

describe('production location closure', () => {
  it('loads only schedulable orders and machines from the requested location', async () => {
    const ids = makeIds();
    const repository = makeCreateScheduleRepository({ db: testDb.db, ids });
    const input = await repository.transaction((repo) =>
      repo.loadSchedulingInput({
        locationId: location.first,
        productionShiftId: id.shift,
        schedulerConfigId: id.configFirst,
        idempotencyKey: 'location-first-schedule-input',
      }),
    );

    if (input === null || typeof input === 'string')
      throw new Error('Selected scheduling input missing.');
    expect(input.orders).toEqual([
      expect.objectContaining({
        id: id.orderEligible,
        externalOrderId: 'eligible-first-location',
        bagCount: 2,
      }),
    ]);
    expect(input.machines.map((machine) => machine.id).sort()).toEqual(
      [id.dryer, id.washer].sort(),
    );

    await expect(
      repository.transaction((repo) =>
        repo.loadSchedulingInput({
          locationId: location.first,
          productionShiftId: id.shift,
          schedulerConfigId: id.configSecond,
          idempotencyKey: 'cross-location-schedule-input',
        }),
      ),
    ).resolves.toBeNull();

    const configRepository = makePublishSchedulerConfigRepository({
      db: testDb.db,
      ids,
    });
    await expect(
      configRepository.transaction(async (repo) => [
        await repo.nextSchedulerConfigVersion(location.first),
        await repo.nextSchedulerConfigVersion(location.second),
      ]),
    ).resolves.toEqual([2, 2]);
    await configRepository.transaction((repo) =>
      repo.saveSchedulerConfig(location.first, {
        id: ids.next(),
        pulseMinutes: 56,
        foldLbsPerFolderMinute: 2,
        algorithmVersion: 'fixed-pulse-ffd-v1',
        version: 2,
        stageFitAssertion: {
          sortingFits: true,
          washingFits: true,
          dryingFits: true,
          assertedBy: id.actor,
          assertedAt: '2026-07-10T14:00:00.000Z',
        },
        publishedAt: '2026-07-10T14:00:00.000Z',
      }),
    );
    await expect(
      configRepository.transaction(async (repo) => [
        await repo.nextSchedulerConfigVersion(location.first),
        await repo.nextSchedulerConfigVersion(location.second),
      ]),
    ).resolves.toEqual([3, 2]);
  });

  it('keeps accepted plans, started execution, and mutations inside one location', async () => {
    const ids = makeIds();
    const now = new Date('2026-07-10T14:00:00.000Z');
    const scheduleRepository = makeCreateScheduleRepository({
      db: testDb.db,
      ids,
    });
    const schedulingInput = await scheduleRepository.transaction((repo) =>
      repo.loadSchedulingInput({
        locationId: location.first,
        productionShiftId: id.shift,
        schedulerConfigId: id.configFirst,
        idempotencyKey: 'location-schedule-input',
      }),
    );
    if (schedulingInput === null || typeof schedulingInput === 'string')
      throw new Error('Selected scheduling input missing.');
    const output = simpleScheduler.propose(schedulingInput);
    const schedule = await scheduleRepository.transaction((repo) =>
      repo.saveSchedule({
        locationId: location.first,
        id: ids.next(),
        schedulingInput,
        output,
        initialStatus: 'draft',
        supersede: null,
        now,
      }),
    );

    await expect(
      makeLoadScheduleRepository(testDb.db).loadSchedule(
        location.second,
        schedule.scheduleRunId,
      ),
    ).resolves.toBeNull();

    const acceptanceRepository = makeAcceptScheduleRepository({
      db: testDb.db,
      ids,
    });
    await acceptanceRepository.transaction((repo) =>
      repo.acceptSchedule(
        location.first,
        schedule,
        id.actor,
        [],
        'location-acceptance-1',
        defineWorkEventCommand({
          operation: 'schedule_accepted',
          locationId: location.first,
          actorId: id.actor,
          entityType: 'schedule_run',
          entityId: schedule.scheduleRunId,
          payload: {
            expectedOutputPlanHash: schedule.outputPlanHash,
            acknowledgedWarningCodes: [],
          },
        }),
        { from: 'draft', state: 'accepted' },
        now,
      ),
    );

    for (const table of [
      laundryProduction.productionRuns,
      laundryProduction.productionBatches,
      laundryProduction.productionBatchOrders,
      laundryProduction.stageRuns,
      laundryProduction.stageMachineAssignments,
    ])
      expect(await testDb.db.select().from(table)).toHaveLength(0);

    const startRepository = makeStartScheduleRepository({
      db: testDb.db,
      ids,
    });
    await startRepository.transaction(async (repo) => {
      const record = await repo.loadSchedule(
        location.first,
        schedule.scheduleRunId,
      );
      if (record === null) throw new Error('Accepted schedule missing.');
      await repo.startSchedule({
        locationId: location.first,
        record,
        actorId: id.actor,
        productionRunStatus: 'started',
        orderLifecycles: [
          {
            productionOrderId: id.orderEligible,
            persistedState: 'unassigned',
            expectedVersion: 1,
            lifecycle: { from: 'unassigned', state: 'scheduled' },
          },
        ],
        initialBatchState: 'queued',
        initialStageState: 'planned',
        initialAttemptState: 'assigned',
        idempotencyKey: 'location-start-1',
        idempotency: defineWorkEventCommand({
          operation: 'production_run_started',
          locationId: location.first,
          actorId: id.actor,
          entityType: 'schedule_run',
          entityId: schedule.scheduleRunId,
          payload: { expectedOutputPlanHash: schedule.outputPlanHash },
        }),
        now,
      });
    });

    for (const table of [
      laundryProduction.productionRuns,
      laundryProduction.productionBatches,
      laundryProduction.productionBatchOrders,
      laundryProduction.stageRuns,
      laundryProduction.stageMachineAssignments,
      laundryProduction.workEvents,
    ]) {
      const rows = await testDb.db
        .select({ locationId: table.locationId })
        .from(table);
      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((row) => row.locationId))).toEqual(
        new Set([location.first]),
      );
    }

    const priority = makeSetProductionOrderPriority({
      repo: makeSetProductionOrderPriorityRepository({ db: testDb.db, ids }),
      clock: makeClock('2026-07-10T14:30:00.000Z').clock,
      policy: allowPolicy,
    });
    await expect(
      priority({
        locationId: location.second,
        productionOrderId: id.orderEligible,
        priority: true,
        expectedVersion: 2,
        idempotencyKey: 'wrong-location-priority',
        actorId: id.actor,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_order_not_found' },
    });
    await expect(
      priority({
        locationId: location.first,
        productionOrderId: id.orderEligible,
        priority: true,
        expectedVersion: 2,
        idempotencyKey: 'right-location-priority',
        actorId: id.actor,
      }),
    ).resolves.toMatchObject({ tag: 'ok', value: { version: 3 } });

    const events = await testDb.db
      .select({ locationId: laundryProduction.workEvents.locationId })
      .from(laundryProduction.workEvents);
    expect(new Set(events.map((event) => event.locationId))).toEqual(
      new Set([location.first]),
    );
  });
});
