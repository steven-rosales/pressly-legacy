import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import {
  productionOrderBacklogCursorSchema,
  productionOrderBacklogPreviewSchema,
} from '../../../read-models/production-order-backlog/contract.ts';
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
import type { ProductionOrderBacklogScope } from '../../../read-models/production-order-backlog/model.ts';
import { makeExecutePreviewOrderBacklog } from './execute.ts';
import { makePreviewOrderBacklogPostgresRepository } from './postgres.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_preview_order_backlog_cell_test',
  ),
  tableNames: [
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

beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

const uuid = (suffix: number, prefix = 74000000): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const ids = {
  business: '00000000-0000-4000-8000-000000000740',
  actor: uuid(1),
  shift: uuid(2),
  config: uuid(3),
  schedule: uuid(4),
  run: uuid(5),
  batch: uuid(6),
  membership: uuid(7),
  station: uuid(8),
  stage: uuid(9),
  attempt: uuid(10),
  routeEvent: uuid(11),
  selectionEvent: uuid(12),
  readyA: uuid(101),
  readyB: uuid(102),
  review: uuid(103),
  participant: uuid(104),
  selectedSnapshot: uuid(105),
  selectedEvent: uuid(106),
  resolved: uuid(107),
  finished: uuid(108),
  afterCutoff: uuid(109),
  sibling: uuid(110),
  atCutoff: uuid(111),
} as const;
const locationId = 'location-preview-backlog';
const siblingLocationId = 'location-preview-backlog-sibling';
const cutoff = '2026-08-01T00:00:00.000Z';
const generatedAt = new Date('2026-08-22T15:00:00.000Z');
const baseDueAt = new Date('2026-07-01T12:00:00.000Z');

type SeedOrder = Readonly<{
  productionOrderId: string;
  ordinal: number;
  dueAt?: Date;
  location?: string;
  displayReference?: string;
  production?: Partial<
    typeof productionTestSchema.productionOrders.$inferInsert
  >;
}>;

const seedLocationRoots = async () => {
  await database.db.insert(productionTestSchema.productionLocations).values([
    {
      id: locationId,
      businessId: ids.business,
      name: 'Preview Backlog Facility',
      timezone: 'America/New_York',
    },
    {
      id: siblingLocationId,
      businessId: ids.business,
      name: 'Sibling Preview Backlog Facility',
      timezone: 'America/Chicago',
    },
  ]);
};

const seedOrder = async (input: SeedOrder) => {
  const location = input.location ?? locationId;
  const dueAt = input.dueAt ?? baseDueAt;
  const fulfillmentId = uuid(input.ordinal, 74200000);
  const demandId = uuid(input.ordinal, 74300000);
  await database.db.insert(productionTestSchema.orderDemands).values({
    id: demandId,
    fulfillmentId,
    fulfillmentVersion: 1,
    projectionHash: 'a'.repeat(64),
    admissionState: 'unreleased',
    commercialState: 'open',
    displayReference: input.displayReference ?? `ORDER-${input.ordinal}`,
    locationId: location,
    revisionAt: dueAt,
    phase: 'expected',
    estimatedWeightLbs: 20,
    estimatedWeightSource: 'test',
    dueAt,
  });
  await database.db.insert(productionTestSchema.productionOrders).values({
    id: input.productionOrderId,
    orderDemandId: demandId,
    locationId: location,
    dueAt,
    operationalStatus: 'release_pending',
    executionStatus: 'unassigned',
    derivedWeightLbs: 20,
    version: input.ordinal,
    ...input.production,
  });
};

const seedPlanningEvidence = async () => {
  await database.db.insert(productionTestSchema.productionShifts).values({
    id: ids.shift,
    locationId,
    startsAt: new Date('2026-08-22T14:00:00.000Z'),
    endsAt: new Date('2026-08-22T22:00:00.000Z'),
    timezone: 'America/New_York',
    status: 'draft',
    effectiveFolderCount: 2,
  });
  await database.db.insert(productionTestSchema.schedulerConfigs).values({
    id: ids.config,
    locationId,
    pulseMinutes: 45,
    foldLbsPerFolderMinute: 1,
    algorithmVersion: 'fixed-pulse-ffd-v1',
    version: 1,
    stageFitAssertion: {},
    assertedBy: ids.actor,
    publishedAt: generatedAt,
  });
  await database.db.insert(productionTestSchema.scheduleRuns).values({
    id: ids.schedule,
    locationId,
    productionShiftId: ids.shift,
    schedulerConfigId: ids.config,
    status: 'draft',
    inputSnapshot: {
      orders: [
        { id: ids.participant },
        { id: ids.selectedSnapshot, recorded: true },
      ],
    },
    inputSnapshotHash: 'schedule-input',
    outputPlan: {},
    outputPlanHash: 'schedule-output',
    algorithmVersion: 'fixed-pulse-ffd-v1',
    pulseCapacityLbs: 100,
    batchCount: 1,
    makespanMinutes: 45,
    plannedCompletionAt: new Date('2026-08-22T20:00:00.000Z'),
  });
  await database.db.insert(productionTestSchema.productionRuns).values({
    id: ids.run,
    locationId,
    productionShiftId: ids.shift,
    scheduleRunId: ids.schedule,
    status: 'started',
    startedAt: new Date('2026-08-22T14:00:00.000Z'),
    queueVersion: 1,
    plannedCompletionAt: new Date('2026-08-22T20:00:00.000Z'),
  });
  await database.db.insert(productionTestSchema.productionBatches).values({
    id: ids.batch,
    locationId,
    productionRunId: ids.run,
    sequenceIndex: 1,
    status: 'queued',
    pulseCapacityLbs: 100,
    derivedWeightLbs: 20,
    pulseMinutes: 45,
    plannedDoneAt: new Date('2026-08-22T19:00:00.000Z'),
  });
  await database.db.insert(productionTestSchema.stations).values({
    id: ids.station,
    locationId,
    kind: 'sorting',
    label: 'Sorting',
    sortOrder: 1,
  });
  await database.db.insert(productionTestSchema.stageRuns).values({
    id: ids.stage,
    locationId,
    productionBatchId: ids.batch,
    stationId: ids.station,
    stageKind: 'sorting',
    status: 'planned',
    plannedStartAt: new Date('2026-08-22T14:00:00.000Z'),
    plannedEndAt: new Date('2026-08-22T14:15:00.000Z'),
  });
  await database.db.insert(productionTestSchema.productionBatchOrders).values({
    id: ids.membership,
    locationId,
    productionBatchId: ids.batch,
    productionOrderId: ids.participant,
    active: false,
    placementProvenance: 'automatic',
    placedAt: new Date('2026-08-22T13:30:00.000Z'),
    placedBy: ids.actor,
    releasedAt: new Date('2026-08-22T13:40:00.000Z'),
    releasedBy: ids.actor,
    releaseReason: 'other',
  });
  await database.db
    .insert(productionTestSchema.productionOrderStageAttempts)
    .values({
      id: ids.attempt,
      locationId,
      productionRunId: ids.run,
      productionOrderId: ids.participant,
      stageRunId: ids.stage,
      stageKind: 'sorting',
      attemptNumber: 1,
      status: 'released',
      assignmentReason: 'initial_schedule',
      assignedAt: new Date('2026-08-22T13:30:00.000Z'),
      assignedBy: ids.actor,
      releasedAt: new Date('2026-08-22T13:40:00.000Z'),
      releasedBy: ids.actor,
      releaseReason: 'other',
    });
  await database.db
    .insert(productionTestSchema.productionShiftSelections)
    .values({
      productionShiftId: ids.shift,
      locationId,
      version: 1,
      selectedBy: ids.actor,
      selectedAt: new Date('2026-08-22T13:00:00.000Z'),
    });
  await database.db
    .insert(productionTestSchema.productionShiftSelectedOrders)
    .values({
      productionShiftId: ids.shift,
      locationId,
      productionOrderId: ids.participant,
      selectedBy: ids.actor,
      selectedAt: new Date('2026-08-22T13:00:00.000Z'),
    });
  await database.db.insert(productionTestSchema.workEvents).values([
    {
      id: ids.routeEvent,
      locationId,
      eventType: 'production_order_route_exception_recorded',
      entityType: 'production_order',
      entityId: ids.participant,
      actorId: ids.actor,
      expectedVersion: 1,
      idempotencyKey: 'preview-backlog-route-event',
      payload: {},
      createdAt: generatedAt,
    },
    {
      id: ids.selectionEvent,
      locationId,
      eventType: 'production_shift_selection_replaced',
      entityType: 'production_shift',
      entityId: ids.shift,
      actorId: ids.actor,
      expectedVersion: 1,
      idempotencyKey: 'preview-backlog-selection-event',
      payload: { selectedOrderIds: [ids.selectedEvent] },
      createdAt: generatedAt,
    },
  ]);
};

const seedCompleteGraph = async () => {
  await seedLocationRoots();
  await seedOrder({
    productionOrderId: ids.readyA,
    ordinal: 1,
    displayReference: 'READY-A',
  });
  await seedOrder({
    productionOrderId: ids.readyB,
    ordinal: 2,
    displayReference: 'READY-B',
  });
  await seedOrder({
    productionOrderId: ids.review,
    ordinal: 3,
    dueAt: new Date('2026-07-02T12:00:00.000Z'),
    displayReference: 'REVIEW',
    production: {
      intakeVersion: 1,
      intakeRecordedAt: new Date('2026-07-02T12:00:00.000Z'),
      bagCount: 2,
      bagCountSource: 'operator_intake',
      admissionOverride: 'released',
      admissionOverrideAt: new Date('2026-07-02T12:00:00.000Z'),
      admissionOverrideBy: ids.actor,
      priority: true,
      pendingPlacement: { reason: 'manager_review' },
    },
  });
  await seedOrder({
    productionOrderId: ids.participant,
    ordinal: 4,
    dueAt: new Date('2026-07-03T12:00:00.000Z'),
    displayReference: 'PARTICIPANT',
    production: {
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
    },
  });
  await seedOrder({
    productionOrderId: ids.selectedSnapshot,
    ordinal: 5,
    dueAt: new Date('2026-07-04T12:00:00.000Z'),
    displayReference: 'SNAPSHOT-SELECTED',
  });
  await seedOrder({
    productionOrderId: ids.selectedEvent,
    ordinal: 6,
    dueAt: new Date('2026-07-05T12:00:00.000Z'),
    displayReference: 'EVENT-SELECTED',
  });
  await seedOrder({
    productionOrderId: ids.resolved,
    ordinal: 7,
    dueAt: new Date('2026-07-06T12:00:00.000Z'),
    displayReference: 'RESOLVED',
    production: {
      resolutionState: 'resolved_without_production',
      resolvedAt: new Date('2026-07-07T12:00:00.000Z'),
      resolvedBy: ids.actor,
      resolutionReason: 'processor_not_in_use',
    },
  });
  await seedOrder({
    productionOrderId: ids.finished,
    ordinal: 8,
    dueAt: new Date('2026-07-07T12:00:00.000Z'),
    displayReference: 'FINISHED',
    production: {
      operationalStatus: 'finished',
      executionStatus: 'finished',
      finishedAt: new Date('2026-07-08T12:00:00.000Z'),
    },
  });
  await seedOrder({
    productionOrderId: ids.afterCutoff,
    ordinal: 9,
    dueAt: new Date('2026-08-01T00:00:00.001Z'),
    displayReference: 'AFTER-CUTOFF',
  });
  await seedOrder({
    productionOrderId: ids.sibling,
    ordinal: 10,
    location: siblingLocationId,
    dueAt: new Date('2026-07-01T12:00:00.000Z'),
    displayReference: 'SIBLING',
  });
  await seedOrder({
    productionOrderId: ids.atCutoff,
    ordinal: 11,
    dueAt: new Date(cutoff),
    displayReference: 'AT-CUTOFF',
  });
  await seedPlanningEvidence();
};

const request = (
  overrides: Partial<ProductionOrderBacklogScope> = {},
): ProductionOrderBacklogScope => ({
  locationId,
  filter: 'all_due_before_cutoff',
  cutoff,
  reason: 'processor_not_in_use',
  cursor: null,
  maxOrders: 250,
  ...overrides,
});

const durableState = async () => {
  const [
    locations,
    demands,
    productionOrders,
    shifts,
    selections,
    selectedOrders,
    configs,
    schedules,
    runs,
    batches,
    memberships,
    stations,
    stages,
    attempts,
    events,
  ] = await Promise.all([
    database.db.select().from(productionTestSchema.productionLocations),
    database.db.select().from(productionTestSchema.orderDemands),
    database.db.select().from(productionTestSchema.productionOrders),
    database.db.select().from(productionTestSchema.productionShifts),
    database.db.select().from(productionTestSchema.productionShiftSelections),
    database.db
      .select()
      .from(productionTestSchema.productionShiftSelectedOrders),
    database.db.select().from(productionTestSchema.schedulerConfigs),
    database.db.select().from(productionTestSchema.scheduleRuns),
    database.db.select().from(productionTestSchema.productionRuns),
    database.db.select().from(productionTestSchema.productionBatches),
    database.db.select().from(productionTestSchema.productionBatchOrders),
    database.db.select().from(productionTestSchema.stations),
    database.db.select().from(productionTestSchema.stageRuns),
    database.db
      .select()
      .from(productionTestSchema.productionOrderStageAttempts),
    database.db.select().from(productionTestSchema.workEvents),
  ]);
  return {
    locations,
    demands,
    productionOrders,
    shifts,
    selections,
    selectedOrders,
    configs,
    schedules,
    runs,
    batches,
    memberships,
    stations,
    stages,
    attempts,
    events,
  };
};

describe('preview order backlog native Postgres query', () => {
  it('loads and classifies the complete bounded snapshot without changing durable state', async () => {
    await seedCompleteGraph();
    const before = await durableState();
    const repo = makePreviewOrderBacklogPostgresRepository(
      database.db,
      productionTestSchema,
    );
    const trace: string[] = [];
    const loadSnapshot = vi.fn(async (scope) => {
      trace.push('read');
      const snapshot = await repo.loadSnapshot(scope);
      trace.push('read-complete');
      return snapshot;
    });
    const clock = vi.fn(() => {
      trace.push('clock');
      return generatedAt;
    });
    const raw = await repo.loadSnapshot({
      locationId,
      filter: 'all_due_before_cutoff',
      cutoff: new Date(cutoff),
      maxOrders: 250,
      after: null,
    });
    expect(raw.orders.map((order) => order.orderId)).toEqual([
      ids.readyA,
      ids.readyB,
      ids.review,
      ids.participant,
      ids.selectedSnapshot,
      ids.selectedEvent,
      ids.resolved,
      ids.finished,
      ids.atCutoff,
    ]);

    const outcome = await makeExecutePreviewOrderBacklog({
      repo: { loadSnapshot },
      policy: productionRules,
      clock: { now: clock },
    })(request());
    expect(outcome.kind).toBe('success');
    if (outcome.kind !== 'success') return;
    expect(productionOrderBacklogPreviewSchema.parse(outcome.value)).toEqual(
      outcome.value,
    );
    expect(outcome.value).toMatchObject({
      candidateCount: 9,
      hasMore: false,
      nextCursor: null,
      generatedAt: generatedAt.toISOString(),
      previewHash:
        '9566a735b9fab2987196330adc89983aa35a3897da533ad6b8f6ad551021f16a',
      groups: {
        readyToArchive: [
          { orderId: ids.readyA },
          { orderId: ids.readyB },
          { orderId: ids.atCutoff },
        ],
        reviewIndividually: [
          {
            orderId: ids.review,
            reasons: [
              'intake_recorded',
              'manual_admission',
              'priority',
              'pending_placement',
            ],
          },
        ],
        keptForSafety: [
          {
            orderId: ids.participant,
            reasons: [
              'execution_committed',
              'selected_for_shift',
              'batch_membership_exists',
              'stage_attempt_exists',
              'route_exists',
            ],
          },
          {
            orderId: ids.selectedSnapshot,
            reasons: ['selected_for_shift'],
          },
          {
            orderId: ids.selectedEvent,
            reasons: ['selected_for_shift'],
          },
        ],
        alreadyHistorical: [
          {
            orderId: ids.resolved,
            reasons: ['resolved_without_production'],
          },
          { orderId: ids.finished, reasons: ['execution_finished'] },
        ],
      },
    });
    expect(trace).toEqual(['read', 'read-complete', 'clock']);
    expect(clock).toHaveBeenCalledOnce();
    expect(await durableState()).toEqual(before);
  });

  it('paginates equal due instants by UUID and binds the cursor before database lookup', async () => {
    await seedLocationRoots();
    await seedOrder({ productionOrderId: ids.readyA, ordinal: 1 });
    await seedOrder({ productionOrderId: ids.readyB, ordinal: 2 });
    await seedOrder({
      productionOrderId: ids.review,
      ordinal: 3,
      dueAt: baseDueAt,
    });
    const postgres = makePreviewOrderBacklogPostgresRepository(
      database.db,
      productionTestSchema,
    );
    const loadSnapshot = vi.fn(postgres.loadSnapshot);
    const clock = vi.fn(() => generatedAt);
    const execute = makeExecutePreviewOrderBacklog({
      repo: { loadSnapshot },
      policy: productionRules,
      clock: { now: clock },
    });

    const first = await execute(request({ maxOrders: 2 }));
    expect(first).toMatchObject({
      kind: 'success',
      value: {
        candidateCount: 2,
        hasMore: true,
        groups: {
          readyToArchive: [{ orderId: ids.readyA }, { orderId: ids.readyB }],
        },
        nextCursor: expect.any(String),
      },
    });
    if (first.kind !== 'success' || first.value.nextCursor === null) return;

    const second = await execute(
      request({ cursor: first.value.nextCursor, maxOrders: 99 }),
    );
    expect(second).toMatchObject({
      kind: 'success',
      value: {
        candidateCount: 1,
        hasMore: false,
        cursor: first.value.nextCursor,
        nextCursor: null,
        groups: { readyToArchive: [{ orderId: ids.review }] },
      },
    });

    loadSnapshot.mockClear();
    clock.mockClear();
    await expect(
      execute(
        request({
          locationId: 'missing-location',
          reason: 'duplicate_or_test',
          cursor: first.value.nextCursor,
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: {
        code: 'production_order_backlog_cursor_invalid',
        details: {
          reason: 'production_order_backlog_cursor_scope_mismatch',
        },
      },
    });
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();

    const tampered = productionOrderBacklogCursorSchema.parse(
      `${first.value.nextCursor.slice(0, -1)}${
        first.value.nextCursor.endsWith('a') ? 'b' : 'a'
      }`,
    );
    await expect(execute(request({ cursor: tampered }))).resolves.toMatchObject(
      {
        kind: 'failure',
        failure: {
          code: 'production_order_backlog_cursor_invalid',
          details: { reason: 'production_order_backlog_cursor_invalid' },
        },
      },
    );
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();
  });

  it('returns the stable empty result for a missing location after one read and one clock', async () => {
    await seedLocationRoots();
    const repo = makePreviewOrderBacklogPostgresRepository(
      database.db,
      productionTestSchema,
    );
    const loadSnapshot = vi.fn(repo.loadSnapshot);
    const clock = vi.fn(() => generatedAt);

    await expect(
      makeExecutePreviewOrderBacklog({
        repo: { loadSnapshot },
        policy: productionRules,
        clock: { now: clock },
      })(request({ locationId: 'missing-location' })),
    ).resolves.toMatchObject({
      kind: 'success',
      value: {
        locationId: 'missing-location',
        candidateCount: 0,
        previewHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        groups: {
          readyToArchive: [],
          reviewIndividually: [],
          keptForSafety: [],
          alreadyHistorical: [],
        },
      },
    });
    expect(loadSnapshot).toHaveBeenCalledOnce();
    expect(clock).toHaveBeenCalledOnce();
  });
});
