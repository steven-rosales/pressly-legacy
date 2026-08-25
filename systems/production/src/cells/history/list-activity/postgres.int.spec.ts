import type {
  PostgresDatabase,
  PostgresTransaction,
} from '@pressly/postgres/client';
import { eq, sql } from '@pressly/postgres/query';
import {
  productionTestSchema,
  seedProductionLocationTestFacts,
} from '../../../testing/production-schema.spec-support.ts';
import {
  productionActorReadTestCapability,
  productionScopeReconciliationTestCapability,
} from '../../../testing/production-capabilities.spec-support.ts';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeExecuteListHistoryActivity } from './execute.ts';
import { makeListHistoryActivityPostgresRepository } from './postgres.ts';
import type { ListHistoryActivityInput } from './types.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: [
    'work_events',
    'stage_runs',
    'production_batch_orders',
    'production_batches',
    'production_runs',
    'schedule_runs',
    'scheduler_configs',
    'production_stations',
    'production_orders',
    'production_shifts',
    'order_demands',
    'production_locations',
  ],
  maxConnections: 1,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : { resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'] }),
});

beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

const businessId = '00000000-0000-4000-8000-000000000100';
const locationId = 'location-history-activity';
const siblingLocationId = 'location-history-activity-sibling';
const asOf = new Date('2026-08-21T20:00:00.000Z');
const ids = {
  actor: '31000000-0000-4000-8000-000000000001',
  shift: '31000000-0000-4000-8000-000000000002',
  config: '31000000-0000-4000-8000-000000000003',
  schedule: '31000000-0000-4000-8000-000000000004',
  run: '31000000-0000-4000-8000-000000000005',
  batch: '31000000-0000-4000-8000-000000000006',
  station: '31000000-0000-4000-8000-000000000007',
  stage: '31000000-0000-4000-8000-000000000008',
  sourceOrder: '31000000-0000-4000-8000-000000000009',
  fulfillment: '31000000-0000-4000-8000-000000000010',
  demand: '31000000-0000-4000-8000-000000000011',
  order: '31000000-0000-4000-8000-000000000012',
  membership: '31000000-0000-4000-8000-000000000013',
  runEvent: '31000000-0000-4000-8000-000000000020',
  batchEvent: '31000000-0000-4000-8000-000000000021',
  scheduleEvent: '31000000-0000-4000-8000-000000000022',
  shiftEvent: '31000000-0000-4000-8000-000000000023',
  demandEvent: '31000000-0000-4000-8000-000000000024',
  orderEvent: '31000000-0000-4000-8000-000000000025',
  stageEvent: '31000000-0000-4000-8000-000000000026',
  archiveEvent: '31000000-0000-4000-8000-000000000027',
  bulkArchiveEvent: '31000000-0000-4000-8000-000000000028',
  restoreEvent: '31000000-0000-4000-8000-000000000029',
  configEvent: '31000000-0000-4000-8000-000000000030',
  privateEvent: '31000000-0000-4000-8000-000000000031',
  siblingEvent: '31000000-0000-4000-8000-000000000032',
  precisionOldest: '31000000-0000-4000-8000-000000000033',
  precisionMiddle: '31000000-0000-4000-8000-000000000034',
  precisionNewest: '31000000-0000-4000-8000-000000000035',
} as const;

type WorkEventSeed = Readonly<{
  id: string;
  locationId?: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId?: string;
  expectedVersion?: number;
  payload?: Record<string, unknown>;
  createdAt: string;
}>;

const event = (input: WorkEventSeed) => ({
  id: input.id,
  locationId: input.locationId ?? locationId,
  eventType: input.eventType,
  entityType: input.entityType,
  entityId: input.entityId,
  actorId: input.actorId ?? ids.actor,
  idempotencyKey: `history-activity-${input.id}`,
  payload: input.payload ?? {},
  createdAt: new Date(input.createdAt),
  ...(input.expectedVersion === undefined
    ? {}
    : { expectedVersion: input.expectedVersion }),
});

const seed = async (): Promise<void> => {
  await seedProductionLocationTestFacts(database.db, [
    {
      id: locationId,
      businessId,
      name: 'History Activity Facility',
      timezone: 'America/New_York',
    },
    {
      id: siblingLocationId,
      businessId,
      name: 'Sibling History Facility',
      timezone: 'America/Chicago',
    },
  ]);
  await database.db.insert(productionTestSchema.productionShifts).values({
    id: ids.shift,
    locationId,
    startsAt: new Date('2026-08-21T08:00:00.000Z'),
    endsAt: new Date('2026-08-21T20:00:00.000Z'),
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
  });
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
  await database.db.insert(productionTestSchema.scheduleRuns).values({
    id: ids.schedule,
    locationId,
    productionShiftId: ids.shift,
    schedulerConfigId: ids.config,
    status: 'accepted',
    inputSnapshot: {},
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: {},
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 1,
    makespanMinutes: 224,
    plannedCompletionAt: new Date('2026-08-21T18:00:00.000Z'),
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: new Date('2026-08-21T07:30:00.000Z'),
    acceptedBy: ids.actor,
  });
  await database.db.insert(productionTestSchema.productionRuns).values({
    id: ids.run,
    locationId,
    productionShiftId: ids.shift,
    scheduleRunId: ids.schedule,
    status: 'started',
    startedAt: new Date('2026-08-21T08:00:00.000Z'),
    queueVersion: 1,
    plannedCompletionAt: new Date('2026-08-21T18:00:00.000Z'),
  });
  await database.db.insert(productionTestSchema.stations).values({
    id: ids.station,
    locationId,
    kind: 'sorting',
    label: 'Sorting',
    sortOrder: 0,
  });
  await database.db.insert(productionTestSchema.orderDemands).values({
    id: ids.demand,
    fulfillmentId: ids.fulfillment,
    fulfillmentVersion: 1,
    projectionHash: 'c'.repeat(64),
    admissionState: 'released',
    commercialState: 'open',
    displayReference: 'HISTORY-ORDER-1',
    locationId,
    revisionAt: new Date('2026-08-21T07:00:00.000Z'),
    phase: 'production_released',
    estimatedWeightLbs: 30,
    estimatedWeightSource: 'test_estimate',
    dueAt: asOf,
  });
  await database.db.insert(productionTestSchema.productionOrders).values({
    id: ids.order,
    orderDemandId: ids.demand,
    locationId,
    dueAt: asOf,
    priority: true,
    operationalStatus: 'scheduled',
    executionStatus: 'scheduled',
    resolutionState: 'resolved_without_production',
    resolvedAt: new Date('2026-08-21T18:30:00.000Z'),
    resolvedBy: ids.actor,
    resolutionReason: 'completed_outside_pressly',
    derivedWeightLbs: 30,
    bagCount: 1,
    bagCountSource: 'operator_intake',
    intakeVersion: 1,
    version: 7,
  });
  await database.db.insert(productionTestSchema.productionBatches).values({
    id: ids.batch,
    locationId,
    productionRunId: ids.run,
    sequenceIndex: 0,
    status: 'queued',
    pulseCapacityLbs: 100,
    derivedWeightLbs: 30,
    pulseMinutes: 56,
    plannedDoneAt: new Date('2026-08-21T18:00:00.000Z'),
  });
  await database.db.insert(productionTestSchema.productionBatchOrders).values({
    id: ids.membership,
    locationId,
    productionBatchId: ids.batch,
    productionOrderId: ids.order,
    placementProvenance: 'initial_schedule',
    placedAt: new Date('2026-08-21T07:30:00.000Z'),
  });
  await database.db.insert(productionTestSchema.stageRuns).values({
    id: ids.stage,
    locationId,
    productionBatchId: ids.batch,
    stationId: ids.station,
    stageKind: 'sorting',
    status: 'planned',
    plannedStartAt: new Date('2026-08-21T08:00:00.000Z'),
    plannedEndAt: new Date('2026-08-21T09:00:00.000Z'),
  });

  const baseEvents: readonly WorkEventSeed[] = [
    {
      id: ids.runEvent,
      eventType: 'production_run_started',
      entityType: 'production_run',
      entityId: ids.run,
      payload: {
        scheduleRunId: ids.schedule,
        productionBatchIds: [ids.batch],
        queueVersion: 1,
      },
      createdAt: '2026-08-21T12:00:00.000Z',
    },
    {
      id: ids.batchEvent,
      eventType: 'batch_membership_frozen',
      entityType: 'production_batch',
      entityId: ids.batch,
      payload: { batchVersion: 2, queueVersion: 2 },
      createdAt: '2026-08-21T13:00:00.000Z',
    },
    {
      id: ids.scheduleEvent,
      eventType: 'schedule_accepted',
      entityType: 'schedule_run',
      entityId: ids.schedule,
      payload: {
        productionShiftId: ids.shift,
        inputSnapshotHash: 'a'.repeat(64),
        outputPlanHash: 'b'.repeat(64),
        acknowledgedWarningCodes: [],
      },
      createdAt: '2026-08-21T14:00:00.000Z',
    },
    {
      id: ids.shiftEvent,
      eventType: 'production_shift_updated',
      entityType: 'production_shift',
      entityId: ids.shift,
      payload: { changedFields: ['startsAt'] },
      createdAt: '2026-08-21T15:00:00.000Z',
    },
    {
      id: ids.demandEvent,
      eventType: 'order_demand_applied',
      entityType: 'order_demand',
      entityId: ids.demand,
      payload: { outcome: 'applied' },
      createdAt: '2026-08-21T16:00:00.000Z',
    },
    {
      id: ids.orderEvent,
      eventType: 'production_order_priority_changed',
      entityType: 'production_order',
      entityId: ids.order,
      expectedVersion: 6,
      payload: { priority: true, version: 7 },
      createdAt: '2026-08-21T17:00:00.000Z',
    },
    {
      id: ids.stageEvent,
      eventType: 'stage_completed',
      entityType: 'stage_run',
      entityId: ids.stage,
      expectedVersion: 2,
      payload: { version: 3 },
      createdAt: '2026-08-21T18:00:00.000Z',
    },
    {
      id: ids.archiveEvent,
      eventType: 'production_order_resolved_without_production',
      entityType: 'production_order',
      entityId: ids.order,
      expectedVersion: 6,
      payload: {
        action: 'resolve_without_production',
        resolutionState: 'resolved_without_production',
        reason: 'completed_outside_pressly',
        note: 'private note',
        _idempotency: { command: 'private command' },
        version: 7,
      },
      createdAt: '2026-08-21T18:30:00.000Z',
    },
    {
      id: ids.bulkArchiveEvent,
      eventType: 'production_order_bulk_resolved_without_production',
      entityType: 'production_order',
      entityId: ids.order,
      expectedVersion: 6,
      payload: { action: 'resolve_without_production', version: 7 },
      createdAt: '2026-08-21T18:31:00.000Z',
    },
    {
      id: ids.restoreEvent,
      eventType: 'production_order_restored',
      entityType: 'production_order',
      entityId: ids.order,
      expectedVersion: 7,
      payload: { action: 'restore', version: 8 },
      createdAt: '2026-08-21T18:32:00.000Z',
    },
    {
      id: ids.configEvent,
      eventType: 'scheduler_config_published',
      entityType: 'scheduler_config',
      entityId: ids.config,
      payload: { version: 1 },
      createdAt: '2026-08-21T19:00:00.000Z',
    },
    {
      id: ids.privateEvent,
      eventType: 'private_internal_event',
      entityType: 'production_run',
      entityId: ids.run,
      payload: { private: true },
      createdAt: '2026-08-21T19:15:00.000Z',
    },
    {
      id: ids.siblingEvent,
      locationId: siblingLocationId,
      eventType: 'scheduler_config_published',
      entityType: 'scheduler_config',
      entityId: ids.config,
      actorId: '31000000-0000-4000-8000-000000000099',
      payload: { version: 9 },
      createdAt: '2026-08-21T19:30:00.000Z',
    },
  ];
  await database.db
    .insert(productionTestSchema.workEvents)
    .values(baseEvents.map(event));

  const precisionEvents = [
    [ids.precisionOldest, '2026-08-21T19:45:00.000100Z'],
    [ids.precisionMiddle, '2026-08-21T19:45:00.000500Z'],
    [ids.precisionNewest, '2026-08-21T19:45:00.000900Z'],
  ] as const;
  await database.db.insert(productionTestSchema.workEvents).values(
    precisionEvents.map(([id]) =>
      event({
        id,
        eventType: 'stage_started',
        entityType: 'stage_run',
        entityId: ids.stage,
        payload: { version: 2 },
        createdAt: '2026-08-21T19:45:00.000Z',
      }),
    ),
  );
  for (const [id, createdAt] of precisionEvents)
    await database.db
      .update(productionTestSchema.workEvents)
      .set({ createdAt: sql<Date>`${createdAt}::timestamptz` })
      .where(eq(productionTestSchema.workEvents.id, id));
};

const readState = async () => {
  const [events, locations, runs, ordersState, memberships] = await Promise.all(
    [
      database.db.select().from(productionTestSchema.workEvents),
      database.db.select().from(productionTestSchema.productionLocations),
      database.db.select().from(productionTestSchema.productionRuns),
      database.db.select().from(productionTestSchema.productionOrders),
      database.db.select().from(productionTestSchema.productionBatchOrders),
    ],
  );
  return { events, locations, runs, orders: ordersState, memberships };
};

type TransactionOptions = Parameters<PostgresDatabase['transaction']>[1];

const observeTransactions = (input: {
  timing?: string[];
  options: TransactionOptions[];
  readOnly: string[];
}): PostgresDatabase => {
  const transaction = (async (
    callback: (transaction: PostgresTransaction) => Promise<unknown>,
    options: TransactionOptions,
  ) => {
    input.timing?.push('read');
    input.options.push(options);
    return database.db.transaction(async (transaction) => {
      const modes = await transaction.execute(sql`show transaction_read_only`);
      const first = modes[0];
      input.readOnly.push(
        typeof first === 'object' &&
          first !== null &&
          'transaction_read_only' in first
          ? String(first['transaction_read_only'])
          : 'missing',
      );
      return callback(transaction);
    }, options);
  }) as PostgresDatabase['transaction'];

  return new Proxy(database.db, {
    get: (target, property) => {
      if (property === 'transaction') return transaction;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};

describe('list-history-activity PostgreSQL read model', () => {
  it('paginates exact microseconds in descending order inside read-only repeatable-read snapshots', async () => {
    await seed();
    const before = await readState();
    const options: TransactionOptions[] = [];
    const readOnly: string[] = [];
    const repository = makeListHistoryActivityPostgresRepository(
      observeTransactions({ options, readOnly }),
      productionTestSchema,
      productionActorReadTestCapability([
        { id: ids.actor, displayName: 'Alex Operator' },
      ]),
      productionScopeReconciliationTestCapability(database.db),
    );
    const collected: string[] = [];
    let cursor: string | undefined;

    do {
      const page = await repository.list(
        {
          locationId,
          eventType: 'stage_started',
          limit: 1,
          ...(cursor === undefined ? {} : { cursor }),
        },
        asOf,
      );
      expect(page.kind).toBe('found');
      if (page.kind !== 'found') break;
      collected.push(...page.page.items.map((item) => item.id));
      expect(page.page.asOf).toBe(asOf);
      cursor = page.page.nextCursor ?? undefined;
    } while (cursor !== undefined);

    expect(collected).toEqual([
      ids.precisionNewest,
      ids.precisionMiddle,
      ids.precisionOldest,
    ]);
    expect(new Set(collected).size).toBe(collected.length);
    expect(options).toEqual(
      Array.from({ length: 3 }, () => ({
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      })),
    );
    expect(readOnly).toEqual(['on', 'on', 'on']);
    expect(await readState()).toEqual(before);
  });

  it('applies the event allowlist, complete run scope, and all SQL filters', async () => {
    await seed();
    const repository = makeListHistoryActivityPostgresRepository(
      database.db,
      productionTestSchema,
      productionActorReadTestCapability([
        { id: ids.actor, displayName: 'Alex Operator' },
      ]),
      productionScopeReconciliationTestCapability(database.db),
    );
    const list = async (
      input: Omit<ListHistoryActivityInput, 'locationId' | 'limit'>,
    ) => {
      const loaded = await repository.list(
        { locationId, limit: 100, ...input },
        asOf,
      );
      expect(loaded.kind).toBe('found');
      return loaded.kind === 'found' ? loaded.page.items : [];
    };

    const runScoped = await list({ runId: ids.run });
    expect(runScoped.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        ids.runEvent,
        ids.batchEvent,
        ids.scheduleEvent,
        ids.shiftEvent,
        ids.demandEvent,
        ids.orderEvent,
        ids.stageEvent,
      ]),
    );
    expect(runScoped.some(({ id }) => id === ids.configEvent)).toBe(false);
    expect(runScoped.some(({ id }) => id === ids.privateEvent)).toBe(false);
    expect(
      runScoped.every(({ productionRunId }) => productionRunId === ids.run),
    ).toBe(true);

    expect(
      (await list({ search: 'STAGE_COMPLETED' })).map(({ id }) => id),
    ).toEqual([ids.stageEvent]);
    expect(
      (await list({ search: 'PRODUCTION_BATCH' })).map(({ id }) => id),
    ).toEqual([ids.batchEvent]);
    expect((await list({ search: ids.shift })).map(({ id }) => id)).toEqual([
      ids.shiftEvent,
    ]);
    expect(await list({ search: 'ALEX OPERATOR' })).toHaveLength(14);
    expect(
      (
        await list({
          eventType: 'stage_completed',
          occurredAfter: new Date('2026-08-21T18:00:00.000Z'),
        })
      ).map(({ id }) => id),
    ).toEqual([ids.stageEvent]);
    expect(
      (await list({ orderResolution: 'archived' })).map(({ id }) => id),
    ).toEqual([ids.bulkArchiveEvent, ids.archiveEvent]);
    expect(
      (await list({ orderResolution: 'restored' })).map(({ id }) => id),
    ).toEqual([ids.restoreEvent]);
    expect(
      await list({
        orderResolution: 'archived',
        eventType: 'production_order_restored',
      }),
    ).toEqual([]);
  });

  it('binds cursors to filters before location lookup while retaining cross-location reuse', async () => {
    await seed();
    const repository = makeListHistoryActivityPostgresRepository(
      database.db,
      productionTestSchema,
      productionActorReadTestCapability([
        { id: ids.actor, displayName: 'Alex Operator' },
      ]),
      productionScopeReconciliationTestCapability(database.db),
    );
    const first = await repository.list({ locationId, limit: 1 }, asOf);
    expect(first.kind).toBe('found');
    if (first.kind !== 'found' || first.page.nextCursor === null) return;

    await expect(
      repository.list(
        {
          locationId,
          cursor: first.page.nextCursor,
          search: 'different-filter',
          limit: 1,
        },
        asOf,
      ),
    ).resolves.toEqual({ kind: 'invalid_cursor' });
    await expect(
      repository.list(
        { locationId: 'missing', cursor: 'invalid', limit: 50 },
        asOf,
      ),
    ).resolves.toEqual({ kind: 'invalid_cursor' });
    await expect(
      repository.list({ locationId: 'missing', limit: 50 }, asOf),
    ).resolves.toEqual({ kind: 'location_not_found' });

    const sibling = await repository.list(
      {
        locationId: siblingLocationId,
        cursor: first.page.nextCursor,
        limit: 100,
      },
      asOf,
    );
    expect(sibling).toMatchObject({
      kind: 'found',
      page: { items: [{ id: ids.siblingEvent }] },
    });
    if (sibling.kind === 'found')
      expect(
        sibling.page.items.every((item) => item.id === ids.siblingEvent),
      ).toBe(true);
  });

  it('keeps operational identity fallback fields and private audit data out of Production results', async () => {
    await seed();
    const repository = makeListHistoryActivityPostgresRepository(
      database.db,
      productionTestSchema,
      productionActorReadTestCapability([
        { id: ids.actor, displayName: 'Alex Operator' },
      ]),
      productionScopeReconciliationTestCapability(database.db),
    );
    const loaded = await repository.list(
      { locationId, orderResolution: 'archived', limit: 100 },
      asOf,
    );

    expect(loaded.kind).toBe('found');
    if (loaded.kind !== 'found') return;
    expect(loaded.page.items).toHaveLength(2);
    expect(loaded.page.items[0]).toMatchObject({
      entityType: 'production_order',
      entityId: ids.order,
      actor: { kind: 'user', displayName: 'Alex Operator' },
      resolutionAction: { action: 'restore', expectedVersion: 7 },
    });
    const serialized = JSON.stringify(loaded.page);
    expect(serialized).not.toContain('displayNumber');
    expect(serialized).not.toContain('identity');
    expect(serialized).not.toContain('private note');
    expect(serialized).not.toContain('_idempotency');
  });

  it('preserves clock-before-native-read ordering through the bound executor', async () => {
    await seed();
    const before = await readState();
    const timing: string[] = [];
    const options: TransactionOptions[] = [];
    const readOnly: string[] = [];
    const repo = makeListHistoryActivityPostgresRepository(
      observeTransactions({ timing, options, readOnly }),
      productionTestSchema,
      productionActorReadTestCapability([
        { id: ids.actor, displayName: 'Alex Operator' },
      ]),
      productionScopeReconciliationTestCapability(database.db),
    );
    const execute = makeExecuteListHistoryActivity({
      repo,
      clock: {
        now: () => {
          timing.push('clock');
          return asOf;
        },
      },
    });

    await expect(
      execute({ locationId, eventType: 'stage_completed', limit: 50 }),
    ).resolves.toMatchObject({
      kind: 'success',
      value: {
        items: [{ id: ids.stageEvent }],
        asOf: asOf.toISOString(),
      },
    });
    expect(timing).toEqual(['clock', 'read']);
    expect(options).toEqual([
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    ]);
    expect(readOnly).toEqual(['on']);
    expect(await readState()).toEqual(before);
  });
});
