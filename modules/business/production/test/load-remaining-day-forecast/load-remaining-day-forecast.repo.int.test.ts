import { laundryProduction } from '@pressly/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeLoadRemainingDayForecastRepository } from '../../src/load-remaining-day-forecast/load-remaining-day-forecast.repo.ts';
import {
  createProductionTestDatabase,
  seedProductionDemands,
} from '../support/database.ts';

const testDb = createProductionTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  shift: '10000000-0000-4000-8000-000000000002',
  config: '10000000-0000-4000-8000-000000000003',
  schedule: '10000000-0000-4000-8000-000000000004',
  run: '10000000-0000-4000-8000-000000000005',
  batch: '10000000-0000-4000-8000-000000000006',
  activeDemand: '10000000-0000-4000-8000-000000000007',
  activeOrder: '10000000-0000-4000-8000-000000000008',
  overdueDemand: '20000000-0000-4000-8000-000000000001',
  todayDemand: '20000000-0000-4000-8000-000000000002',
  missingDemand: '20000000-0000-4000-8000-000000000003',
  laterDemand: '20000000-0000-4000-8000-000000000004',
  resolvedOrder: '20000000-0000-4000-8000-000000000005',
  resolver: '20000000-0000-4000-8000-000000000006',
} as const;

const seedLocation = async (): Promise<void> => {
  await testDb.db.insert(laundryProduction.productionLocations).values({
    id: 'location-1',
    businessId: '00000000-0000-4000-8000-000000000100',
    name: 'Remaining-day Test Facility',
    timezone: 'America/New_York',
  });
};

describe('remaining-day forecast Postgres read model', () => {
  it('uses the exact local service-day boundary and includes overdue but not later demand', async () => {
    await seedLocation();
    await seedProductionDemands(testDb.db, [
      {
        id: ids.overdueDemand,
        demandKey: 'forecast:overdue',
        displayReference: 'OVERDUE',
        locationId: 'location-1',
        revisionHash: 'overdue',
        revisionAt: new Date('2026-03-08T15:00:00.000Z'),
        phase: 'expected',
        estimatedWeightLbs: 20,
        estimatedWeightSource: 'external_price',
        dueAt: new Date('2026-03-07T23:00:00.000Z'),
      },
      {
        id: ids.todayDemand,
        demandKey: 'forecast:today',
        displayReference: 'TODAY',
        locationId: 'location-1',
        revisionHash: 'today',
        revisionAt: new Date('2026-03-08T15:00:00.000Z'),
        phase: 'expected',
        estimatedWeightLbs: 30,
        estimatedWeightSource: 'external_price',
        dueAt: new Date('2026-03-09T03:30:00.000Z'),
      },
      {
        id: ids.missingDemand,
        demandKey: 'forecast:missing',
        displayReference: 'MISSING',
        locationId: 'location-1',
        revisionHash: 'missing',
        revisionAt: new Date('2026-03-08T15:00:00.000Z'),
        phase: 'expected',
        estimatedWeightLbs: null,
        estimatedWeightSource: null,
        dueAt: new Date('2026-03-08T18:00:00.000Z'),
      },
      {
        id: ids.laterDemand,
        demandKey: 'forecast:later',
        displayReference: 'LATER',
        locationId: 'location-1',
        revisionHash: 'later',
        revisionAt: new Date('2026-03-08T15:00:00.000Z'),
        phase: 'expected',
        estimatedWeightLbs: 40,
        estimatedWeightSource: 'external_price',
        dueAt: new Date('2026-03-09T04:00:00.000Z'),
      },
    ]);
    await testDb.db.insert(laundryProduction.productionOrders).values({
      id: ids.resolvedOrder,
      orderDemandId: ids.todayDemand,
      locationId: 'location-1',
      dueAt: new Date('2026-03-09T03:30:00.000Z'),
      operationalStatus: 'release_pending',
      executionStatus: 'unassigned',
      resolutionState: 'resolved_without_production',
      resolvedAt: new Date('2026-03-08T14:00:00.000Z'),
      resolvedBy: ids.resolver,
      resolutionReason: 'completed_outside_pressly',
      derivedWeightLbs: 30,
      version: 2,
    });

    const repository = makeLoadRemainingDayForecastRepository(testDb.db);
    const input = {
      locationId: 'location-1',
      serviceDay: '2026-03-08',
      asOf: new Date('2026-03-08T15:00:00.000Z'),
      rowLimit: 50,
    };
    const first = await repository.load(input);
    const second = await repository.load(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      startsAt: new Date('2026-03-08T05:00:00.000Z'),
      endsAt: new Date('2026-03-09T04:00:00.000Z'),
      timezone: 'America/New_York',
      activeRuns: [],
    });
    if (
      first === null ||
      first === 'scope_too_large' ||
      first === 'invalid_service_day'
    )
      return;
    expect(first.demandRows.map((row) => row.displayReference)).toEqual([
      'OVERDUE',
      'MISSING',
    ]);
    expect(
      first.demandRows.find((row) => row.displayReference === 'MISSING')
        ?.estimatedWeightLbs,
    ).toBeNull();
  });

  it('loads exact active-run placement facts and includes its unfinished work outside the due window', async () => {
    await seedLocation();
    const startsAt = new Date('2026-07-26T12:00:00.000Z');
    const endsAt = new Date('2026-07-26T20:00:00.000Z');
    const plannedCompletionAt = new Date('2026-07-26T16:40:00.000Z');

    await testDb.db.insert(laundryProduction.productionShifts).values({
      id: ids.shift,
      locationId: 'location-1',
      startsAt,
      endsAt,
      timezone: 'America/New_York',
      status: 'open',
      effectiveFolderCount: 2,
    });
    await testDb.db.insert(laundryProduction.schedulerConfigs).values({
      id: ids.config,
      locationId: 'location-1',
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

    const inputSnapshot = {
      orders: [],
      machines: [],
      shift: {
        id: ids.shift,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        timezone: 'America/New_York',
        effectiveFolderCount: 2,
        version: 1,
      },
      config: {
        id: ids.config,
        pulseMinutes: 56,
        foldLbsPerFolderMinute: 2,
        algorithmVersion: 'fixed-pulse-ffd-v2',
        version: 1,
      },
    };
    const outputPlan = {
      algorithmVersion: 'fixed-pulse-ffd-v2',
      inputSnapshotHash: 'a'.repeat(64),
      outputPlanHash: 'b'.repeat(64),
      canonicalOutput: '{}',
      pulseMinutes: 56,
      pulseCapacityLbs: 100,
      batchCount: 1,
      makespanMinutes: 280,
      plannedCompletionAt: plannedCompletionAt.toISOString(),
      batches: [],
      unplacedOrderIds: [],
      warnings: [],
    };
    await testDb.db.insert(laundryProduction.scheduleRuns).values({
      id: ids.schedule,
      locationId: 'location-1',
      productionShiftId: ids.shift,
      schedulerConfigId: ids.config,
      status: 'accepted',
      inputSnapshot,
      inputSnapshotHash: 'a'.repeat(64),
      outputPlan,
      outputPlanHash: 'b'.repeat(64),
      algorithmVersion: 'fixed-pulse-ffd-v2',
      pulseCapacityLbs: 100,
      batchCount: 1,
      makespanMinutes: 280,
      plannedCompletionAt,
      warnings: [],
      acknowledgedWarningCodes: [],
      acceptedAt: startsAt,
      acceptedBy: ids.actor,
    });
    await testDb.db.insert(laundryProduction.productionRuns).values({
      id: ids.run,
      locationId: 'location-1',
      productionShiftId: ids.shift,
      scheduleRunId: ids.schedule,
      status: 'started',
      startedAt: startsAt,
      queueVersion: 3,
      plannedCompletionAt,
      version: 1,
    });

    await seedProductionDemands(testDb.db, {
      id: ids.activeDemand,
      demandKey: 'forecast:active',
      displayReference: 'ACTIVE-LATER',
      locationId: 'location-1',
      revisionHash: 'active',
      revisionAt: startsAt,
      phase: 'production_released',
      estimatedWeightLbs: 42,
      estimatedWeightSource: 'external_price',
      dueAt: new Date('2026-07-28T18:00:00.000Z'),
    });
    await testDb.db.insert(laundryProduction.productionOrders).values({
      id: ids.activeOrder,
      orderDemandId: ids.activeDemand,
      locationId: 'location-1',
      dueAt: new Date('2026-07-28T18:00:00.000Z'),
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      derivedWeightLbs: 42,
      bagCount: 2,
      bagCountSource: 'operator_intake',
      intakeRecordedAt: startsAt,
      intakeVersion: 1,
      version: 2,
    });
    await testDb.db.insert(laundryProduction.productionBatches).values({
      id: ids.batch,
      locationId: 'location-1',
      productionRunId: ids.run,
      sequenceIndex: 0,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 42,
      pulseMinutes: 56,
      plannedDoneAt: plannedCompletionAt,
      version: 1,
    });
    await testDb.db.insert(laundryProduction.productionBatchOrders).values({
      locationId: 'location-1',
      productionBatchId: ids.batch,
      productionOrderId: ids.activeOrder,
      active: true,
      placementProvenance: 'initial_schedule',
      placedAt: startsAt,
    });

    const repository = makeLoadRemainingDayForecastRepository(testDb.db);
    const read = await repository.load({
      locationId: 'location-1',
      serviceDay: '2026-07-26',
      asOf: new Date('2026-07-26T15:00:00.000Z'),
      rowLimit: 50,
    });

    expect(read).toMatchObject({
      activeRuns: [
        {
          run: {
            id: ids.run,
            queueVersion: 3,
            pulseMinutes: 56,
            pulseCapacityLbs: 100,
          },
          batches: [
            {
              id: ids.batch,
              orderIds: [ids.activeOrder],
              derivedWeightLbs: 42,
              bagCount: 2,
            },
          ],
        },
      ],
      demandRows: [
        {
          displayReference: 'ACTIVE-LATER',
          executionStatus: 'scheduled',
          activePlacement: {
            productionRunId: ids.run,
            productionBatchId: ids.batch,
          },
        },
      ],
    });
  });
});
