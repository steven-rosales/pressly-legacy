import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc } from '@pressly/postgres/query';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import {
  loadScheduleConformanceIds as ids,
  loadScheduleConformanceLocationId as locationId,
  loadScheduleConformanceSiblingLocationId as siblingLocationId,
  loadScheduleExpectedProposal,
  type LoadScheduleConformanceFixture,
} from '../../src/public.ts';

const productionSchema = presslyPostgresOwnerSchemas.production;

export const createLoadScheduleConformanceDatabase = () =>
  createTestDatabaseRuntime({
    databaseUrl: getTestDatabaseUrl(
      'PRESSLY_TEST_DATABASE_URL',
      'postgres://pressly:pressly@localhost:55434/pressly_test',
    ),
    tableNames: [
      'schedule_runs',
      'production_shift_selected_orders',
      'production_shift_selections',
      'scheduler_configs',
      'work_events',
      'production_shifts',
      'production_locations',
    ],
    maxConnections: 2,
    ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
      ? {}
      : {
          resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
        }),
  });

const createdAt = new Date(loadScheduleExpectedProposal.createdAt);
const acceptedAt = new Date(loadScheduleExpectedProposal.acceptedAt!);

const outputPlan = (fixture: LoadScheduleConformanceFixture) => ({
  algorithmVersion:
    fixture === 'historical_v1'
      ? ('fixed-pulse-ffd-v1' as const)
      : ('fixed-pulse-ffd-v2' as const),
  inputSnapshotHash: loadScheduleExpectedProposal.inputSnapshotHash,
  outputPlanHash: loadScheduleExpectedProposal.outputPlanHash,
  canonicalOutput: '{"schedule":"load-conformance"}',
  pulseMinutes: loadScheduleExpectedProposal.pulseMinutes,
  pulseCapacityLbs: loadScheduleExpectedProposal.pulseCapacityLbs,
  batchCount: loadScheduleExpectedProposal.batchCount,
  makespanMinutes: loadScheduleExpectedProposal.makespanMinutes,
  plannedCompletionAt: loadScheduleExpectedProposal.plannedCompletionAt,
  batches: loadScheduleExpectedProposal.batches,
  unplacedOrderIds: loadScheduleExpectedProposal.unplacedOrderIds,
  warnings: loadScheduleExpectedProposal.warnings,
});

export const seedLoadScheduleConformance = async (
  database: PostgresDatabase,
  fixture: LoadScheduleConformanceFixture,
): Promise<void> => {
  await database.insert(productionSchema.productionLocations).values([
    {
      id: locationId,
      businessId: ids.business,
      name: 'Load Schedule Conformance Facility',
      timezone: 'America/New_York',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: siblingLocationId,
      businessId: ids.business,
      name: 'Load Schedule Conformance Sibling',
      timezone: 'America/Chicago',
      createdAt,
      updatedAt: createdAt,
    },
  ]);
  await database.insert(productionSchema.productionShifts).values({
    id: ids.shift,
    locationId,
    startsAt: new Date('2026-08-22T13:00:00.000Z'),
    endsAt: new Date('2026-08-22T21:00:00.000Z'),
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 4,
    version: 3,
    createdAt,
    updatedAt: acceptedAt,
  });
  await database.insert(productionSchema.productionShiftSelections).values({
    productionShiftId: ids.shift,
    locationId,
    version: 7,
    selectedBy: ids.actor,
    selectedAt: createdAt,
    updatedAt: acceptedAt,
  });
  await database.insert(productionSchema.schedulerConfigs).values({
    id: ids.config,
    locationId,
    pulseMinutes: 42,
    foldLbsPerFolderMinute: 2,
    algorithmVersion:
      fixture === 'historical_v1' ? 'fixed-pulse-ffd-v1' : 'fixed-pulse-ffd-v2',
    version: 4,
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
      assertedBy: ids.actor,
      assertedAt: createdAt.toISOString(),
    },
    assertedBy: ids.actor,
    publishedAt: createdAt,
  });
  await database.insert(productionSchema.scheduleRuns).values({
    id: ids.schedule,
    locationId,
    productionShiftId: ids.shift,
    schedulerConfigId: ids.config,
    status: 'accepted',
    inputSnapshot: {
      config: { id: ids.config, version: 4 },
      shift: { id: ids.shift, version: 3 },
      selection: {
        version: 7,
        orderIds: [ids.secondOrder, ids.firstOrder, ids.unplacedOrder],
      },
    },
    inputSnapshotHash: loadScheduleExpectedProposal.inputSnapshotHash,
    outputPlan: outputPlan(fixture),
    outputPlanHash: loadScheduleExpectedProposal.outputPlanHash,
    algorithmVersion:
      fixture === 'historical_v1' ? 'fixed-pulse-ffd-v1' : 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: loadScheduleExpectedProposal.pulseCapacityLbs,
    batchCount: loadScheduleExpectedProposal.batchCount,
    makespanMinutes: loadScheduleExpectedProposal.makespanMinutes,
    plannedCompletionAt: new Date(
      loadScheduleExpectedProposal.plannedCompletionAt,
    ),
    warnings: [...loadScheduleExpectedProposal.warnings].reverse(),
    acceptedAt,
    acceptedBy: ids.actor,
    acknowledgedWarningCodes:
      loadScheduleExpectedProposal.acknowledgedWarningCodes,
    createdAt,
  });
};

const normalized = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value)) as unknown;

export const readLoadScheduleConformanceState = async (
  database: PostgresDatabase,
): Promise<Readonly<Record<string, unknown>>> =>
  normalized({
    locations: await database
      .select()
      .from(productionSchema.productionLocations)
      .orderBy(asc(productionSchema.productionLocations.id)),
    shifts: await database
      .select()
      .from(productionSchema.productionShifts)
      .orderBy(asc(productionSchema.productionShifts.id)),
    selections: await database
      .select()
      .from(productionSchema.productionShiftSelections)
      .orderBy(
        asc(productionSchema.productionShiftSelections.productionShiftId),
      ),
    selectedOrders: await database
      .select()
      .from(productionSchema.productionShiftSelectedOrders)
      .orderBy(
        asc(productionSchema.productionShiftSelectedOrders.productionOrderId),
      ),
    configs: await database
      .select()
      .from(productionSchema.schedulerConfigs)
      .orderBy(asc(productionSchema.schedulerConfigs.version)),
    schedules: await database
      .select()
      .from(productionSchema.scheduleRuns)
      .orderBy(asc(productionSchema.scheduleRuns.id)),
    workEvents: await database
      .select()
      .from(productionSchema.workEvents)
      .orderBy(asc(productionSchema.workEvents.id)),
  }) as Readonly<Record<string, unknown>>;
