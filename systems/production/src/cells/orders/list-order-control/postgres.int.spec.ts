import {
  productionTestSchema,
  seedProductionLocationTestFacts,
} from '../../../testing/production-schema.spec-support.ts';
import { productionScopeReconciliationTestCapability } from '../../../testing/production-capabilities.spec-support.ts';
import { listProductionOrderControlResultSchema } from '../../../read-models/production-order-control/contract.ts';
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
import { makeExecuteListOrderControl } from './execute.ts';
import { makeListOrderControlPostgresRepository } from './postgres.ts';
import type { ListOrderControlInput } from './types.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_list_order_control_cell_test',
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
  ],
  maxConnections: 6,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : { resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'] }),
});

const uuid = (suffix: number, prefix = 68000000): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const id = {
  business: '00000000-0000-4000-8000-000000000100',
  actor: uuid(1),
  shift: uuid(2),
  config: uuid(3),
  schedule: uuid(4),
  run: uuid(5),
  sourceBatch: uuid(6),
  targetBatch: uuid(7),
  frozenBatch: uuid(8),
  sortingStation: uuid(9),
  washingStation: uuid(10),
  dryingStation: uuid(11),
  foldingStation: uuid(12),
  washer: uuid(13),
  dryer: uuid(14),
  routeEvent: uuid(15),
  siblingShift: uuid(16),
  siblingConfig: uuid(17),
  siblingSchedule: uuid(18),
  siblingRun: uuid(19),
} as const;
const orderIds = {
  intake: uuid(20),
  conflict: uuid(21),
  eligible: uuid(22),
  release: uuid(23),
  override: uuid(24),
  tomorrow: uuid(25),
  hiddenIntake: uuid(26),
  finished: uuid(27),
  resolved: uuid(28),
  activeA: uuid(40),
  activeB: uuid(41),
  sibling: uuid(50),
} as const;
const locationId = 'location-order-control';
const siblingLocationId = 'location-order-control-sibling';
const inactiveLocationId = 'location-order-control-inactive';
const asOf = new Date('2026-03-08T16:00:00.000Z');
const today = new Date('2026-03-08T15:00:00.000Z');
const tomorrow = new Date('2026-03-09T04:00:00.000Z');
const overdue = new Date('2026-03-08T04:59:59.999Z');

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

const seedOrder = async (input: SeedOrder) => {
  const location = input.location ?? locationId;
  const fulfillmentId = uuid(Number(input.id.slice(-12)) + 2000);
  const demandId = uuid(Number(input.id.slice(-12)) + 3000);
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
  await database.db.insert(productionTestSchema.orderDemands).values({
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
  await database.db.insert(productionTestSchema.productionOrders).values({
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
          resolvedAt: asOf,
          resolvedBy: id.actor,
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
      ? { admissionOverrideAt: asOf, admissionOverrideBy: id.actor }
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

const stageId = (batch: number, stage: number): string =>
  uuid(batch * 10 + stage + 1, 68100000);
const attemptId = (order: number, stage: number): string =>
  uuid(order * 10 + stage + 1, 68200000);

const seed = async () => {
  await seedProductionLocationTestFacts(database.db, [
    {
      id: locationId,
      businessId: id.business,
      name: 'Order Control Facility',
      timezone: 'America/New_York',
    },
    {
      id: siblingLocationId,
      businessId: id.business,
      name: 'Sibling Facility',
      timezone: 'America/Chicago',
    },
    {
      id: inactiveLocationId,
      businessId: id.business,
      name: 'Inactive Facility',
      timezone: 'America/New_York',
      isActive: false,
    },
  ]);
  await database.db.insert(productionTestSchema.productionShifts).values([
    {
      id: id.shift,
      locationId,
      startsAt: new Date('2026-03-08T13:00:00.000Z'),
      endsAt: new Date('2026-03-08T22:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'open',
      effectiveFolderCount: 2,
      version: 1,
    },
    {
      id: id.siblingShift,
      locationId: siblingLocationId,
      startsAt: new Date('2026-03-08T13:00:00.000Z'),
      endsAt: new Date('2026-03-08T22:00:00.000Z'),
      timezone: 'America/Chicago',
      status: 'open',
      effectiveFolderCount: 2,
      version: 1,
    },
  ]);
  await database.db.insert(productionTestSchema.schedulerConfigs).values([
    {
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
    },
    {
      id: id.siblingConfig,
      locationId: siblingLocationId,
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
    },
  ]);
  await database.db.insert(productionTestSchema.scheduleRuns).values([
    {
      id: id.schedule,
      locationId,
      productionShiftId: id.shift,
      schedulerConfigId: id.config,
      status: 'accepted',
      inputSnapshot: { orders: [{ id: orderIds.activeA }] },
      inputSnapshotHash: 'c'.repeat(64),
      outputPlan: {},
      outputPlanHash: 'd'.repeat(64),
      algorithmVersion: 'fixed-pulse-ffd-v2',
      pulseCapacityLbs: 100,
      batchCount: 3,
      makespanMinutes: 336,
      plannedCompletionAt: new Date('2026-03-08T21:00:00.000Z'),
      acceptedAt: new Date('2026-03-08T12:00:00.000Z'),
      acceptedBy: id.actor,
    },
    {
      id: id.siblingSchedule,
      locationId: siblingLocationId,
      productionShiftId: id.siblingShift,
      schedulerConfigId: id.siblingConfig,
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
      acceptedBy: id.actor,
    },
  ]);
  await database.db.insert(productionTestSchema.productionRuns).values([
    {
      id: id.run,
      locationId,
      productionShiftId: id.shift,
      scheduleRunId: id.schedule,
      status: 'started',
      startedAt: new Date('2026-03-08T13:00:00.000Z'),
      queueVersion: 5,
      plannedCompletionAt: new Date('2026-03-08T21:00:00.000Z'),
      version: 1,
    },
    {
      id: id.siblingRun,
      locationId: siblingLocationId,
      productionShiftId: id.siblingShift,
      scheduleRunId: id.siblingSchedule,
      status: 'started',
      startedAt: new Date('2026-03-08T13:00:00.000Z'),
      queueVersion: 1,
      plannedCompletionAt: new Date('2026-03-08T21:00:00.000Z'),
      version: 1,
    },
  ]);
  await database.db.insert(productionTestSchema.productionBatches).values([
    {
      id: id.sourceBatch,
      locationId,
      productionRunId: id.run,
      sequenceIndex: 0,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 45,
      pulseMinutes: 56,
      plannedDoneAt: new Date('2026-03-08T18:00:00.000Z'),
      version: 2,
    },
    {
      id: id.targetBatch,
      locationId,
      productionRunId: id.run,
      sequenceIndex: 1,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 30,
      pulseMinutes: 56,
      plannedDoneAt: new Date('2026-03-08T19:00:00.000Z'),
      version: 4,
    },
    {
      id: id.frozenBatch,
      locationId,
      productionRunId: id.run,
      sequenceIndex: 2,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 30,
      pulseMinutes: 56,
      plannedDoneAt: new Date('2026-03-08T20:00:00.000Z'),
      membershipFrozenAt: asOf,
      membershipFrozenBy: id.actor,
      version: 3,
    },
  ]);
  await Promise.all([
    seedOrder({
      id: orderIds.intake,
      display: 'INTAKE-REQUIRED',
      status: 'intake_pending',
    }),
    seedOrder({
      id: orderIds.conflict,
      display: 'QUEUE-CONFLICT',
      status: 'eligible',
      pendingPlacement: { reason: 'queue_conflict' },
    }),
    seedOrder({
      id: orderIds.eligible,
      display: 'ELIGIBLE-CLEAR',
      status: 'eligible',
    }),
    seedOrder({
      id: orderIds.release,
      display: 'RELEASE-PENDING',
      status: 'release_pending',
      dueAt: overdue,
    }),
    seedOrder({
      id: orderIds.override,
      display: 'MANUAL-OVERRIDE',
      status: 'intake_pending',
      phase: 'expected',
      admission: 'unreleased',
      admissionOverride: 'released',
    }),
    seedOrder({
      id: orderIds.tomorrow,
      display: 'TOMORROW-PENDING',
      status: 'eligible',
      dueAt: tomorrow,
      pendingPlacement: { reason: 'placement_pending' },
    }),
    seedOrder({
      id: orderIds.hiddenIntake,
      display: 'HIDDEN-INTAKE',
      status: 'intake_pending',
      phase: 'expected',
      admission: 'unreleased',
    }),
    seedOrder({
      id: orderIds.finished,
      display: 'FINISHED',
      status: 'finished',
    }),
    seedOrder({
      id: orderIds.resolved,
      display: 'RESOLVED',
      status: 'eligible',
      resolution: 'resolved_without_production',
    }),
    seedOrder({
      id: orderIds.activeA,
      display: 'ACTIVE-A',
      status: 'scheduled',
      priority: true,
      weight: 20,
    }),
    seedOrder({
      id: orderIds.activeB,
      display: 'ACTIVE-B',
      status: 'scheduled',
      weight: 25,
    }),
    seedOrder({
      id: orderIds.sibling,
      display: 'SIBLING',
      status: 'eligible',
      location: siblingLocationId,
    }),
  ]);
  await database.db.insert(productionTestSchema.productionBatchOrders).values([
    {
      locationId,
      productionBatchId: id.sourceBatch,
      productionOrderId: orderIds.activeA,
      active: true,
      placementProvenance: 'initial_schedule',
    },
    {
      locationId,
      productionBatchId: id.sourceBatch,
      productionOrderId: orderIds.activeB,
      active: true,
      placementProvenance: 'initial_schedule',
    },
  ]);
  await database.db
    .insert(productionTestSchema.productionShiftSelections)
    .values({
      productionShiftId: id.shift,
      locationId,
      version: 1,
      selectedBy: id.actor,
    });
  await database.db
    .insert(productionTestSchema.productionShiftSelectedOrders)
    .values({
      productionShiftId: id.shift,
      locationId,
      productionOrderId: orderIds.activeA,
      selectedBy: id.actor,
    });
  await database.db.insert(productionTestSchema.stations).values(
    [
      ['sorting', id.sortingStation],
      ['washing', id.washingStation],
      ['drying', id.dryingStation],
      ['folding_packaging', id.foldingStation],
    ].map(([kind, stationId], index) => ({
      id: stationId!,
      locationId,
      kind: kind!,
      label: kind!,
      sortOrder: index,
    })),
  );
  await database.db.insert(productionTestSchema.machines).values([
    {
      id: id.washer,
      locationId,
      stationId: id.washingStation,
      label: 'Washer',
      effectiveCapacityLbs: 100,
    },
    {
      id: id.dryer,
      locationId,
      stationId: id.dryingStation,
      label: 'Dryer',
      effectiveCapacityLbs: 100,
    },
  ]);
  const batches = [id.sourceBatch, id.targetBatch, id.frozenBatch];
  const stations = [
    id.sortingStation,
    id.washingStation,
    id.dryingStation,
    id.foldingStation,
  ];
  const kinds = ['sorting', 'washing', 'drying', 'folding_packaging'] as const;
  await database.db.insert(productionTestSchema.stageRuns).values(
    batches.flatMap((batchId, batchIndex) =>
      kinds.map((kind, stageIndex) => ({
        id: stageId(batchIndex, stageIndex),
        locationId,
        productionBatchId: batchId,
        stationId: stations[stageIndex]!,
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
        version: 1,
      })),
    ),
  );
  await database.db.insert(productionTestSchema.stageMachineAssignments).values(
    batches.flatMap((_batchId, batchIndex) =>
      [1, 2].map((stageIndex) => ({
        id: uuid(batchIndex * 10 + stageIndex, 68300000),
        locationId,
        stageRunId: stageId(batchIndex, stageIndex),
        machineId: stageIndex === 1 ? id.washer : id.dryer,
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
    .insert(productionTestSchema.productionOrderStageAttempts)
    .values([
      {
        id: attemptId(0, 1),
        locationId,
        productionRunId: id.run,
        productionOrderId: orderIds.activeA,
        stageRunId: stageId(0, 1),
        stageKind: 'washing',
        attemptNumber: 1,
        status: 'assigned',
        assignmentReason: 'initial_schedule',
        assignedAt: new Date('2026-03-08T14:00:00.000Z'),
        assignedBy: id.actor,
      },
      {
        id: attemptId(0, 0),
        locationId,
        productionRunId: id.run,
        productionOrderId: orderIds.activeA,
        stageRunId: stageId(0, 0),
        stageKind: 'sorting',
        attemptNumber: 1,
        status: 'assigned',
        assignmentReason: 'initial_schedule',
        assignedAt: new Date('2026-03-08T15:00:00.000Z'),
        assignedBy: id.actor,
      },
      {
        id: attemptId(1, 1),
        locationId,
        productionRunId: id.run,
        productionOrderId: orderIds.activeB,
        stageRunId: stageId(0, 1),
        stageKind: 'washing',
        attemptNumber: 1,
        status: 'assigned',
        assignmentReason: 'initial_schedule',
        assignedAt: new Date('2026-03-08T14:30:00.000Z'),
        assignedBy: id.actor,
      },
    ]);
  await database.db.insert(productionTestSchema.workEvents).values({
    id: id.routeEvent,
    locationId,
    eventType: 'production_order_rebatched',
    entityType: 'production_order',
    entityId: orderIds.activeA,
    actorId: id.actor,
    idempotencyKey: 'order-control-route-evidence',
    payload: { productionRunId: id.run },
  });
};

const make = (clock = vi.fn(() => new Date(asOf))) => ({
  clock,
  execute: makeExecuteListOrderControl({
    repo: makeListOrderControlPostgresRepository(
      {
        db: database.db,
        policy: productionRules,
        productionScopeReconciliationV1:
          productionScopeReconciliationTestCapability(database.db),
      },
      productionTestSchema,
    ),
    clock: { now: clock },
  }),
});

const query = (
  patch: Partial<ListOrderControlInput> = {},
): ListOrderControlInput => ({
  locationId,
  view: 'attention',
  limit: 25,
  ...patch,
});

const durableSnapshot = async () =>
  Promise.all([
    database.db
      .select()
      .from(productionTestSchema.productionLocations)
      .orderBy(productionTestSchema.productionLocations.id),
    database.db
      .select()
      .from(productionTestSchema.productionOrders)
      .orderBy(productionTestSchema.productionOrders.id),
    database.db
      .select()
      .from(productionTestSchema.productionRuns)
      .orderBy(productionTestSchema.productionRuns.id),
    database.db
      .select()
      .from(productionTestSchema.productionBatches)
      .orderBy(productionTestSchema.productionBatches.id),
    database.db
      .select()
      .from(productionTestSchema.productionBatchOrders)
      .orderBy(productionTestSchema.productionBatchOrders.id),
    database.db
      .select()
      .from(productionTestSchema.stageRuns)
      .orderBy(productionTestSchema.stageRuns.id),
    database.db
      .select()
      .from(productionTestSchema.productionOrderStageAttempts)
      .orderBy(productionTestSchema.productionOrderStageAttempts.id),
    database.db
      .select()
      .from(productionTestSchema.workEvents)
      .orderBy(productionTestSchema.workEvents.id),
  ]);

beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

describe('list order control native PostgreSQL cell', () => {
  it('preserves default attention, active-location concealment, and exclusions', async () => {
    await seed();
    const target = make();
    const defaultResult = await target.execute(query());
    expect(defaultResult.kind).toBe('success');
    if (defaultResult.kind === 'failure') return;
    expect(
      defaultResult.value.items.map((item) => [
        item.order.externalOrderId,
        item.attention?.reason,
      ]),
    ).toEqual([
      ['INTAKE-REQUIRED', 'intake_required'],
      ['QUEUE-CONFLICT', 'placement_conflict'],
      ['MANUAL-OVERRIDE', 'intake_required'],
      ['TOMORROW-PENDING', 'placement_pending'],
    ]);
    expect(defaultResult.value.counts).toEqual({
      attention: 4,
      active: 2,
      all: 8,
    });
    expect(JSON.stringify(defaultResult.value)).not.toMatch(
      /FINISHED|RESOLVED|HIDDEN-INTAKE|SIBLING/,
    );
    await expect(
      target.execute(query({ locationId: 'missing-location' })),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_location_not_found' },
    });
    await expect(
      target.execute(query({ locationId: inactiveLocationId })),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_location_not_found' },
    });
    await expect(
      target.execute(query({ locationId: siblingLocationId, view: 'all' })),
    ).resolves.toMatchObject({
      kind: 'success',
      value: { items: [{ order: { externalOrderId: 'SIBLING' } }] },
    });
  });

  it('combines every SQL filter and projects server-authoritative capabilities without writes', async () => {
    await seed();
    const before = await durableSnapshot();
    const target = make();
    const outcome = await target.execute(
      query({
        view: 'active',
        search: 'ACTIVE-A',
        status: 'scheduled',
        dueBucket: 'today',
        productionRunId: id.run,
        productionBatchId: id.sourceBatch,
        stage: 'sorting',
        priority: true,
        movable: true,
      }),
    );
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'failure') return;
    expect(() =>
      listProductionOrderControlResultSchema.parse(outcome.value),
    ).not.toThrow();
    expect(outcome.value.items).toHaveLength(1);
    const item = outcome.value.items[0]!;
    expect(item.order).toMatchObject({
      id: orderIds.activeA,
      externalOrderId: 'ACTIVE-A',
      dueBucket: 'today',
      priority: true,
      status: 'scheduled',
    });
    expect(item.currentPlacement).toMatchObject({
      productionRunId: id.run,
      productionBatchId: id.sourceBatch,
      batchSequence: 0,
      batchVersion: 2,
      queueVersion: 5,
      membershipFrozen: false,
    });
    expect(item.nextRequiredStage).toBe('sorting');
    expect(item.routeAttempts.map((attempt) => attempt.stage)).toEqual([
      'washing',
      'sorting',
    ]);
    expect(item.commands).toMatchObject({
      queuedMove: {
        status: 'allowed',
        expectedQueueVersion: 5,
        expectedOrderVersion: 3,
        expectedSourceBatchVersion: 2,
        targets: expect.arrayContaining([
          expect.objectContaining({
            productionBatchId: id.targetBatch,
            feasibility: { status: 'allowed' },
          }),
          expect.objectContaining({
            productionBatchId: id.frozenBatch,
            feasibility: {
              status: 'blocked',
              code: 'TARGET_MEMBERSHIP_FROZEN',
            },
          }),
        ]),
      },
      routeException: {
        status: 'blocked',
        code: 'EXCEPTION_SOURCE_NOT_IN_FLIGHT',
      },
    });
    expect(item.resolutionAction).toMatchObject({
      status: 'blocked',
      reasons: expect.arrayContaining([
        'execution_committed',
        'selected_for_shift',
        'batch_membership_exists',
        'stage_attempt_exists',
        'route_exists',
      ]),
    });
    expect(target.clock).toHaveBeenCalledOnce();
    expect(await durableSnapshot()).toEqual(before);
  });

  it('preserves view/filter precedence, boolean filters, and DST due buckets', async () => {
    await seed();
    const target = make();
    const cases = [
      [{ view: 'attention' as const, status: 'scheduled' as const }, []],
      [{ view: 'active' as const, priority: true }, ['ACTIVE-A']],
      [{ view: 'active' as const, movable: true }, ['ACTIVE-A', 'ACTIVE-B']],
      [{ view: 'active' as const, stage: 'washing' as const }, ['ACTIVE-B']],
      [
        { view: 'all' as const, dueBucket: 'overdue' as const },
        ['RELEASE-PENDING'],
      ],
      [
        { view: 'all' as const, dueBucket: 'tomorrow' as const },
        ['TOMORROW-PENDING'],
      ],
      [
        { view: 'intake' as const, movable: false },
        [
          'RELEASE-PENDING',
          'INTAKE-REQUIRED',
          'QUEUE-CONFLICT',
          'ELIGIBLE-CLEAR',
          'MANUAL-OVERRIDE',
          'TOMORROW-PENDING',
        ],
      ],
    ] as const;
    for (const [filters, expected] of cases) {
      const outcome = await target.execute(query(filters));
      expect(outcome.kind).toBe('success');
      if (outcome.kind === 'success')
        expect(
          outcome.value.items.map((item) => item.order.externalOrderId),
        ).toEqual(expected);
    }
  });

  it('paginates equal due instants by UUID and binds the cursor to filters before location lookup', async () => {
    await seed();
    const target = make();
    const firstInput = query({ view: 'active', limit: 1 });
    const first = await target.execute(firstInput);
    expect(first).toMatchObject({
      kind: 'success',
      value: {
        items: [{ order: { id: orderIds.activeA } }],
        nextCursor: expect.any(String),
      },
    });
    if (first.kind === 'failure' || first.value.nextCursor === null) return;
    const second = await target.execute(
      query({
        view: 'active',
        limit: 100,
        cursor: first.value.nextCursor,
      }),
    );
    expect(second).toMatchObject({
      kind: 'success',
      value: {
        items: [{ order: { id: orderIds.activeB } }],
        nextCursor: null,
      },
    });
    await expect(
      target.execute(
        query({
          locationId: 'missing-location',
          view: 'active',
          priority: true,
          cursor: first.value.nextCursor,
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_cursor_invalid' },
    });
  });
});
