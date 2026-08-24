import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import {
  createPostgresRuntime,
  type PostgresDatabase,
} from '@pressly/postgres/client';
import { asc, sql } from '@pressly/postgres/query';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import {
  makeStartScheduleConformanceCommand,
  startScheduleConformanceGeneratedIds as generatedIds,
  startScheduleConformanceIds as ids,
  startScheduleConformanceInputHash as inputHash,
  startScheduleConformanceLocationId as locationId,
  startScheduleConformanceNow as now,
  startScheduleConformanceOtherLocationId as otherLocationId,
  startScheduleConformanceOutputHash as outputHash,
  type StartScheduleFixture,
} from '../../src/start-schedule-conformance.ts';

const productionSchema = presslyPostgresOwnerSchemas.production;

const databaseUrl = getTestDatabaseUrl(
  'PRESSLY_TEST_DATABASE_URL',
  'postgres://pressly:pressly@localhost:55434/pressly_start_schedule_conformance_test',
);
const resetDatabaseUrl = getTestDatabaseUrl(
  'PRESSLY_TEST_DATABASE_RESET_URL',
  databaseUrl,
);

const tableNames = [
  'stage_machine_assignments',
  'production_order_stage_attempts',
  'stage_runs',
  'production_batch_orders',
  'production_batches',
  'production_runs',
  'work_events',
  'schedule_runs',
  'production_shift_selected_orders',
  'production_shift_selections',
  'scheduler_configs',
  'production_machines',
  'production_stations',
  'production_bags',
  'production_orders',
  'order_demands',
  'production_shifts',
  'production_locations',
] as const;

export const startScheduleConformanceDatabase = createTestDatabaseRuntime({
  databaseUrl,
  resetDatabaseUrl,
  tableNames,
  maxConnections: 12,
});

export const startScheduleConformanceFaultDatabase = createPostgresRuntime({
  databaseUrl: resetDatabaseUrl,
  schema: {},
  maxConnections: 2,
});

const stages = (offset: number) =>
  (
    [
      ['sorting', [], 0],
      ['washing', [ids.washer], 1],
      ['drying', [ids.dryer], 2],
      ['folding_packaging', [], 3],
    ] as const
  ).map(([stage, machineIds, stageOffset]) => ({
    stage,
    startsAt: new Date(
      now.getTime() + (offset + stageOffset) * 56 * 60_000,
    ).toISOString(),
    endsAt: new Date(
      now.getTime() + (offset + stageOffset + 1) * 56 * 60_000,
    ).toISOString(),
    machineIds: [...machineIds],
  }));

const plannedBatches = () => [
  {
    sequence: 0,
    orderIds: [ids.orderA],
    derivedWeightLbs: 20,
    bagCount: 1,
    stages: stages(0),
  },
  {
    sequence: 1,
    orderIds: [ids.orderB],
    derivedWeightLbs: 30,
    bagCount: 2,
    stages: stages(1),
  },
];

const window = (fixture: StartScheduleFixture) => {
  switch (fixture.window) {
    case 'not_started':
      return {
        startsAt: '2026-08-22T16:00:00.000Z',
        endsAt: '2026-08-22T23:00:00.000Z',
      };
    case 'expired':
      return {
        startsAt: '2026-08-22T10:00:00.000Z',
        endsAt: '2026-08-22T14:00:00.000Z',
      };
    default:
      return {
        startsAt: '2026-08-22T14:00:00.000Z',
        endsAt: '2026-08-22T22:00:00.000Z',
      };
  }
};

const schedulingInput = (fixture: StartScheduleFixture) => {
  const shiftWindow = window(fixture);
  return {
    orders: [
      {
        id: ids.orderA,
        externalOrderId: 'START-A',
        dueAt: '2026-08-22T20:00:00.000Z',
        priority: true,
        derivedWeightLbs: 20,
        bagCount: 1,
        version: 1,
      },
      {
        id: ids.orderB,
        externalOrderId: 'START-B',
        dueAt: '2026-08-22T21:00:00.000Z',
        priority: false,
        derivedWeightLbs: 30,
        bagCount: 2,
        version: 1,
      },
    ],
    machines: [
      {
        id: ids.washer,
        stationKind: 'washing' as const,
        effectiveCapacityLbs: 100,
        active: true,
      },
      {
        id: ids.dryer,
        stationKind: 'drying' as const,
        effectiveCapacityLbs: 100,
        active: true,
      },
    ],
    shift: {
      id: ids.shift,
      ...shiftWindow,
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
      version: 1,
    },
    config: {
      id: ids.config,
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v2' as const,
      version: 1,
    },
  };
};

const schedulingOutput = (fixture: StartScheduleFixture) => {
  const batches = fixture.batches === 'empty' ? [] : plannedBatches();
  const unplacedOrderIds =
    fixture.batches === 'empty'
      ? [ids.orderA, ids.orderB]
      : fixture.snapshot === 'coverage_stale'
        ? [ids.orderA]
        : [];
  return {
    algorithmVersion: 'fixed-pulse-ffd-v2' as const,
    inputSnapshotHash: inputHash,
    outputPlanHash: outputHash,
    canonicalOutput: '{"algorithmVersion":"fixed-pulse-ffd-v2"}',
    pulseMinutes: 56,
    pulseCapacityLbs: 100,
    batchCount: batches.length,
    makespanMinutes: batches.length === 0 ? 0 : 280,
    plannedCompletionAt: '2026-08-22T23:00:00.000Z',
    batches,
    unplacedOrderIds,
    warnings: [
      {
        code: 'SHIFT_OVERFLOW' as const,
        message: 'The accepted plan extends beyond the shift.',
        blocking: false,
      },
    ],
  };
};

const seedOrder = async (
  db: PostgresDatabase,
  input: Readonly<{
    fulfillmentId: string;
    demandId: string;
    productionOrderId: string;
    displayReference: string;
    dueAt: string;
    weight: number;
    bagCount: number;
    priority: boolean;
  }>,
): Promise<void> => {
  await db.insert(productionSchema.orderDemands).values({
    id: input.demandId,
    fulfillmentId: input.fulfillmentId,
    fulfillmentVersion: 1,
    projectionHash: 'c'.repeat(64),
    admissionState: 'released',
    commercialState: 'open',
    displayReference: input.displayReference,
    locationId,
    revisionAt: now,
    phase: 'production_released',
    estimatedWeightLbs: input.weight,
    estimatedWeightSource: 'conformance',
    dueAt: new Date(input.dueAt),
  });
  await db.insert(productionSchema.productionOrders).values({
    id: input.productionOrderId,
    orderDemandId: input.demandId,
    locationId,
    dueAt: new Date(input.dueAt),
    priority: input.priority,
    operationalStatus: 'eligible',
    executionStatus:
      input.productionOrderId === ids.orderA &&
      currentFixture?.snapshot === 'execution_scheduled'
        ? 'scheduled'
        : 'unassigned',
    resolutionState: 'open',
    derivedWeightLbs: input.weight,
    bagCount: input.bagCount,
    bagCountSource: 'operator_intake',
    intakeRecordedAt: now,
    intakeVersion: 1,
    eligibleAt: now,
    version: 1,
  });
};

let currentFixture: StartScheduleFixture | undefined;

const seedStoredReceipt = async (
  db: PostgresDatabase,
  fixture: StartScheduleFixture,
): Promise<void> => {
  if (fixture.storedReceipt === undefined) return;
  const expected = makeStartScheduleConformanceCommand({
    idempotencyKey: 'start-stored-receipt',
  });
  const command = {
    operation: 'production_run_started',
    locationId: expected.locationId,
    actorId:
      fixture.storedReceipt === 'divergent' ? ids.otherActor : expected.actorId,
    target: { entityType: 'schedule_run', entityId: expected.scheduleRunId },
    expectedVersion: null,
    payload: { expectedOutputPlanHash: expected.expectedOutputPlanHash },
  };
  const result = {
    scheduleRunId: ids.schedule,
    productionRunId: ids.existingRun,
    productionBatchIds: [],
    queueVersion: 1,
    startedAt: now.toISOString(),
    replayed: false,
  };
  await db.insert(productionSchema.workEvents).values({
    id: ids.receiptEvent,
    locationId,
    eventType: 'production_run_started',
    entityType: 'production_run',
    entityId: ids.existingRun,
    actorId: ids.actor,
    idempotencyKey: expected.idempotencyKey,
    payload:
      fixture.storedReceipt === 'malformed'
        ? { _idempotency: { version: 2 } }
        : {
            scheduleRunId: ids.schedule,
            productionRunId: ids.existingRun,
            productionBatchIds: [],
            queueVersion: 1,
            _idempotency: { version: 1, command, result },
          },
  });
};

export const seedStartScheduleConformance = async (
  db: PostgresDatabase,
  fixture: StartScheduleFixture,
): Promise<void> => {
  currentFixture = fixture;
  try {
    const snapshot = schedulingInput(fixture);
    const output = schedulingOutput(fixture);
    await db.insert(productionSchema.productionLocations).values([
      {
        id: locationId,
        businessId: ids.business,
        name: 'Start Schedule Conformance',
        timezone: 'America/New_York',
      },
      {
        id: otherLocationId,
        businessId: ids.business,
        name: 'Start Schedule Other',
        timezone: 'America/New_York',
      },
    ]);
    await db.insert(productionSchema.productionShifts).values({
      id: ids.shift,
      locationId,
      startsAt: new Date(snapshot.shift.startsAt),
      endsAt: new Date(snapshot.shift.endsAt),
      timezone: snapshot.shift.timezone,
      status: 'open',
      effectiveFolderCount: snapshot.shift.effectiveFolderCount,
      version: 1,
    });
    const stations = [
      {
        id: ids.sortingStation,
        locationId,
        kind: 'sorting' as const,
        label: 'Sorting',
        sortOrder: 1,
      },
      {
        id: ids.washingStation,
        locationId,
        kind: 'washing' as const,
        label: 'Washing',
        sortOrder: 2,
      },
      {
        id: ids.dryingStation,
        locationId,
        kind: 'drying' as const,
        label: 'Drying',
        sortOrder: 3,
      },
      {
        id: ids.foldingStation,
        locationId,
        kind: 'folding_packaging' as const,
        label: 'Folding',
        sortOrder: 4,
      },
    ];
    await db
      .insert(productionSchema.stations)
      .values(
        fixture.fault === 'missing_station'
          ? stations.filter((station) => station.kind !== 'folding_packaging')
          : stations,
      );
    await db.insert(productionSchema.machines).values([
      {
        id: ids.washer,
        locationId,
        stationId: ids.washingStation,
        label: 'Washer',
        effectiveCapacityLbs: 100,
      },
      {
        id: ids.dryer,
        locationId,
        stationId: ids.dryingStation,
        label: 'Dryer',
        effectiveCapacityLbs: 100,
      },
    ]);
    await db.insert(productionSchema.schedulerConfigs).values({
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
    await seedOrder(db, {
      fulfillmentId: ids.fulfillmentA,
      demandId: ids.demandA,
      productionOrderId: ids.orderA,
      displayReference: 'START-A',
      dueAt: '2026-08-22T20:00:00.000Z',
      weight: 20,
      bagCount: 1,
      priority: true,
    });
    await seedOrder(db, {
      fulfillmentId: ids.fulfillmentB,
      demandId: ids.demandB,
      productionOrderId: ids.orderB,
      displayReference: 'START-B',
      dueAt: '2026-08-22T21:00:00.000Z',
      weight: 30,
      bagCount: 2,
      priority: false,
    });
    await db.insert(productionSchema.productionShiftSelections).values({
      productionShiftId: ids.shift,
      locationId,
      version: 1,
      selectedBy: ids.actor,
    });
    const selected = [
      {
        productionShiftId: ids.shift,
        locationId,
        productionOrderId: ids.orderA,
        selectedBy: ids.actor,
      },
      {
        productionShiftId: ids.shift,
        locationId,
        productionOrderId: ids.orderB,
        selectedBy: ids.actor,
      },
    ];
    await db
      .insert(productionSchema.productionShiftSelectedOrders)
      .values(
        fixture.snapshot === 'selection_stale'
          ? selected.slice(0, 1)
          : selected,
      );
    if (fixture.schedule !== 'missing') {
      const accepted = fixture.schedule !== 'draft';
      await db.insert(productionSchema.scheduleRuns).values({
        id: ids.schedule,
        locationId,
        productionShiftId: ids.shift,
        schedulerConfigId: ids.config,
        status: accepted ? 'accepted' : 'draft',
        inputSnapshot: snapshot,
        inputSnapshotHash: inputHash,
        outputPlan: output,
        outputPlanHash: outputHash,
        algorithmVersion: 'fixed-pulse-ffd-v2',
        pulseCapacityLbs: 100,
        batchCount: output.batches.length,
        makespanMinutes: output.makespanMinutes,
        plannedCompletionAt: new Date(output.plannedCompletionAt),
        warnings: output.warnings,
        acknowledgedWarningCodes: ['SHIFT_OVERFLOW'],
        createdAt: new Date('2026-08-22T13:00:00.000Z'),
        acceptedAt: accepted ? new Date('2026-08-22T13:30:00.000Z') : null,
        acceptedBy:
          accepted && fixture.acceptedBy !== null
            ? (fixture.acceptedBy ?? ids.actor)
            : null,
      });
    }
    if (fixture.snapshot === 'version_stale')
      await db
        .update(productionSchema.productionOrders)
        .set({ version: 2 })
        .where(sql`${productionSchema.productionOrders.id} = ${ids.orderA}`);
    if (fixture.existingRun === true)
      await db.insert(productionSchema.productionRuns).values({
        id: ids.existingRun,
        locationId,
        productionShiftId: ids.shift,
        scheduleRunId: ids.schedule,
        status: 'started',
        startedAt: now,
        queueVersion: 1,
        plannedCompletionAt: new Date('2026-08-22T23:00:00.000Z'),
        version: 1,
      });
    if (fixture.fault === 'receipt_id_collision')
      await db.insert(productionSchema.workEvents).values({
        id: generatedIds[23]!,
        locationId,
        eventType: 'fixture',
        entityType: 'fixture',
        entityId: ids.receiptEvent,
        actorId: ids.actor,
        idempotencyKey: 'start-receipt-id-collision-fixture',
        payload: {},
      });
    await seedStoredReceipt(db, fixture);
    await corruptSchedule(db, fixture);
    await installFault(fixture);
  } finally {
    currentFixture = undefined;
  }
};

const corruptSchedule = async (
  db: PostgresDatabase,
  fixture: StartScheduleFixture,
): Promise<void> => {
  if (fixture.corruptSchedule === undefined) return;
  const update =
    fixture.corruptSchedule === 'input'
      ? { inputSnapshot: { orders: [] } }
      : fixture.corruptSchedule === 'output'
        ? { outputPlan: {} }
        : { acknowledgedWarningCodes: ['UNKNOWN_WARNING'] };
  await db
    .update(productionSchema.scheduleRuns)
    .set(update)
    .where(sql`${productionSchema.scheduleRuns.id} = ${ids.schedule}`);
};

const installFault = async (fixture: StartScheduleFixture): Promise<void> => {
  const db = startScheduleConformanceFaultDatabase.db;
  if (fixture.fault === 'late_order_cas') {
    await db.execute(sql`
      create function start_schedule_conformance_reject_second_order()
      returns trigger language plpgsql as $$
      begin
        if old.id = '86000000-0000-4000-8000-000000000023'::uuid then
          return null;
        end if;
        return new;
      end;
      $$
    `);
    await db.execute(sql`
      create trigger start_schedule_conformance_order_cas
      before update on production_orders
      for each row execute function start_schedule_conformance_reject_second_order()
    `);
  }
  if (fixture.fault === 'slow_receipt') {
    await db.execute(sql`
      create function start_schedule_conformance_delay_receipt()
      returns trigger language plpgsql as $$
      begin perform pg_sleep(0.2); return new; end;
      $$
    `);
    await db.execute(sql`
      create trigger start_schedule_conformance_slow_receipt
      before insert on work_events
      for each row execute function start_schedule_conformance_delay_receipt()
    `);
  }
};

export const removeStartScheduleConformanceFaults = async (): Promise<void> => {
  const db = startScheduleConformanceFaultDatabase.db;
  await db.execute(
    sql`drop trigger if exists start_schedule_conformance_order_cas on production_orders`,
  );
  await db.execute(
    sql`drop trigger if exists start_schedule_conformance_slow_receipt on work_events`,
  );
  await db.execute(
    sql`drop function if exists start_schedule_conformance_reject_second_order()`,
  );
  await db.execute(
    sql`drop function if exists start_schedule_conformance_delay_receipt()`,
  );
};

export const resetStartScheduleConformance = async (): Promise<void> => {
  await removeStartScheduleConformanceFaults();
  await startScheduleConformanceDatabase.reset();
};

export const readStartScheduleConformanceState = async (
  db: PostgresDatabase,
) => {
  const [
    locations,
    schedules,
    shifts,
    productionOrders,
    runs,
    batches,
    memberships,
    stagesRows,
    assignments,
    attempts,
    workEvents,
  ] = await Promise.all([
    db
      .select({
        id: productionSchema.productionLocations.id,
        liveRevision: productionSchema.productionLocations.liveRevision,
      })
      .from(productionSchema.productionLocations)
      .orderBy(asc(productionSchema.productionLocations.id)),
    db
      .select()
      .from(productionSchema.scheduleRuns)
      .orderBy(asc(productionSchema.scheduleRuns.id)),
    db
      .select()
      .from(productionSchema.productionShifts)
      .orderBy(asc(productionSchema.productionShifts.id)),
    db
      .select()
      .from(productionSchema.productionOrders)
      .orderBy(asc(productionSchema.productionOrders.id)),
    db
      .select()
      .from(productionSchema.productionRuns)
      .orderBy(asc(productionSchema.productionRuns.id)),
    db
      .select()
      .from(productionSchema.productionBatches)
      .orderBy(
        asc(productionSchema.productionBatches.sequenceIndex),
        asc(productionSchema.productionBatches.id),
      ),
    db
      .select({
        locationId: productionSchema.productionBatchOrders.locationId,
        productionBatchId:
          productionSchema.productionBatchOrders.productionBatchId,
        productionOrderId:
          productionSchema.productionBatchOrders.productionOrderId,
        active: productionSchema.productionBatchOrders.active,
        placementProvenance:
          productionSchema.productionBatchOrders.placementProvenance,
        pinnedAt: productionSchema.productionBatchOrders.pinnedAt,
        pinnedBy: productionSchema.productionBatchOrders.pinnedBy,
        releasedAt: productionSchema.productionBatchOrders.releasedAt,
        releasedBy: productionSchema.productionBatchOrders.releasedBy,
        releaseReason: productionSchema.productionBatchOrders.releaseReason,
      })
      .from(productionSchema.productionBatchOrders)
      .orderBy(
        asc(productionSchema.productionBatchOrders.productionBatchId),
        asc(productionSchema.productionBatchOrders.productionOrderId),
      ),
    db
      .select()
      .from(productionSchema.stageRuns)
      .orderBy(
        asc(productionSchema.stageRuns.plannedStartAt),
        asc(productionSchema.stageRuns.id),
      ),
    db
      .select()
      .from(productionSchema.stageMachineAssignments)
      .orderBy(asc(productionSchema.stageMachineAssignments.id)),
    db
      .select()
      .from(productionSchema.productionOrderStageAttempts)
      .orderBy(asc(productionSchema.productionOrderStageAttempts.id)),
    db
      .select()
      .from(productionSchema.workEvents)
      .orderBy(asc(productionSchema.workEvents.id)),
  ]);
  return Object.freeze({
    locations,
    schedules,
    shifts,
    productionOrders,
    runs,
    batches,
    memberships,
    stages: stagesRows,
    assignments,
    attempts,
    workEvents,
  });
};
