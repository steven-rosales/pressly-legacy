import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc, eq, sql } from '@pressly/postgres/query';
import {
  createTestDatabaseRuntime,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';
import {
  placementConformanceIds as ids,
  placementConformanceLocationId as locationId,
  placementConformanceNormalEnd,
  placementConformanceOvertimeEnd,
  placementConformanceStartsAt as startsAt,
  type PlacementFixture,
} from '../../src/placement-bundle-conformance.ts';

const productionSchema = presslyPostgresOwnerSchemas.production;

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const adminDatabaseUrl =
  process.env['PRESSLY_PLACEMENT_CONFORMANCE_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';

const databaseUrl = (name: string): string => {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${name}`;
  url.search = '';
  return url.toString();
};

const run = (executable: string, args: readonly string[], env = process.env) =>
  execFileSync(executable, [...args], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180_000,
  });

const dropDatabase = (name: string): void => {
  run('dropdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--if-exists',
    '--force',
    name,
  ]);
};

const createDatabase = (name: string): void => {
  run('createdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--template',
    'template0',
    name,
  ]);
  run('pnpm', ['db:migrate'], {
    ...process.env,
    DATABASE_URL: databaseUrl(name),
    NODE_ENV: 'test',
  });
};

const databaseExists = (name: string): boolean =>
  run('psql', [
    adminDatabaseUrl,
    '-Atqc',
    `select datname from pg_database where datname = '${name}'`,
  ]).trim() === name;

const tableNames = [
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
  'production_orders',
  'production_shifts',
  'order_demands',
  'production_locations',
] as const;

export type PlacementConformanceDatabase = TestDatabaseRuntime &
  Readonly<{ name: string; url: string }>;

export type PlacementConformanceDatabaseRuntime = Readonly<{
  database: PlacementConformanceDatabase;
  setup: () => Promise<void>;
  closeForceDropAndVerifyAbsent: () => Promise<boolean>;
}>;

export const createPlacementConformanceDatabase =
  (): PlacementConformanceDatabaseRuntime => {
    const suffix = `${process.pid}_${Date.now().toString(36)}`;
    const name = `pressly_placement_${suffix}_conformance_test`;
    const url = databaseUrl(name);
    const database = Object.freeze({
      name,
      url,
      ...createTestDatabaseRuntime({
        databaseUrl: url,
        tableNames,
        maxConnections: 12,
      }),
    });
    return Object.freeze({
      database,
      setup: async () => {
        dropDatabase(name);
        createDatabase(name);
        await database.check();
      },
      closeForceDropAndVerifyAbsent: async () => {
        await database.close();
        dropDatabase(name);
        return databaseExists(name);
      },
    });
  };

const removeFaults = async (db: PostgresDatabase): Promise<void> => {
  await db.execute(
    sql`drop trigger if exists placement_conformance_reject_stage on stage_runs`,
  );
  await db.execute(
    sql`drop trigger if exists placement_conformance_reject_order on production_orders`,
  );
  await db.execute(
    sql`drop trigger if exists placement_conformance_reject_run on production_runs`,
  );
  await db.execute(
    sql`drop trigger if exists placement_conformance_reject_event on work_events`,
  );
  await db.execute(
    sql`drop trigger if exists placement_conformance_delay_event on work_events`,
  );
  await db.execute(
    sql`drop function if exists placement_conformance_return_null()`,
  );
  await db.execute(
    sql`drop function if exists placement_conformance_raise_event()`,
  );
  await db.execute(
    sql`drop function if exists placement_conformance_sleep_event()`,
  );
};

export const resetPlacementConformanceDatabase = async (
  database: PlacementConformanceDatabase,
): Promise<void> => {
  await removeFaults(database.db);
  await database.reset();
};

const shiftEnd = (fixture: PlacementFixture): Date =>
  fixture.shiftEnd === 'overtime'
    ? placementConformanceOvertimeEnd
    : placementConformanceNormalEnd;

const pulseMinutes = 56;
const stageKinds = [
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
] as const;

const stageProjection = (sequence: number) =>
  stageKinds.map((stage, index) => {
    const stageStartsAt = new Date(
      startsAt.getTime() + (sequence + index) * pulseMinutes * 60_000,
    );
    return {
      stage,
      startsAt: stageStartsAt.toISOString(),
      endsAt: new Date(
        stageStartsAt.getTime() + pulseMinutes * 60_000,
      ).toISOString(),
      machineIds:
        stage === 'washing'
          ? [ids.washer]
          : stage === 'drying'
            ? [ids.dryer]
            : [],
    };
  });

const stationId = (stage: (typeof stageKinds)[number]): string =>
  ({
    sorting: ids.sortingStation,
    washing: ids.washingStation,
    drying: ids.dryingStation,
    folding_packaging: ids.foldingStation,
  })[stage];

const seedLocation = async (db: PostgresDatabase): Promise<void> => {
  await db.insert(productionSchema.productionLocations).values({
    id: locationId,
    businessId: ids.business,
    name: 'Placement Conformance Facility',
    timezone: 'America/New_York',
    isActive: true,
    liveRevision: 0,
    createdAt: startsAt,
    updatedAt: startsAt,
  });
  await db.insert(productionSchema.stations).values(
    stageKinds.map((kind, index) => ({
      id: stationId(kind),
      locationId,
      kind,
      label: kind,
      sortOrder: index + 1,
    })),
  );
  await db.insert(productionSchema.machines).values([
    {
      id: ids.washer,
      locationId,
      stationId: ids.washingStation,
      label: 'Washer 1',
      effectiveCapacityLbs: 100,
      isActive: true,
    },
    {
      id: ids.dryer,
      locationId,
      stationId: ids.dryingStation,
      label: 'Dryer 1',
      effectiveCapacityLbs: 100,
      isActive: true,
    },
  ]);
};

const seedProductionOrders = async (
  db: PostgresDatabase,
  fixture: PlacementFixture,
): Promise<void> => {
  const end = shiftEnd(fixture);
  const arrivingWeight = fixture.arrivingWeightLbs ?? 20;
  const demands = [
    [ids.demandFrozen, ids.fulfillmentFrozen, 'placement-frozen', 50],
    [
      ids.demandQueued,
      ids.fulfillmentQueued,
      'placement-queued',
      fixture.mutableBatch === 'full' ? 100 : 40,
    ],
    [ids.demandA, ids.fulfillmentA, 'placement-arriving-a', arrivingWeight],
    [ids.demandB, ids.fulfillmentB, 'placement-arriving-b', 20],
  ] as const;
  await db.insert(productionSchema.orderDemands).values(
    demands.map(
      ([id, fulfillmentId, displayReference, estimatedWeightLbs]) => ({
        id,
        fulfillmentId,
        fulfillmentVersion: 1,
        projectionHash: 'a'.repeat(64),
        admissionState: 'released' as const,
        commercialState: 'open' as const,
        displayReference,
        locationId,

        revisionAt: startsAt,
        phase: 'production_released' as const,
        estimatedWeightLbs,
        estimatedWeightSource: 'test_estimate',
        dueAt: end,
      }),
    ),
  );
  await db.insert(productionSchema.productionOrders).values([
    {
      id: ids.orderFrozen,
      orderDemandId: ids.demandFrozen,
      locationId,
      dueAt: end,
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      resolutionState: 'open',
      derivedWeightLbs: 50,
      bagCount: 2,
      bagCountSource: 'operator_intake',
      intakeVersion: 1,
      eligibleAt: startsAt,
      version: 1,
      createdAt: startsAt,
      updatedAt: startsAt,
    },
    {
      id: ids.orderQueued,
      orderDemandId: ids.demandQueued,
      locationId,
      dueAt: end,
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      resolutionState: 'open',
      derivedWeightLbs: fixture.mutableBatch === 'full' ? 100 : 40,
      bagCount: 1,
      bagCountSource: 'operator_intake',
      intakeVersion: 1,
      eligibleAt: startsAt,
      version: 1,
      createdAt: startsAt,
      updatedAt: startsAt,
    },
    ...[
      [ids.orderA, ids.demandA, arrivingWeight],
      [ids.orderB, ids.demandB, 20],
    ].map(([id, orderDemandId, derivedWeightLbs]) => ({
      id: id as string,
      orderDemandId: orderDemandId as string,
      locationId,
      dueAt: end,
      operationalStatus: 'eligible' as const,
      executionStatus: 'unassigned' as const,
      resolutionState: 'open' as const,
      derivedWeightLbs: derivedWeightLbs as number,
      bagCount: 1,
      bagCountSource: 'operator_intake' as const,
      intakeVersion: 1,
      eligibleAt: startsAt,
      version: 1,
      createdAt: startsAt,
      updatedAt: startsAt,
    })),
  ]);
};

const scheduleInput = (
  input: Readonly<{
    shiftId: string;
    configId: string;
    end: Date;
  }>,
) => ({
  orders: [],
  machines: [
    {
      id: ids.washer,
      stationKind: 'washing',
      effectiveCapacityLbs: 100,
      active: true,
    },
    {
      id: ids.dryer,
      stationKind: 'drying',
      effectiveCapacityLbs: 100,
      active: true,
    },
  ],
  shift: {
    id: input.shiftId,
    startsAt: startsAt.toISOString(),
    endsAt: input.end.toISOString(),
    timezone: 'America/New_York',
    effectiveFolderCount: 2,
    version: 1,
  },
  config: {
    id: input.configId,
    pulseMinutes,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: 1,
  },
});

const scheduleOutput = (end: Date) => ({
  algorithmVersion: 'fixed-pulse-ffd-v2',
  inputSnapshotHash: 'a'.repeat(64),
  outputPlanHash: 'b'.repeat(64),
  canonicalOutput: '{}',
  pulseMinutes,
  pulseCapacityLbs: 100,
  batchCount: 2,
  makespanMinutes: 336,
  plannedCompletionAt: end.toISOString(),
  batches: [],
  unplacedOrderIds: [],
  warnings: [],
});

const seedRun = async (
  db: PostgresDatabase,
  fixture: PlacementFixture,
  which: 'A' | 'B',
): Promise<void> => {
  const end = shiftEnd(fixture);
  const selected =
    which === 'A'
      ? {
          shift: ids.shiftA,
          config: ids.configA,
          schedule: ids.scheduleA,
          run: ids.runA,
          version: 1,
        }
      : {
          shift: ids.shiftB,
          config: ids.configB,
          schedule: ids.scheduleB,
          run: ids.runB,
          version: 2,
        };
  await db.insert(productionSchema.productionShifts).values({
    id: selected.shift,
    locationId,
    startsAt,
    endsAt: end,
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
    version: 1,
    createdAt: startsAt,
    updatedAt: startsAt,
  });
  await db.insert(productionSchema.schedulerConfigs).values({
    id: selected.config,
    locationId,
    pulseMinutes,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: selected.version,
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
    },
    assertedBy: ids.actor,
    publishedAt: startsAt,
  });
  const output = scheduleOutput(end);
  await db.insert(productionSchema.scheduleRuns).values({
    id: selected.schedule,
    locationId,
    productionShiftId: selected.shift,
    schedulerConfigId: selected.config,
    status: 'accepted',
    inputSnapshot: scheduleInput({
      shiftId: selected.shift,
      configId: selected.config,
      end,
    }),
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: output,
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 2,
    makespanMinutes: 336,
    plannedCompletionAt: end,
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: startsAt,
    acceptedBy: ids.actor,
    createdAt: startsAt,
  });
  await db.insert(productionSchema.productionRuns).values({
    id: selected.run,
    locationId,
    productionShiftId: selected.shift,
    scheduleRunId: selected.schedule,
    status: 'started',
    startedAt: startsAt,
    queueVersion: which === 'A' ? 1 : 7,
    plannedCompletionAt: end,
    version: 1,
    createdAt: startsAt,
    updatedAt: startsAt,
  });
};

const seedBatches = async (
  db: PostgresDatabase,
  fixture: PlacementFixture,
): Promise<void> => {
  const mutableFrozen = fixture.mutableBatch === 'frozen';
  const mutableWeight = fixture.mutableBatch === 'full' ? 100 : 40;
  await db.insert(productionSchema.productionBatches).values([
    {
      id: ids.frozenBatch,
      locationId,
      productionRunId: ids.runA,
      sequenceIndex: 0,
      status: 'sorting',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 50,
      pulseMinutes,
      plannedDoneAt: new Date(stageProjection(0).at(-1)!.endsAt),
      startedAt: startsAt,
      membershipFrozenAt: startsAt,
      membershipFrozenBy: ids.actor,
      version: 2,
      createdAt: startsAt,
      updatedAt: startsAt,
    },
    {
      id: ids.mutableBatch,
      locationId,
      productionRunId: ids.runA,
      sequenceIndex: 1,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: mutableWeight,
      pulseMinutes,
      plannedDoneAt: new Date(stageProjection(1).at(-1)!.endsAt),
      membershipFrozenAt: mutableFrozen ? startsAt : null,
      membershipFrozenBy: mutableFrozen ? ids.actor : null,
      version: mutableFrozen ? 2 : 1,
      createdAt: startsAt,
      updatedAt: startsAt,
    },
  ]);
  await db.insert(productionSchema.productionBatchOrders).values([
    {
      locationId,
      productionBatchId: ids.frozenBatch,
      productionOrderId: ids.orderFrozen,
      active: true,
      placementProvenance: 'initial_schedule',
      placedAt: startsAt,
      placedBy: ids.actor,
    },
    {
      locationId,
      productionBatchId: ids.mutableBatch,
      productionOrderId: ids.orderQueued,
      active: true,
      placementProvenance: 'initial_schedule',
      placedAt: startsAt,
      placedBy: ids.actor,
    },
  ]);
  await db.insert(productionSchema.stageRuns).values({
    id: ids.frozenSorting,
    locationId,
    productionBatchId: ids.frozenBatch,
    stationId: ids.sortingStation,
    stageKind: 'sorting',
    status: 'started',
    plannedStartAt: new Date(stageProjection(0)[0]!.startsAt),
    plannedEndAt: new Date(stageProjection(0)[0]!.endsAt),
    actualStartAt: startsAt,
    actualStartProvenance: 'live_observed',
    startedBy: ids.actor,
    version: 2,
    createdAt: startsAt,
    updatedAt: startsAt,
  });
  const mutableStageIds = [
    ids.mutableSorting,
    ids.mutableWashing,
    ids.mutableDrying,
    ids.mutableFolding,
  ];
  const mutableStages = stageProjection(1);
  await db.insert(productionSchema.stageRuns).values(
    mutableStages.map((stage, index) => ({
      id: mutableStageIds[index]!,
      locationId,
      productionBatchId: ids.mutableBatch,
      stationId: stationId(stage.stage),
      stageKind: stage.stage,
      status: 'planned' as const,
      plannedStartAt: new Date(stage.startsAt),
      plannedEndAt: new Date(stage.endsAt),
      version: 1,
      createdAt: startsAt,
      updatedAt: startsAt,
    })),
  );
  await db.insert(productionSchema.stageMachineAssignments).values(
    mutableStages.flatMap((stage, index) =>
      stage.machineIds.map((machineId) => {
        const id =
          stage.stage === 'washing'
            ? ids.mutableWashingAssignment
            : ids.mutableDryingAssignment;
        return {
          id,
          locationId,
          stageRunId: mutableStageIds[index]!,
          machineId,
          plannedStartAt: new Date(stage.startsAt),
          plannedEndAt: new Date(stage.endsAt),
          status: 'planned' as const,
          createdAt: startsAt,
          updatedAt: startsAt,
        };
      }),
    ),
  );
};

const installFault = async (
  db: PostgresDatabase,
  fault: PlacementFixture['fault'],
): Promise<void> => {
  if (fault === undefined) return;
  if (fault === 'event_append') {
    await db.execute(
      sql`create function placement_conformance_raise_event() returns trigger language plpgsql as $$ begin raise exception 'placement event append fault'; end; $$`,
    );
    await db.execute(
      sql`create trigger placement_conformance_reject_event before insert on work_events for each row execute function placement_conformance_raise_event()`,
    );
    return;
  }
  await db.execute(
    sql`create function placement_conformance_return_null() returns trigger language plpgsql as $$ begin return null; end; $$`,
  );
  const trigger =
    fault === 'stage_cas'
      ? sql`create trigger placement_conformance_reject_stage before update on stage_runs for each row execute function placement_conformance_return_null()`
      : fault === 'order_cas'
        ? sql`create trigger placement_conformance_reject_order before update on production_orders for each row execute function placement_conformance_return_null()`
        : sql`create trigger placement_conformance_reject_run before update on production_runs for each row execute function placement_conformance_return_null()`;
  await db.execute(trigger);
};

export const seedPlacementConformance = async (
  db: PostgresDatabase,
  fixture: PlacementFixture,
): Promise<void> => {
  await seedLocation(db);
  await seedProductionOrders(db, fixture);
  const runCount = fixture.runCount ?? 1;
  if (runCount >= 1) {
    await seedRun(db, fixture, 'A');
    await seedBatches(db, fixture);
  }
  if (runCount === 2) await seedRun(db, fixture, 'B');
  await installFault(db, fixture.fault);
};

export const installPlacementReceiptDelay = async (
  db: PostgresDatabase,
): Promise<void> => {
  await db.execute(
    sql`create function placement_conformance_sleep_event() returns trigger language plpgsql as $$ begin perform pg_sleep(0.10); return new; end; $$`,
  );
  await db.execute(
    sql`create trigger placement_conformance_delay_event before insert on work_events for each row execute function placement_conformance_sleep_event()`,
  );
};

export const driftPlacementQueue = async (
  db: PostgresDatabase,
): Promise<void> => {
  await db
    .update(productionSchema.productionRuns)
    .set({
      queueVersion: sql`${productionSchema.productionRuns.queueVersion} + 1`,
    })
    .where(eq(productionSchema.productionRuns.id, ids.runA));
};

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

export const readPlacementConformanceState = async (db: PostgresDatabase) => {
  const locations = await db
    .select({
      id: productionSchema.productionLocations.id,
      liveRevision: productionSchema.productionLocations.liveRevision,
    })
    .from(productionSchema.productionLocations)
    .orderBy(asc(productionSchema.productionLocations.id));
  const runs = (
    await db
      .select({
        id: productionSchema.productionRuns.id,
        status: productionSchema.productionRuns.status,
        queueVersion: productionSchema.productionRuns.queueVersion,
        plannedCompletionAt:
          productionSchema.productionRuns.plannedCompletionAt,
        overtimeProposalHash:
          productionSchema.productionRuns.overtimeProposalHash,
        overtimeQueueVersion:
          productionSchema.productionRuns.overtimeQueueVersion,
        overtimeAcknowledgedBy:
          productionSchema.productionRuns.overtimeAcknowledgedBy,
        overtimeAcknowledgedAt:
          productionSchema.productionRuns.overtimeAcknowledgedAt,
        version: productionSchema.productionRuns.version,
        updatedAt: productionSchema.productionRuns.updatedAt,
      })
      .from(productionSchema.productionRuns)
      .orderBy(asc(productionSchema.productionRuns.id))
  ).map((row) => ({
    ...row,
    plannedCompletionAt: iso(row.plannedCompletionAt),
    overtimeAcknowledgedAt: iso(row.overtimeAcknowledgedAt),
    updatedAt: iso(row.updatedAt),
  }));
  const productionOrders = (
    await db
      .select({
        id: productionSchema.productionOrders.id,
        operationalStatus: productionSchema.productionOrders.operationalStatus,
        executionStatus: productionSchema.productionOrders.executionStatus,
        resolutionState: productionSchema.productionOrders.resolutionState,
        derivedWeightLbs: productionSchema.productionOrders.derivedWeightLbs,
        bagCount: productionSchema.productionOrders.bagCount,
        pendingPlacement: productionSchema.productionOrders.pendingPlacement,
        version: productionSchema.productionOrders.version,
        updatedAt: productionSchema.productionOrders.updatedAt,
      })
      .from(productionSchema.productionOrders)
      .orderBy(asc(productionSchema.productionOrders.id))
  ).map((row) => ({ ...row, updatedAt: iso(row.updatedAt) }));
  const batches = (
    await db
      .select({
        id: productionSchema.productionBatches.id,
        productionRunId: productionSchema.productionBatches.productionRunId,
        sequenceIndex: productionSchema.productionBatches.sequenceIndex,
        status: productionSchema.productionBatches.status,
        derivedWeightLbs: productionSchema.productionBatches.derivedWeightLbs,
        membershipFrozenAt:
          productionSchema.productionBatches.membershipFrozenAt,
        membershipFrozenBy:
          productionSchema.productionBatches.membershipFrozenBy,
        plannedDoneAt: productionSchema.productionBatches.plannedDoneAt,
        version: productionSchema.productionBatches.version,
        updatedAt: productionSchema.productionBatches.updatedAt,
      })
      .from(productionSchema.productionBatches)
      .orderBy(
        asc(productionSchema.productionBatches.productionRunId),
        asc(productionSchema.productionBatches.sequenceIndex),
      )
  ).map((row) => ({
    ...row,
    membershipFrozenAt: iso(row.membershipFrozenAt),
    plannedDoneAt: iso(row.plannedDoneAt),
    updatedAt: iso(row.updatedAt),
  }));
  const memberships = (
    await db
      .select({
        productionBatchId:
          productionSchema.productionBatchOrders.productionBatchId,
        productionOrderId:
          productionSchema.productionBatchOrders.productionOrderId,
        active: productionSchema.productionBatchOrders.active,
        placementProvenance:
          productionSchema.productionBatchOrders.placementProvenance,
        placedAt: productionSchema.productionBatchOrders.placedAt,
        placedBy: productionSchema.productionBatchOrders.placedBy,
        pinnedAt: productionSchema.productionBatchOrders.pinnedAt,
        pinnedBy: productionSchema.productionBatchOrders.pinnedBy,
      })
      .from(productionSchema.productionBatchOrders)
      .orderBy(
        asc(productionSchema.productionBatchOrders.productionOrderId),
        asc(productionSchema.productionBatchOrders.productionBatchId),
      )
  ).map((row) => ({
    ...row,
    placedAt: iso(row.placedAt),
    pinnedAt: iso(row.pinnedAt),
  }));
  const stages = (
    await db
      .select({
        id: productionSchema.stageRuns.id,
        productionBatchId: productionSchema.stageRuns.productionBatchId,
        stageKind: productionSchema.stageRuns.stageKind,
        status: productionSchema.stageRuns.status,
        plannedStartAt: productionSchema.stageRuns.plannedStartAt,
        plannedEndAt: productionSchema.stageRuns.plannedEndAt,
        version: productionSchema.stageRuns.version,
        updatedAt: productionSchema.stageRuns.updatedAt,
      })
      .from(productionSchema.stageRuns)
      .orderBy(
        asc(productionSchema.stageRuns.productionBatchId),
        asc(productionSchema.stageRuns.stageKind),
      )
  ).map((row) => ({
    ...row,
    plannedStartAt: iso(row.plannedStartAt),
    plannedEndAt: iso(row.plannedEndAt),
    updatedAt: iso(row.updatedAt),
  }));
  const assignments = (
    await db
      .select({
        id: productionSchema.stageMachineAssignments.id,
        stageRunId: productionSchema.stageMachineAssignments.stageRunId,
        machineId: productionSchema.stageMachineAssignments.machineId,
        status: productionSchema.stageMachineAssignments.status,
        plannedStartAt: productionSchema.stageMachineAssignments.plannedStartAt,
        plannedEndAt: productionSchema.stageMachineAssignments.plannedEndAt,
        updatedAt: productionSchema.stageMachineAssignments.updatedAt,
      })
      .from(productionSchema.stageMachineAssignments)
      .orderBy(asc(productionSchema.stageMachineAssignments.id))
  ).map((row) => ({
    ...row,
    plannedStartAt: iso(row.plannedStartAt),
    plannedEndAt: iso(row.plannedEndAt),
    updatedAt: iso(row.updatedAt),
  }));
  const attempts = (
    await db
      .select({
        id: productionSchema.productionOrderStageAttempts.id,
        productionRunId:
          productionSchema.productionOrderStageAttempts.productionRunId,
        productionOrderId:
          productionSchema.productionOrderStageAttempts.productionOrderId,
        stageRunId: productionSchema.productionOrderStageAttempts.stageRunId,
        stageKind: productionSchema.productionOrderStageAttempts.stageKind,
        attemptNumber:
          productionSchema.productionOrderStageAttempts.attemptNumber,
        status: productionSchema.productionOrderStageAttempts.status,
        assignmentReason:
          productionSchema.productionOrderStageAttempts.assignmentReason,
        assignedAt: productionSchema.productionOrderStageAttempts.assignedAt,
        assignedBy: productionSchema.productionOrderStageAttempts.assignedBy,
      })
      .from(productionSchema.productionOrderStageAttempts)
      .orderBy(asc(productionSchema.productionOrderStageAttempts.id))
  ).map((row) => ({ ...row, assignedAt: iso(row.assignedAt) }));
  const events = await db
    .select({
      id: productionSchema.workEvents.id,
      eventType: productionSchema.workEvents.eventType,
      entityType: productionSchema.workEvents.entityType,
      entityId: productionSchema.workEvents.entityId,
      actorId: productionSchema.workEvents.actorId,
      expectedVersion: productionSchema.workEvents.expectedVersion,
      idempotencyKey: productionSchema.workEvents.idempotencyKey,
      payload: productionSchema.workEvents.payload,
    })
    .from(productionSchema.workEvents)
    .orderBy(asc(productionSchema.workEvents.id));
  return Object.freeze({
    locations,
    runs,
    productionOrders,
    batches,
    memberships,
    stages,
    assignments,
    attempts,
    events,
  });
};
