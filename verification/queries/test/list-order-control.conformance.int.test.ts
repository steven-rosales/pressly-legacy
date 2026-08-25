import {
  makeProductionActorReadV1Capability,
  makeProductionScopeReconciliationV1Capability,
} from '@pressly/access-system/assembly/production-capabilities';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import { listOrderControlContract } from '@pressly/production-system/operations/orders/list-order-control/contract';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import type { ListOrderControlInput } from '@pressly/production-system/operations/orders/list-order-control/types';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  captureListOrderControlOutcome,
  listOrderControlAsOf,
  listOrderControlConformanceScenarios,
  listOrderControlIds as ids,
  listOrderControlInactiveLocationId,
  listOrderControlLocationId,
  listOrderControlNextCursor,
  listOrderControlSiblingLocationId,
  runListOrderControlConformanceScenario,
  type CanonicalListOrderControlOutcome,
  type ListOrderControlConformanceScenario,
} from '../src/public.ts';
import { seedProductionLocationConformanceFacts } from './support/production-location-conformance.postgres.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_list_order_control_conformance_test',
  ),
  tableNames: [
    'stage_machine_assignments',
    'production_order_stage_attempts',
    'stage_runs',
    'production_batch_orders',
    'production_batches',
    'production_runs',
    'work_events',
    'production_shift_selected_orders',
    'production_shift_selections',
    'schedule_runs',
    'scheduler_configs',
    'production_machines',
    'production_stations',
    'production_orders',
    'order_demands',
    'production_shifts',
    'production_locations',
    'access_production_locations',
    'business_accounts',
  ],
  maxConnections: 2,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : { resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'] }),
});

beforeAll(database.check);
afterAll(database.close);

const uuid = (suffix: number, prefix = 34100000): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const today = new Date('2026-03-08T15:00:00.000Z');
const tomorrow = new Date('2026-03-09T04:00:00.000Z');
const overdue = new Date('2026-03-08T04:59:59.999Z');
const stageId = (batch: number, stage: number): string =>
  uuid(batch * 10 + stage + 1, 34200000);
const attemptId = (order: number, stage: number): string =>
  uuid(order * 10 + stage + 1, 34300000);

type SeedOrder = Readonly<{
  id: string;
  display: string;
  status:
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'scheduled'
    | 'finished';
  dueAt?: Date;
  location?: string;
  phase?: 'expected' | 'production_released' | 'post_production';
  admission?: 'unreleased' | 'released' | 'withdrawn';
  admissionOverride?: 'released' | null;
  priority?: boolean;
  pendingPlacement?: unknown;
  resolution?: 'open' | 'resolved_without_production';
  weight?: number;
  bagCount?: number | null;
}>;

const seedOrder = async (input: SeedOrder): Promise<void> => {
  const location = input.location ?? listOrderControlLocationId;
  const suffix = Number(input.id.slice(-12));
  const fulfillmentId = uuid(suffix + 2000);
  const demandId = uuid(suffix + 3000);
  const dueAt = input.dueAt ?? today;
  const bagCount =
    input.bagCount === undefined
      ? input.status === 'release_pending' || input.status === 'intake_pending'
        ? null
        : 1
      : input.bagCount;
  const phase =
    input.phase ??
    (input.status === 'release_pending'
      ? 'expected'
      : input.status === 'finished'
        ? 'post_production'
        : 'production_released');
  const admission =
    input.admission ??
    (input.status === 'release_pending' ? 'unreleased' : 'released');
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.orderDemands)
    .values({
      id: demandId,
      fulfillmentId,
      fulfillmentVersion: 1,
      projectionHash: 'a'.repeat(64),
      admissionState: admission,
      commercialState: 'open',
      displayReference: input.display,
      locationId: location,
      revisionAt: dueAt,
      phase,
      estimatedWeightLbs: input.weight ?? 20,
      estimatedWeightSource: 'test',
      dueAt,
    });
  const resolution = input.resolution ?? 'open';
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionOrders)
    .values({
      id: input.id,
      orderDemandId: demandId,
      locationId: location,
      dueAt,
      priority: input.priority ?? false,
      operationalStatus: input.status,
      executionStatus:
        input.status === 'scheduled'
          ? 'scheduled'
          : input.status === 'finished'
            ? 'finished'
            : 'unassigned',
      resolutionState: resolution,
      ...(resolution === 'resolved_without_production'
        ? {
            resolvedAt: listOrderControlAsOf,
            resolvedBy: ids.actor,
            resolutionReason: 'completed_outside_pressly',
          }
        : {}),
      derivedWeightLbs: input.weight ?? 20,
      bagCount,
      bagCountSource: bagCount === null ? null : 'operator_intake',
      intakeRecordedAt: bagCount === null ? null : dueAt,
      intakeVersion: bagCount === null ? 0 : 1,
      admissionOverride: input.admissionOverride ?? null,
      ...(input.admissionOverride === 'released'
        ? {
            admissionOverrideAt: listOrderControlAsOf,
            admissionOverrideBy: ids.actor,
          }
        : {}),
      eligibleAt:
        input.status === 'eligible' || input.status === 'scheduled'
          ? dueAt
          : null,
      finishedAt: input.status === 'finished' ? dueAt : null,
      pendingPlacement: input.pendingPlacement ?? null,
      version: input.status === 'scheduled' ? 3 : 1,
    });
};

const seedRootsAndRun = async (): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.access.businessAccounts)
    .values({
      id: ids.business,
      slug: 'list-order-control-conformance',
      displayName: 'List Order Control Conformance',
    });
  await seedProductionLocationConformanceFacts(database.db, [
    {
      id: listOrderControlLocationId,
      businessId: ids.business,
      name: 'Order Control Main',
      timezone: 'America/New_York',
      liveRevision: 13,
    },
    {
      id: listOrderControlSiblingLocationId,
      businessId: ids.business,
      name: 'Order Control Sibling',
      timezone: 'America/Chicago',
      liveRevision: 6,
    },
    {
      id: listOrderControlInactiveLocationId,
      businessId: ids.business,
      name: 'Order Control Inactive',
      timezone: 'America/New_York',
      isActive: false,
      liveRevision: 2,
    },
  ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.access.accessProductionLocations)
    .values([
      {
        id: listOrderControlLocationId,
        businessId: ids.business,
        name: 'Order Control Main',
        timezone: 'America/New_York',
      },
      {
        id: listOrderControlSiblingLocationId,
        businessId: ids.business,
        name: 'Order Control Sibling',
        timezone: 'America/Chicago',
      },
      {
        id: listOrderControlInactiveLocationId,
        businessId: ids.business,
        name: 'Order Control Inactive',
        timezone: 'America/New_York',
        isActive: false,
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionShifts)
    .values([
      {
        id: ids.shift,
        locationId: listOrderControlLocationId,
        startsAt: new Date('2026-03-08T13:00:00.000Z'),
        endsAt: new Date('2026-03-08T22:00:00.000Z'),
        timezone: 'America/New_York',
        status: 'open',
        effectiveFolderCount: 2,
      },
      {
        id: ids.siblingShift,
        locationId: listOrderControlSiblingLocationId,
        startsAt: new Date('2026-03-08T13:00:00.000Z'),
        endsAt: new Date('2026-03-08T22:00:00.000Z'),
        timezone: 'America/Chicago',
        status: 'open',
        effectiveFolderCount: 2,
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .values([
      {
        id: ids.config,
        locationId: listOrderControlLocationId,
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
      },
      {
        id: ids.siblingConfig,
        locationId: listOrderControlSiblingLocationId,
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
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.scheduleRuns)
    .values([
      {
        id: ids.schedule,
        locationId: listOrderControlLocationId,
        productionShiftId: ids.shift,
        schedulerConfigId: ids.config,
        status: 'accepted',
        inputSnapshot: { orders: [{ id: ids.activeA }] },
        inputSnapshotHash: 'c'.repeat(64),
        outputPlan: {},
        outputPlanHash: 'd'.repeat(64),
        algorithmVersion: 'fixed-pulse-ffd-v2',
        pulseCapacityLbs: 100,
        batchCount: 3,
        makespanMinutes: 336,
        plannedCompletionAt: new Date('2026-03-08T21:00:00.000Z'),
        acceptedAt: new Date('2026-03-08T12:00:00.000Z'),
        acceptedBy: ids.actor,
      },
      {
        id: ids.siblingSchedule,
        locationId: listOrderControlSiblingLocationId,
        productionShiftId: ids.siblingShift,
        schedulerConfigId: ids.siblingConfig,
        status: 'accepted',
        inputSnapshot: {},
        inputSnapshotHash: 'e'.repeat(64),
        outputPlan: {},
        outputPlanHash: 'f'.repeat(64),
        algorithmVersion: 'fixed-pulse-ffd-v2',
        pulseCapacityLbs: 100,
        batchCount: 0,
        makespanMinutes: 0,
        plannedCompletionAt: new Date('2026-03-08T21:00:00.000Z'),
        acceptedAt: new Date('2026-03-08T12:00:00.000Z'),
        acceptedBy: ids.actor,
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionRuns)
    .values([
      {
        id: ids.run,
        locationId: listOrderControlLocationId,
        productionShiftId: ids.shift,
        scheduleRunId: ids.schedule,
        status: 'started',
        startedAt: new Date('2026-03-08T13:00:00.000Z'),
        queueVersion: 5,
        plannedCompletionAt: new Date('2026-03-08T21:00:00.000Z'),
      },
      {
        id: ids.siblingRun,
        locationId: listOrderControlSiblingLocationId,
        productionShiftId: ids.siblingShift,
        scheduleRunId: ids.siblingSchedule,
        status: 'started',
        startedAt: new Date('2026-03-08T13:00:00.000Z'),
        queueVersion: 1,
        plannedCompletionAt: new Date('2026-03-08T21:00:00.000Z'),
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionBatches)
    .values([
      {
        id: ids.sourceBatch,
        locationId: listOrderControlLocationId,
        productionRunId: ids.run,
        sequenceIndex: 0,
        status: 'queued',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 45,
        pulseMinutes: 56,
        plannedDoneAt: new Date('2026-03-08T18:00:00.000Z'),
        version: 2,
      },
      {
        id: ids.targetBatch,
        locationId: listOrderControlLocationId,
        productionRunId: ids.run,
        sequenceIndex: 1,
        status: 'queued',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 30,
        pulseMinutes: 56,
        plannedDoneAt: new Date('2026-03-08T19:00:00.000Z'),
        version: 4,
      },
      {
        id: ids.frozenBatch,
        locationId: listOrderControlLocationId,
        productionRunId: ids.run,
        sequenceIndex: 2,
        status: 'queued',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 30,
        pulseMinutes: 56,
        plannedDoneAt: new Date('2026-03-08T20:00:00.000Z'),
        membershipFrozenAt: listOrderControlAsOf,
        membershipFrozenBy: ids.actor,
        version: 3,
      },
    ]);
};

const seedOrders = async (): Promise<void> => {
  await Promise.all([
    seedOrder({
      id: ids.intake,
      display: 'INTAKE-REQUIRED',
      status: 'intake_pending',
    }),
    seedOrder({
      id: ids.conflict,
      display: 'QUEUE-CONFLICT',
      status: 'eligible',
      pendingPlacement: { reason: 'queue_conflict' },
    }),
    seedOrder({
      id: ids.eligible,
      display: 'ELIGIBLE-CLEAR',
      status: 'eligible',
    }),
    seedOrder({
      id: ids.release,
      display: 'RELEASE-PENDING',
      status: 'release_pending',
      dueAt: overdue,
    }),
    seedOrder({
      id: ids.override,
      display: 'MANUAL-OVERRIDE',
      status: 'intake_pending',
      phase: 'expected',
      admission: 'unreleased',
      admissionOverride: 'released',
    }),
    seedOrder({
      id: ids.tomorrow,
      display: 'TOMORROW-PENDING',
      status: 'eligible',
      dueAt: tomorrow,
      pendingPlacement: { reason: 'placement_pending' },
    }),
    seedOrder({
      id: ids.hiddenIntake,
      display: 'HIDDEN-INTAKE',
      status: 'intake_pending',
      phase: 'expected',
      admission: 'unreleased',
    }),
    seedOrder({ id: ids.finished, display: 'FINISHED', status: 'finished' }),
    seedOrder({
      id: ids.resolved,
      display: 'RESOLVED',
      status: 'eligible',
      resolution: 'resolved_without_production',
    }),
    seedOrder({
      id: ids.activeA,
      display: 'ACTIVE-A',
      status: 'scheduled',
      priority: true,
      weight: 20,
    }),
    seedOrder({
      id: ids.activeB,
      display: 'ACTIVE-B',
      status: 'scheduled',
      weight: 25,
    }),
    seedOrder({
      id: ids.sibling,
      display: 'SIBLING',
      status: 'eligible',
      location: listOrderControlSiblingLocationId,
    }),
  ]);
};

const seedRouting = async (): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionBatchOrders)
    .values([
      {
        locationId: listOrderControlLocationId,
        productionBatchId: ids.sourceBatch,
        productionOrderId: ids.activeA,
        active: true,
        placementProvenance: 'initial_schedule',
      },
      {
        locationId: listOrderControlLocationId,
        productionBatchId: ids.sourceBatch,
        productionOrderId: ids.activeB,
        active: true,
        placementProvenance: 'initial_schedule',
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionShiftSelections)
    .values({
      productionShiftId: ids.shift,
      locationId: listOrderControlLocationId,
      version: 1,
      selectedBy: ids.actor,
    });
  await database.db
    .insert(
      presslyPostgresOwnerSchemas.production.productionShiftSelectedOrders,
    )
    .values({
      productionShiftId: ids.shift,
      locationId: listOrderControlLocationId,
      productionOrderId: ids.activeA,
      selectedBy: ids.actor,
    });
  const kinds = ['sorting', 'washing', 'drying', 'folding_packaging'] as const;
  const stationFor = (kind: (typeof kinds)[number]): string => {
    switch (kind) {
      case 'sorting':
        return ids.sortingStation;
      case 'washing':
        return ids.washingStation;
      case 'drying':
        return ids.dryingStation;
      case 'folding_packaging':
        return ids.foldingStation;
    }
  };
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.stations)
    .values(
      kinds.map((kind, index) => ({
        id: stationFor(kind),
        locationId: listOrderControlLocationId,
        kind,
        label: kind,
        sortOrder: index,
      })),
    );
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.machines)
    .values([
      {
        id: ids.washer,
        locationId: listOrderControlLocationId,
        stationId: ids.washingStation,
        label: 'Washer',
        effectiveCapacityLbs: 100,
      },
      {
        id: ids.dryer,
        locationId: listOrderControlLocationId,
        stationId: ids.dryingStation,
        label: 'Dryer',
        effectiveCapacityLbs: 100,
      },
    ]);
  const batches = [ids.sourceBatch, ids.targetBatch, ids.frozenBatch];
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.stageRuns)
    .values(
      batches.flatMap((batchId, batchIndex) =>
        kinds.map((kind, stageIndex) => ({
          id: stageId(batchIndex, stageIndex),
          locationId: listOrderControlLocationId,
          productionBatchId: batchId,
          stationId: stationFor(kind),
          stageKind: kind,
          status: 'planned',
          plannedStartAt: new Date(
            Date.parse('2026-03-08T13:00:00.000Z') +
              (batchIndex + stageIndex) * 56 * 60_000,
          ),
          plannedEndAt: new Date(
            Date.parse('2026-03-08T13:00:00.000Z') +
              (batchIndex + stageIndex + 1) * 56 * 60_000,
          ),
        })),
      ),
    );
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
    .values(
      batches.flatMap((_batchId, batchIndex) =>
        [1, 2].map((stageIndex) => ({
          id: uuid(batchIndex * 10 + stageIndex, 34400000),
          locationId: listOrderControlLocationId,
          stageRunId: stageId(batchIndex, stageIndex),
          machineId: stageIndex === 1 ? ids.washer : ids.dryer,
          plannedStartAt: new Date(
            Date.parse('2026-03-08T13:00:00.000Z') +
              (batchIndex + stageIndex) * 56 * 60_000,
          ),
          plannedEndAt: new Date(
            Date.parse('2026-03-08T13:00:00.000Z') +
              (batchIndex + stageIndex + 1) * 56 * 60_000,
          ),
          status: 'planned',
        })),
      ),
    );
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionOrderStageAttempts)
    .values([
      {
        id: attemptId(0, 1),
        locationId: listOrderControlLocationId,
        productionRunId: ids.run,
        productionOrderId: ids.activeA,
        stageRunId: stageId(0, 1),
        stageKind: 'washing',
        attemptNumber: 1,
        status: 'assigned',
        assignmentReason: 'initial_schedule',
        assignedAt: new Date('2026-03-08T14:00:00.000Z'),
        assignedBy: ids.actor,
      },
      {
        id: attemptId(0, 0),
        locationId: listOrderControlLocationId,
        productionRunId: ids.run,
        productionOrderId: ids.activeA,
        stageRunId: stageId(0, 0),
        stageKind: 'sorting',
        attemptNumber: 1,
        status: 'assigned',
        assignmentReason: 'initial_schedule',
        assignedAt: new Date('2026-03-08T15:00:00.000Z'),
        assignedBy: ids.actor,
      },
      {
        id: attemptId(1, 1),
        locationId: listOrderControlLocationId,
        productionRunId: ids.run,
        productionOrderId: ids.activeB,
        stageRunId: stageId(0, 1),
        stageKind: 'washing',
        attemptNumber: 1,
        status: 'assigned',
        assignmentReason: 'initial_schedule',
        assignedAt: new Date('2026-03-08T14:30:00.000Z'),
        assignedBy: ids.actor,
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.workEvents)
    .values({
      id: ids.routeEvent,
      locationId: listOrderControlLocationId,
      eventType: 'production_order_rebatched',
      entityType: 'production_order',
      entityId: ids.activeA,
      actorId: ids.actor,
      idempotencyKey: 'order-control-conformance-route',
      payload: { productionRunId: ids.run },
    });
};

const seed = async (): Promise<void> => {
  await seedRootsAndRun();
  await seedOrders();
  await seedRouting();
};

const readCompleteState = async () => {
  const [
    businesses,
    locations,
    shifts,
    configs,
    schedules,
    runs,
    batches,
    memberships,
    selections,
    selectedOrders,
    stations,
    machines,
    stages,
    assignments,
    attempts,
    demands,
    productionOrders,
    events,
  ] = await Promise.all([
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.access.businessAccounts),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.access.accessProductionLocations),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionShifts),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.schedulerConfigs),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.scheduleRuns),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionRuns),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionBatches),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionBatchOrders),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionShiftSelections),
    database.db
      .select()
      .from(
        presslyPostgresOwnerSchemas.production.productionShiftSelectedOrders,
      ),
    database.db.select().from(presslyPostgresOwnerSchemas.production.stations),
    database.db.select().from(presslyPostgresOwnerSchemas.production.machines),
    database.db.select().from(presslyPostgresOwnerSchemas.production.stageRuns),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.stageMachineAssignments),
    database.db
      .select()
      .from(
        presslyPostgresOwnerSchemas.production.productionOrderStageAttempts,
      ),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.orderDemands),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionOrders),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.workEvents),
  ]);
  return {
    businesses,
    locations,
    shifts,
    configs,
    schedules,
    runs,
    batches,
    memberships,
    selections,
    selectedOrders,
    stations,
    machines,
    stages,
    assignments,
    attempts,
    demands,
    productionOrders,
    events,
  };
};

type TraceEvent = 'clock' | 'read' | 'transaction' | 'mutation';
const idsSource = (): IdSource => ({ next: () => uuid(999) });

const observedDatabase = (trace: TraceEvent[]): PostgresDatabase =>
  new Proxy(database.db, {
    get: (target, property) => {
      const value = Reflect.get(target, property, target);
      if (
        (property === 'select' || property === 'transaction') &&
        typeof value === 'function'
      )
        return (...args: unknown[]) => {
          trace.push(property === 'select' ? 'read' : 'transaction');
          return Reflect.apply(value, target, args);
        };
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

const executeFor = (
  db: PostgresDatabase,
  trace: TraceEvent[],
): ((input: ListOrderControlInput) => Promise<unknown>) => {
  const clock = {
    now: () => {
      trace.push('clock');
      return new Date(listOrderControlAsOf);
    },
  };
  return makeProductionSystem({
    schema: presslyPostgresOwnerSchemas.production,
    productionActorReadV1: makeProductionActorReadV1Capability(
      database.db,
      presslyPostgresOwnerSchemas.access,
    ),
    productionScopeReconciliationV1:
      makeProductionScopeReconciliationV1Capability(
        database.db,
        presslyPostgresOwnerSchemas.access,
      ),
    db,
    ids: idsSource(),
    clock,
  }).cells.listOrderControl.execute;
};

type Observation = Readonly<{
  outcomes: readonly CanonicalListOrderControlOutcome[];
  before: Awaited<ReturnType<typeof readCompleteState>>;
  after: Awaited<ReturnType<typeof readCompleteState>>;
  trace: readonly TraceEvent[];
}>;

const mutationBusinessState = (state: Observation['after']) => ({
  eligiblePendingPlacement: state.productionOrders.find(
    (order) => order.id === ids.eligible,
  )?.pendingPlacement,
  sourceBatchVersion: state.batches.find(
    (batch) => batch.id === ids.sourceBatch,
  )?.version,
  runQueueVersion: state.runs.find((run) => run.id === ids.run)?.queueVersion,
  attemptIds: state.attempts.map((attempt) => attempt.id).sort(),
});

const observe = async (
  scenario: ListOrderControlConformanceScenario,
): Promise<Observation> => {
  await database.reset();
  await seed();
  const before = await readCompleteState();
  const trace: TraceEvent[] = [];
  const outcomes = await runListOrderControlConformanceScenario(
    executeFor(observedDatabase(trace), trace),
    scenario,
  );
  return { outcomes, before, after: await readCompleteState(), trace };
};

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const records = (
  value: unknown,
): readonly Readonly<Record<string, unknown>>[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        const item = record(entry);
        return item === null ? [] : [item];
      })
    : [];

const successValue = (
  outcome: CanonicalListOrderControlOutcome | undefined,
): Readonly<Record<string, unknown>> => {
  expect(outcome?.kind).toBe('success');
  return outcome?.kind === 'success' ? (record(outcome.value) ?? {}) : {};
};

const items = (
  outcome: CanonicalListOrderControlOutcome | undefined,
): readonly Readonly<Record<string, unknown>>[] =>
  records(successValue(outcome)['items']);

const externalOrderIds = (
  outcome: CanonicalListOrderControlOutcome | undefined,
): readonly unknown[] =>
  items(outcome).map((item) => record(item['order'])?.['externalOrderId']);

const assertNonTransactionalRead = (observation: Observation): void => {
  expect(observation.after).toEqual(observation.before);
  expect(observation.trace[0]).toBe('clock');
  expect(
    observation.trace.filter((event) => event === 'transaction'),
  ).toHaveLength(0);
  expect(observation.trace.filter((event) => event === 'clock')).toHaveLength(
    observation.outcomes.length,
  );
  expect(
    observation.trace.filter((event) => event === 'read').length,
  ).toBeGreaterThan(observation.outcomes.length);
};

const cursorEnvelope = (
  outcome: CanonicalListOrderControlOutcome | undefined,
): Readonly<Record<string, unknown>> => {
  const cursor = successValue(outcome)['nextCursor'];
  expect(typeof cursor).toBe('string');
  return typeof cursor === 'string'
    ? (record(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))) ??
        {})
    : {};
};

const wrapBuilder = <Value extends object>(
  value: Value,
  afterResult: () => Promise<void>,
  completed: { value: number },
): Value =>
  new Proxy(value, {
    get: (target, property) => {
      const member = Reflect.get(target, property, target);
      if (property === 'then' && typeof member === 'function')
        return (
          onFulfilled: (result: unknown) => unknown,
          onRejected: (reason: unknown) => unknown,
        ) =>
          Reflect.apply(member, target, [
            async (result: unknown) => {
              completed.value += 1;
              if (completed.value === 1) await afterResult();
              return onFulfilled(result);
            },
            onRejected,
          ]);
      if (typeof member !== 'function') return member;
      return (...args: unknown[]) => {
        const next = Reflect.apply(member, target, args);
        return typeof next === 'object' && next !== null
          ? wrapBuilder(next, afterResult, completed)
          : next;
      };
    },
  });

const mutatingDatabase = (
  trace: TraceEvent[],
  mutate: () => Promise<void>,
): PostgresDatabase => {
  const completed = { value: 0 };
  let mutated = false;
  const afterResult = async () => {
    if (mutated) return;
    mutated = true;
    trace.push('mutation');
    await mutate();
  };
  return new Proxy(database.db, {
    get: (target, property) => {
      const value = Reflect.get(target, property, target);
      if (property === 'transaction' && typeof value === 'function')
        return (...args: unknown[]) => {
          trace.push('transaction');
          return Reflect.apply(value, target, args);
        };
      if (property === 'select' && typeof value === 'function')
        return (...args: unknown[]) => {
          trace.push('read');
          const builder = Reflect.apply(value, target, args);
          return typeof builder === 'object' && builder !== null
            ? wrapBuilder(builder, afterResult, completed)
            : builder;
        };
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};

describe('production.list-order-control.v1 target PostgreSQL conformance', () => {
  it('preserves strict params/query defaults and exact boolean coercion', () => {
    expect(
      listOrderControlContract.input.decode({
        params: { locationId: listOrderControlLocationId },
        query: {},
      }),
    ).toEqual({
      kind: 'valid',
      value: {
        locationId: listOrderControlLocationId,
        view: 'attention',
        limit: 25,
      },
    });
    for (const [priority, movable, expectedPriority, expectedMovable] of [
      ['true', 'false', true, false],
      [false, true, false, true],
    ] as const)
      expect(
        listOrderControlContract.input.decode({
          params: { locationId: listOrderControlLocationId },
          query: { limit: '100', priority, movable },
        }),
      ).toEqual({
        kind: 'valid',
        value: {
          locationId: listOrderControlLocationId,
          view: 'attention',
          limit: 100,
          priority: expectedPriority,
          movable: expectedMovable,
        },
      });
    for (const invalid of [
      {
        params: { locationId: listOrderControlLocationId },
        query: { limit: 101 },
      },
      {
        params: { locationId: listOrderControlLocationId },
        query: { priority: 'TRUE' },
      },
      {
        params: { locationId: listOrderControlLocationId },
        query: { movable: 1 },
      },
      {
        params: { locationId: listOrderControlLocationId, extra: true },
        query: {},
      },
      {
        params: { locationId: listOrderControlLocationId },
        query: { unknown: 'filter' },
      },
    ])
      expect(listOrderControlContract.input.decode(invalid)).toMatchObject({
        kind: 'invalid',
      });
  });

  it.each(listOrderControlConformanceScenarios)('$name', async (scenario) => {
    const target = await observe(scenario);
    assertNonTransactionalRead(target);

    if (scenario.name.startsWith('defaults')) {
      expect(externalOrderIds(target.outcomes[0])).toEqual([
        'INTAKE-REQUIRED',
        'QUEUE-CONFLICT',
        'MANUAL-OVERRIDE',
        'TOMORROW-PENDING',
      ]);
      expect(successValue(target.outcomes[0])['counts']).toEqual({
        attention: 4,
        active: 2,
        all: 8,
      });
      expect(JSON.stringify(successValue(target.outcomes[0]))).not.toMatch(
        /FINISHED|RESOLVED|HIDDEN-INTAKE|SIBLING|customerDisplayName|canonical|audit/,
      );
      expect(target.outcomes[1]).toMatchObject({
        kind: 'failure',
        failure: { code: 'production_location_not_found' },
      });
      expect(target.outcomes[2]).toMatchObject({
        kind: 'failure',
        failure: { code: 'production_location_not_found' },
      });
      expect(externalOrderIds(target.outcomes[3])).toEqual(['SIBLING']);
    }

    if (scenario.name.startsWith('every view')) {
      const expected = [
        [],
        ['ACTIVE-A'],
        ['ACTIVE-B'],
        ['ACTIVE-A', 'ACTIVE-B'],
        [],
        ['ACTIVE-B'],
        ['RELEASE-PENDING'],
        [
          'INTAKE-REQUIRED',
          'QUEUE-CONFLICT',
          'ELIGIBLE-CLEAR',
          'MANUAL-OVERRIDE',
          'ACTIVE-A',
          'ACTIVE-B',
        ],
        ['TOMORROW-PENDING'],
        [],
        [
          'RELEASE-PENDING',
          'INTAKE-REQUIRED',
          'QUEUE-CONFLICT',
          'ELIGIBLE-CLEAR',
          'MANUAL-OVERRIDE',
          'TOMORROW-PENDING',
        ],
        ['ELIGIBLE-CLEAR'],
        ['ACTIVE-A', 'ACTIVE-B'],
        ['ACTIVE-A', 'ACTIVE-B'],
        ['QUEUE-CONFLICT', 'ELIGIBLE-CLEAR', 'TOMORROW-PENDING'],
      ];
      expect(target.outcomes.map(externalOrderIds)).toEqual(expected);
    }

    if (scenario.name.startsWith('all filters')) {
      const value = successValue(target.outcomes[0]);
      expect(listOrderControlContract.output.decode(value)).toMatchObject({
        kind: 'valid',
      });
      const item = items(target.outcomes[0])[0];
      expect(item).toMatchObject({
        order: {
          id: ids.activeA,
          externalOrderId: 'ACTIVE-A',
          dueBucket: 'today',
          priority: true,
          status: 'scheduled',
        },
        currentPlacement: {
          productionRunId: ids.run,
          productionBatchId: ids.sourceBatch,
          batchSequence: 0,
          batchVersion: 2,
          queueVersion: 5,
          membershipFrozen: false,
        },
        nextRequiredStage: 'sorting',
        commands: {
          queuedMove: {
            status: 'allowed',
            expectedQueueVersion: 5,
            expectedOrderVersion: 3,
            expectedSourceBatchVersion: 2,
          },
          routeException: {
            status: 'blocked',
            code: 'EXCEPTION_SOURCE_NOT_IN_FLIGHT',
          },
        },
      });
      expect(
        records(item?.['routeAttempts']).map((attempt) => attempt['stage']),
      ).toEqual(['washing', 'sorting']);
      expect(item?.['resolutionAction']).toMatchObject({
        status: 'blocked',
        reasons: expect.arrayContaining([
          'execution_committed',
          'selected_for_shift',
          'batch_membership_exists',
          'stage_attempt_exists',
          'route_exists',
        ]),
      });
    }

    if (scenario.name.startsWith('due-at')) {
      expect(target.outcomes.flatMap(externalOrderIds)).toEqual([
        'ACTIVE-A',
        'ACTIVE-B',
      ]);
      expect(cursorEnvelope(target.outcomes[0])).toMatchObject({
        version: 1,
        dueAt: today.toISOString(),
        id: ids.activeA,
      });
    }
  });

  it('binds every filter before location lookup while keeping limit independent', async () => {
    const cursorScope = async (): Promise<Observation> => {
      await database.reset();
      await seed();
      const before = await readCompleteState();
      const trace: TraceEvent[] = [];
      const execute = executeFor(observedDatabase(trace), trace);
      const first = await captureListOrderControlOutcome(execute, {
        locationId: listOrderControlLocationId,
        view: 'active',
        limit: 1,
      });
      const cursor = listOrderControlNextCursor(first);
      expect(cursor).not.toBeNull();
      const changes: readonly Partial<ListOrderControlInput>[] = [
        { view: 'all' },
        { search: 'OTHER' },
        { status: 'eligible' },
        { dueBucket: 'tomorrow' },
        { productionRunId: ids.siblingRun },
        { productionBatchId: ids.targetBatch },
        { stage: 'drying' },
        { priority: true },
        { movable: false },
      ];
      const outcomes: CanonicalListOrderControlOutcome[] = [first];
      for (const change of changes)
        outcomes.push(
          await captureListOrderControlOutcome(execute, {
            locationId: 'missing-order-control-location',
            view: 'active',
            limit: 1,
            ...(cursor === null ? {} : { cursor }),
            ...change,
          }),
        );
      outcomes.push(
        await captureListOrderControlOutcome(execute, {
          locationId: listOrderControlLocationId,
          view: 'active',
          limit: 100,
          ...(cursor === null ? {} : { cursor }),
        }),
      );
      return {
        outcomes,
        before,
        after: await readCompleteState(),
        trace,
      };
    };

    const target = await cursorScope();
    assertNonTransactionalRead(target);
    for (const outcome of target.outcomes.slice(1, 10))
      expect(outcome).toMatchObject({
        kind: 'failure',
        failure: { code: 'production_order_cursor_invalid' },
      });
    expect(externalOrderIds(target.outcomes[10])).toEqual(['ACTIVE-B']);
  });

  it('preserves observable mixed evidence when state changes between multi-reads', async () => {
    const observeMutation = async (): Promise<Observation> => {
      await database.reset();
      await seed();
      const before = await readCompleteState();
      const trace: TraceEvent[] = [];
      const db = mutatingDatabase(trace, async () => {
        await database.db
          .update(presslyPostgresOwnerSchemas.production.productionOrders)
          .set({ pendingPlacement: { reason: 'placement_pending' } })
          .where(
            eq(
              presslyPostgresOwnerSchemas.production.productionOrders.id,
              ids.eligible,
            ),
          );
        await database.db
          .update(presslyPostgresOwnerSchemas.production.productionBatches)
          .set({ version: 9 })
          .where(
            eq(
              presslyPostgresOwnerSchemas.production.productionBatches.id,
              ids.sourceBatch,
            ),
          );
        await database.db
          .update(presslyPostgresOwnerSchemas.production.productionRuns)
          .set({ queueVersion: 9 })
          .where(
            eq(
              presslyPostgresOwnerSchemas.production.productionRuns.id,
              ids.run,
            ),
          );
        await database.db
          .insert(
            presslyPostgresOwnerSchemas.production.productionOrderStageAttempts,
          )
          .values({
            id: attemptId(0, 2),
            locationId: listOrderControlLocationId,
            productionRunId: ids.run,
            productionOrderId: ids.activeA,
            stageRunId: stageId(0, 2),
            stageKind: 'drying',
            attemptNumber: 1,
            status: 'assigned',
            assignmentReason: 'automatic',
            assignedAt: new Date('2026-03-08T14:45:00.000Z'),
            assignedBy: ids.actor,
          });
      });
      const outcome = await captureListOrderControlOutcome(
        executeFor(db, trace),
        {
          locationId: listOrderControlLocationId,
          view: 'active',
          search: 'ACTIVE-A',
          limit: 25,
        },
      );
      return {
        outcomes: [outcome],
        before,
        after: await readCompleteState(),
        trace,
      };
    };

    const target = await observeMutation();
    expect(target.after).not.toEqual(target.before);
    expect(mutationBusinessState(target.after)).toMatchObject({
      eligiblePendingPlacement: { reason: 'placement_pending' },
      sourceBatchVersion: 9,
      runQueueVersion: 9,
    });
    expect(mutationBusinessState(target.after).attemptIds).toContain(
      attemptId(0, 2),
    );
    expect(target.trace[0]).toBe('clock');
    expect(target.trace).toContain('mutation');
    expect(
      target.trace.filter((event) => event === 'transaction'),
    ).toHaveLength(0);
    const value = successValue(target.outcomes[0]);
    expect(value['counts']).toEqual({ attention: 5, active: 2, all: 8 });
    const item = items(target.outcomes[0])[0];
    expect(item?.['currentPlacement']).toMatchObject({
      batchVersion: 2,
      queueVersion: 5,
    });
    expect(record(item?.['commands'])?.['queuedMove']).toMatchObject({
      status: 'allowed',
      expectedQueueVersion: 5,
      expectedSourceBatchVersion: 9,
    });
    expect(
      records(item?.['routeAttempts']).map((attempt) => attempt['stage']),
    ).toEqual(['washing', 'drying', 'sorting']);
  });
});
