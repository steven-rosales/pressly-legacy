import {
  productionTestSchema,
  seedProductionLocationTestFacts,
} from '../../../testing/production-schema.spec-support.ts';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { applyFulfillmentDemandCellDeclaration } from './cell.ts';
import { productionScopeReconciliationTestCapability } from '../../../testing/production-capabilities.spec-support.ts';
import {
  createPostgresRuntime,
  type PostgresTransaction,
} from '@pressly/postgres/client';
import { asc, eq, sql } from '@pressly/postgres/query';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { productionRules } from '../../../model/public.ts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeApplyFulfillmentDemandCell } from './cell.ts';
import { resolveApplyFulfillmentDemandReplay } from './idempotency.ts';
import { makeApplyFulfillmentDemandPostgresRepository } from './postgres.ts';
import type { ApplyFulfillmentDemandCommand } from './types.ts';

const databaseUrl = getTestDatabaseUrl(
  'PRESSLY_TEST_DATABASE_URL',
  'postgres://pressly:pressly@localhost:55434/pressly_test',
);
const resetDatabaseUrl = getTestDatabaseUrl(
  'PRESSLY_TEST_DATABASE_RESET_URL',
  databaseUrl,
);
const database = createTestDatabaseRuntime({
  databaseUrl,
  resetDatabaseUrl,
  tableNames: [
    'production_order_stage_attempts',
    'stage_machine_assignments',
    'stage_runs',
    'production_batch_orders',
    'production_batches',
    'production_runs',
    'work_events',
    'production_shift_selected_orders',
    'production_shift_selections',
    'schedule_runs',
    'scheduler_configs',
    'production_bags',
    'production_orders',
    'order_demands',
    'production_shifts',
    'production_locations',
  ],
  maxConnections: 12,
});
const faultDatabase = createPostgresRuntime({
  databaseUrl: resetDatabaseUrl,
  schema: productionTestSchema,
  maxConnections: 2,
});

const uuid = (prefix: number, suffix: number): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const ids = {
  business: uuid(94000000, 100),
  fulfillment: uuid(94000000, 102),
  demand: uuid(94000000, 103),
  productionOrder: uuid(94000000, 104),
  event: uuid(94000000, 105),
  eventOlder: uuid(94000000, 106),
  eventEqual: uuid(94000000, 107),
  secondDemand: uuid(94000000, 108),
  secondProductionOrder: uuid(94000000, 109),
  secondEvent: uuid(94000000, 110),
  collisionEvent: uuid(94000000, 111),
} as const;
const locationId = 'apply-demand-location';
const secondLocationId = 'apply-demand-location-2';
const now = new Date('2026-08-22T16:00:00.000Z');
const dueAt = '2026-08-23T20:00:00.000Z';
const observedAt = '2026-08-22T15:00:00.000Z';

const removeFaults = async (): Promise<void> => {
  await faultDatabase.db.execute(sql`
    drop trigger if exists apply_demand_skip_order_update
    on production_orders
  `);
  await faultDatabase.db.execute(sql`
    drop function if exists apply_demand_skip_order_update()
  `);
};

beforeAll(async () => {
  await database.check();
  await faultDatabase.check();
});
beforeEach(async () => {
  await removeFaults();
  await database.reset();
});
afterAll(async () => {
  await removeFaults();
  await database.close();
  await faultDatabase.close();
});

const sequenceIds = (...values: string[]) => {
  let index = 0;
  const used: string[] = [];
  const source: IdSource = {
    next: () => {
      const value = values[index] ?? uuid(94999999, index + 1);
      index += 1;
      used.push(value);
      return value;
    },
  };
  return { source, used };
};

const seedLocation = async (
  input: {
    id?: string;
    active?: boolean;
  } = {},
): Promise<void> => {
  await seedProductionLocationTestFacts(database.db, [
    {
      id: input.id ?? locationId,
      businessId: ids.business,
      name: input.id ?? 'Apply Demand Facility',
      timezone: 'America/New_York',
      isActive: input.active ?? true,
    },
  ]);
};

const seedBase = async (): Promise<void> => {
  await seedLocation();
};

const command = (
  overrides: Partial<ApplyFulfillmentDemandCommand> = {},
): ApplyFulfillmentDemandCommand => ({
  fulfillmentId: ids.fulfillment,
  fulfillmentVersion: 1,
  projectionHash: 'a'.repeat(64),
  displayReference: 'ORDER-101',
  locationId,
  admissionState: 'released',
  commercialState: 'open',
  dueAt,
  observedAt,
  estimatedWeightLbs: 24,
  estimatedWeightSource: 'external_estimate',
  idempotencyKey: 'order-outbox:event-101',
  ...overrides,
});

const makeCell = (input: {
  generatedIds: readonly string[];
  observedTransactions?: string[];
  clockReads?: string[];
  transformRepository?: (
    repository: ReturnType<typeof makeApplyFulfillmentDemandPostgresRepository>,
  ) => ReturnType<typeof makeApplyFulfillmentDemandPostgresRepository>;
}) => {
  const source = sequenceIds(...input.generatedIds);
  const clockReads = input.clockReads ?? [];
  const repo = makeApplyFulfillmentDemandPostgresRepository(
    {
      db: database.db,
      ids: source.source,
      productionScopeReconciliationV1:
        productionScopeReconciliationTestCapability(database.db),
      observeUnitOfWork: (unitOfWork) => {
        input.observedTransactions?.push('production.apply_fulfillment_demand');
        return unitOfWork;
      },
    },
    productionTestSchema,
  );
  const cell = makeApplyFulfillmentDemandCell({
    repo: input.transformRepository?.(repo) ?? repo,
    idempotency: { resolveReplay: resolveApplyFulfillmentDemandReplay },
    policy: productionRules,
    clock: {
      now: () => {
        clockReads.push('clock');
        return now;
      },
    },
    ids: source.source,
  });
  return { cell, usedIds: source.used, clockReads };
};

const readState = async () => {
  const [demands, productionOrders, events, locations, bags] =
    await Promise.all([
      database.db
        .select()
        .from(productionTestSchema.orderDemands)
        .orderBy(asc(productionTestSchema.orderDemands.id)),
      database.db
        .select()
        .from(productionTestSchema.productionOrders)
        .orderBy(asc(productionTestSchema.productionOrders.id)),
      database.db
        .select()
        .from(productionTestSchema.workEvents)
        .orderBy(
          asc(productionTestSchema.workEvents.createdAt),
          asc(productionTestSchema.workEvents.id),
        ),
      database.db
        .select({
          id: productionTestSchema.productionLocations.id,
          liveRevision: productionTestSchema.productionLocations.liveRevision,
        })
        .from(productionTestSchema.productionLocations)
        .orderBy(asc(productionTestSchema.productionLocations.id)),
      database.db
        .select()
        .from(productionTestSchema.bags)
        .orderBy(asc(productionTestSchema.bags.id)),
    ]);
  return { demands, productionOrders, events, locations, bags };
};

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

type LockBlocker = Readonly<{ release: () => void; done: Promise<void> }>;

const holdLock = async (
  acquire: (transaction: PostgresTransaction) => Promise<unknown>,
): Promise<LockBlocker> => {
  let signalReady: () => void = () => undefined;
  let signalRelease: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    signalReady = resolve;
  });
  const released = new Promise<void>((resolve) => {
    signalRelease = resolve;
  });
  const done = database.db.transaction(async (transaction) => {
    await acquire(transaction);
    signalReady();
    await released;
  });
  await ready;
  return { release: signalRelease, done };
};

const waitForBlockedLock = async (
  lockType: 'advisory' | 'transactionid',
): Promise<boolean> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [row] = await database.db.execute<{ waiting: number }>(sql`
      select count(*)::int as waiting
      from pg_locks
      where locktype = ${lockType} and granted = false
    `);
    if ((row?.waiting ?? 0) > 0) return true;
    await delay(10);
  }
  return false;
};

const tryLocationLock = async (): Promise<boolean> =>
  database.db.transaction(async (transaction) => {
    const [row] = await transaction.execute<{ locked: boolean }>(sql`
      select pg_try_advisory_xact_lock(
        hashtext('production-scheduling'),
        hashtext(${locationId})
      ) as locked
    `);
    return row?.locked ?? false;
  });

const tryFulfillmentLock = async (): Promise<boolean> =>
  database.db.transaction(async (transaction) => {
    const [row] = await transaction.execute<{ locked: boolean }>(sql`
      select pg_try_advisory_xact_lock(
        hashtext(${`fulfillment-demand:${ids.fulfillment}`})
      ) as locked
    `);
    return row?.locked ?? false;
  });

describe('production.apply-fulfillment-demand.v1 PostgreSQL', () => {
  proveOperation({
    operationId: 'production.apply-fulfillment-demand.v1',
    declaration: applyFulfillmentDemandCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'preserves a typed not_found rollback without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seedBase();
          const before = await readState();
          const taggedNotFound = {
            tag: 'ProductionFailure',
            kind: 'not_found',
            code: 'fixture_not_found',
            message: 'The fixture target was not found.',
            safeMessage: 'The fixture target was not found.',
          } as const;
          const harness = makeCell({
            generatedIds: [ids.demand, ids.productionOrder, ids.event],
            transformRepository: (native) => ({
              transaction: (work) =>
                native.transaction(async (repository) => {
                  const outcome = await work(repository);
                  if (outcome.kind === 'success') throw taggedNotFound;
                  return outcome;
                }),
            }),
          });
          await expect(harness.cell.execute(command())).resolves.toMatchObject({
            kind: 'failure',
            failure: { kind: 'not_found', code: 'fixture_not_found' },
          });
          expect(await readState()).toEqual(before);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.apply-fulfillment-demand.v1',
    declaration: applyFulfillmentDemandCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'creates demand and intake-pending work with exact IDs, receipt, revision, replay,',
        proves: [
          'postgres-commit',
          'same-payload-replay',
          'state-message-atomicity',
        ],
        run: async () => {
          await seedBase();
          const observedTransactions: string[] = [];
          const harness = makeCell({
            generatedIds: [ids.demand, ids.productionOrder, ids.event],
            observedTransactions,
          });
          const input = command();
          const fresh = await harness.cell.execute(input);
          expect(fresh).toEqual({
            kind: 'success',
            value: {
              orderDemandId: ids.demand,
              productionOrderId: ids.productionOrder,
              outcome: 'applied',
              replayed: false,
            },
          });
          expect(harness.usedIds).toEqual([
            ids.demand,
            ids.productionOrder,
            ids.event,
          ]);
          expect(harness.clockReads).toEqual(['clock']);
          expect(observedTransactions).toEqual([
            'production.apply_fulfillment_demand',
          ]);

          const afterFresh = await readState();
          expect(afterFresh.demands).toHaveLength(1);
          expect(afterFresh.demands[0]).toMatchObject({
            id: ids.demand,
            fulfillmentId: ids.fulfillment,
            fulfillmentVersion: 1,
            projectionHash: 'a'.repeat(64),
            displayReference: 'ORDER-101',
            revisionAt: new Date(observedAt),
            phase: 'production_released',
            admissionState: 'released',
            commercialState: 'open',
            locationId,
            estimatedWeightLbs: 24,
            estimatedWeightSource: 'external_estimate',
            dueAt: new Date(dueAt),
            createdAt: now,
            updatedAt: now,
          });
          expect(afterFresh.productionOrders).toHaveLength(1);
          expect(afterFresh.productionOrders[0]).toMatchObject({
            id: ids.productionOrder,
            orderDemandId: ids.demand,
            locationId,
            dueAt: new Date(dueAt),
            priority: false,
            operationalStatus: 'intake_pending',
            executionStatus: 'unassigned',
            resolutionState: 'open',
            derivedWeightLbs: 24,
            derivedWeightSource: 'external_estimate',
            bagCount: null,
            bagCountSource: null,
            intakeRecordedAt: null,
            intakeVersion: 0,
            mustStayTogether: true,
            version: 1,
            eligibleAt: null,
            createdAt: now,
            updatedAt: now,
          });
          expect(afterFresh.bags).toEqual([]);
          expect(afterFresh.events).toHaveLength(1);
          expect(afterFresh.events[0]).toMatchObject({
            id: ids.event,
            locationId,
            eventType: 'fulfillment_demand_applied',
            entityType: 'order_demand',
            entityId: ids.demand,
            actorId: '00000000-0000-4000-8000-000000000000',
            expectedVersion: null,
            idempotencyKey: 'order-outbox:event-101',
            payload: {
              outcome: 'applied',
              _idempotency: {
                version: 1,
                command: {
                  operation: 'fulfillment_demand_applied',
                  locationId,
                  actorId: '00000000-0000-4000-8000-000000000000',
                  target: { entityType: 'order_demand', entityId: null },
                  expectedVersion: null,
                  payload: {
                    fulfillmentId: ids.fulfillment,
                    fulfillmentVersion: 1,
                    projectionHash: 'a'.repeat(64),
                    displayReference: 'ORDER-101',
                    admissionState: 'released',
                    commercialState: 'open',
                    dueAt,
                    observedAt,
                    estimatedWeightLbs: 24,
                    estimatedWeightSource: 'external_estimate',
                  },
                },
                result: {
                  orderDemandId: ids.demand,
                  productionOrderId: ids.productionOrder,
                  outcome: 'applied',
                  replayed: false,
                },
              },
            },
          });
          expect(afterFresh.locations).toEqual([
            { id: locationId, liveRevision: 1 },
          ]);

          await expect(harness.cell.execute(input)).resolves.toEqual({
            kind: 'success',
            value: {
              orderDemandId: ids.demand,
              productionOrderId: ids.productionOrder,
              outcome: 'applied',
              replayed: true,
            },
          });
          expect(harness.usedIds).toEqual([
            ids.demand,
            ids.productionOrder,
            ids.event,
          ]);
          expect(harness.clockReads).toEqual(['clock']);
          expect(await readState()).toEqual(afterFresh);

          await expect(
            harness.cell.execute({ ...input, displayReference: 'CHANGED' }),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: { code: 'production_idempotency_conflict' },
          });
          expect(await readState()).toEqual(afterFresh);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.apply-fulfillment-demand.v1',
    declaration: applyFulfillmentDemandCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rejects semantic input and missing or inactive locations before IDs, clock, locks, or writes',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seedLocation({ active: false });
          const harness = makeCell({ generatedIds: [ids.demand, ids.event] });

          await expect(
            harness.cell.execute(command({ projectionHash: 'invalid' })),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'validation',
              classification: 'semantic',
              code: 'fulfillment_demand_invalid',
            },
          });
          await expect(
            harness.cell.execute(
              command({
                locationId: 'missing-location',
                idempotencyKey: 'order-outbox:missing-location',
              }),
            ),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: { code: 'production_location_unavailable' },
          });
          await expect(
            harness.cell.execute(
              command({ idempotencyKey: 'order-outbox:inactive-location' }),
            ),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: { code: 'production_location_unavailable' },
          });
          expect(harness.usedIds).toEqual([]);
          expect(harness.clockReads).toEqual([]);
          const state = await readState();
          expect(state.demands).toEqual([]);
          expect(state.productionOrders).toEqual([]);
          expect(state.events).toEqual([]);
          expect(state.locations).toEqual([
            { id: locationId, liveRevision: 0 },
          ]);
        },
      },
    ],
  });

  it('stores unweighed demand, then materializes work with exact deferred ID order', async () => {
    await seedBase();
    const harness = makeCell({
      generatedIds: [
        ids.demand,
        ids.event,
        ids.productionOrder,
        ids.secondEvent,
      ],
    });
    await expect(
      harness.cell.execute(
        command({
          admissionState: 'unreleased',
          estimatedWeightLbs: null,
          estimatedWeightSource: null,
        }),
      ),
    ).resolves.toEqual({
      kind: 'success',
      value: {
        orderDemandId: ids.demand,
        productionOrderId: null,
        outcome: 'applied',
        replayed: false,
      },
    });
    expect((await readState()).productionOrders).toEqual([]);

    await expect(
      harness.cell.execute(
        command({
          fulfillmentVersion: 2,
          projectionHash: 'b'.repeat(64),
          observedAt: '2026-08-22T15:05:00.000Z',
          admissionState: 'unreleased',
          idempotencyKey: 'order-outbox:event-102',
        }),
      ),
    ).resolves.toEqual({
      kind: 'success',
      value: {
        orderDemandId: ids.demand,
        productionOrderId: ids.productionOrder,
        outcome: 'applied',
        replayed: false,
      },
    });
    expect(harness.usedIds).toEqual([
      ids.demand,
      ids.event,
      ids.productionOrder,
      ids.secondEvent,
    ]);
    expect(harness.clockReads).toEqual(['clock', 'clock']);
    const state = await readState();
    expect(state.demands[0]).toMatchObject({
      id: ids.demand,
      fulfillmentVersion: 2,
      projectionHash: 'b'.repeat(64),
      phase: 'expected',
      estimatedWeightLbs: 24,
    });
    expect(state.productionOrders).toEqual([
      expect.objectContaining({
        id: ids.productionOrder,
        operationalStatus: 'release_pending',
        bagCount: null,
        version: 1,
      }),
    ]);
    expect(state.events.map((event) => event.id)).toEqual([
      ids.event,
      ids.secondEvent,
    ]);
    expect(state.locations).toEqual([{ id: locationId, liveRevision: 2 }]);
  });

  proveOperation({
    operationId: 'production.apply-fulfillment-demand.v1',
    declaration: applyFulfillmentDemandCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'audits older and equal fresh keys without clock, but rejects same-version divergence without an event',
        proves: ['divergent-key-conflict'],
        run: async () => {
          await seedBase();
          const harness = makeCell({
            generatedIds: [
              ids.demand,
              ids.productionOrder,
              ids.event,
              ids.eventOlder,
              ids.eventEqual,
            ],
          });
          await harness.cell.execute(command({ fulfillmentVersion: 2 }));
          const afterApplied = await readState();

          await expect(
            harness.cell.execute(
              command({
                fulfillmentVersion: 1,
                projectionHash: 'b'.repeat(64),
                idempotencyKey: 'order-outbox:older',
              }),
            ),
          ).resolves.toMatchObject({
            kind: 'success',
            value: { outcome: 'ignored_older', replayed: false },
          });
          await expect(
            harness.cell.execute(
              command({
                fulfillmentVersion: 2,
                idempotencyKey: 'order-outbox:equal',
              }),
            ),
          ).resolves.toMatchObject({
            kind: 'success',
            value: { outcome: 'unchanged', replayed: false },
          });
          const beforeDivergence = await readState();
          await expect(
            harness.cell.execute(
              command({
                fulfillmentVersion: 2,
                projectionHash: 'c'.repeat(64),
                idempotencyKey: 'order-outbox:diverged',
              }),
            ),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: { code: 'fulfillment_demand_diverged' },
          });
          expect(await readState()).toEqual(beforeDivergence);
          expect(harness.clockReads).toEqual(['clock']);
          expect(harness.usedIds).toEqual([
            ids.demand,
            ids.productionOrder,
            ids.event,
            ids.eventOlder,
            ids.eventEqual,
          ]);
          const state = await readState();
          expect(state.demands).toEqual(afterApplied.demands);
          expect(state.productionOrders).toEqual(afterApplied.productionOrders);
          expect(state.events.map((event) => event.payload)).toEqual([
            expect.objectContaining({ outcome: 'applied' }),
            expect.objectContaining({ outcome: 'ignored_older' }),
            expect.objectContaining({ outcome: 'unchanged' }),
          ]);
          expect(state.locations).toEqual([
            { id: locationId, liveRevision: 3 },
          ]);
        },
      },
    ],
  });

  it('preserves physical intake and manual release, then lets source withdrawal clear only the override', async () => {
    await seedBase();
    const harness = makeCell({
      generatedIds: [
        ids.demand,
        ids.productionOrder,
        ids.event,
        ids.secondEvent,
        ids.eventOlder,
      ],
    });
    await harness.cell.execute(command({ admissionState: 'unreleased' }));
    await database.db
      .update(productionTestSchema.productionOrders)
      .set({
        bagCount: 2,
        bagCountSource: 'operator_intake',
        intakeRecordedAt: now,
        intakeVersion: 1,
        admissionOverride: 'released',
        admissionOverrideAt: now,
        admissionOverrideBy: uuid(94000000, 999),
        operationalStatus: 'eligible',
        eligibleAt: now,
        version: 2,
      })
      .where(eq(productionTestSchema.productionOrders.id, ids.productionOrder));
    await database.db.insert(productionTestSchema.bags).values([
      {
        id: uuid(94000000, 901),
        productionOrderId: ids.productionOrder,
        bagIndex: 0,
        status: 'eligible',
      },
      {
        id: uuid(94000000, 902),
        productionOrderId: ids.productionOrder,
        bagIndex: 1,
        status: 'eligible',
      },
    ]);

    await expect(
      harness.cell.execute(
        command({
          fulfillmentVersion: 2,
          projectionHash: 'b'.repeat(64),
          observedAt: '2026-08-22T15:05:00.000Z',
          admissionState: 'unreleased',
          idempotencyKey: 'order-outbox:lagging-unreleased',
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'success',
      value: { outcome: 'applied' },
    });
    let state = await readState();
    expect(state.productionOrders[0]).toMatchObject({
      operationalStatus: 'eligible',
      admissionOverride: 'released',
      bagCount: 2,
      intakeVersion: 1,
      version: 3,
    });
    expect(state.bags).toHaveLength(2);

    await expect(
      harness.cell.execute(
        command({
          fulfillmentVersion: 3,
          projectionHash: 'c'.repeat(64),
          observedAt: '2026-08-22T15:10:00.000Z',
          admissionState: 'withdrawn',
          commercialState: 'completed',
          idempotencyKey: 'order-outbox:withdrawn',
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'success',
      value: { outcome: 'applied' },
    });
    state = await readState();
    expect(state.demands[0]).toMatchObject({
      admissionState: 'withdrawn',
      commercialState: 'completed',
      phase: 'withdrawn',
    });
    expect(state.productionOrders[0]).toMatchObject({
      operationalStatus: 'ineligible',
      admissionOverride: null,
      admissionOverrideAt: null,
      admissionOverrideBy: null,
      bagCount: 2,
      intakeVersion: 1,
      version: 4,
    });
    expect(state.bags).toHaveLength(2);
    expect(state.locations).toEqual([{ id: locationId, liveRevision: 3 }]);
  });

  it('updates source truth without reopening or mutating resolved Production work', async () => {
    await seedBase();
    const harness = makeCell({
      generatedIds: [
        ids.demand,
        ids.productionOrder,
        ids.event,
        ids.secondEvent,
      ],
    });
    await harness.cell.execute(command({ admissionState: 'unreleased' }));
    await database.db
      .update(productionTestSchema.productionOrders)
      .set({
        resolutionState: 'resolved_without_production',
        resolvedAt: now,
        resolvedBy: uuid(94000000, 998),
        resolutionReason: 'processor_not_in_use',
        version: 2,
      })
      .where(eq(productionTestSchema.productionOrders.id, ids.productionOrder));
    const before = (await readState()).productionOrders[0];

    await expect(
      harness.cell.execute(
        command({
          fulfillmentVersion: 2,
          projectionHash: 'b'.repeat(64),
          observedAt: '2026-08-22T15:05:00.000Z',
          admissionState: 'released',
          commercialState: 'completed',
          idempotencyKey: 'order-outbox:after-resolution',
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'success',
      value: { outcome: 'applied', productionOrderId: ids.productionOrder },
    });
    const state = await readState();
    expect(state.productionOrders[0]).toEqual(before);
    expect(state.demands[0]).toMatchObject({
      fulfillmentVersion: 2,
      admissionState: 'released',
      commercialState: 'completed',
      phase: 'production_released',
    });
    expect(state.events).toHaveLength(2);
    expect(state.locations).toEqual([{ id: locationId, liveRevision: 2 }]);
  });

  it('rejects a fulfillment location change after both advisory locks without mutation', async () => {
    await seedBase();
    await seedLocation({ id: secondLocationId });
    const harness = makeCell({
      generatedIds: [ids.demand, ids.productionOrder, ids.event],
    });
    await harness.cell.execute(command());
    const before = await readState();

    await expect(
      harness.cell.execute(
        command({
          fulfillmentVersion: 2,
          projectionHash: 'b'.repeat(64),
          locationId: secondLocationId,
          idempotencyKey: 'order-outbox:location-change',
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'fulfillment_location_changed' },
    });
    expect(await readState()).toEqual(before);
    expect(harness.clockReads).toEqual(['clock']);
    expect(harness.usedIds).toEqual([
      ids.demand,
      ids.productionOrder,
      ids.event,
    ]);
  });

  proveOperation({
    operationId: 'production.apply-fulfillment-demand.v1',
    declaration: applyFulfillmentDemandCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes concurrent same-version divergence to one durable winner',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seedBase();
          const first = makeCell({
            generatedIds: [ids.demand, ids.productionOrder, ids.event],
          });
          const second = makeCell({
            generatedIds: [
              ids.secondDemand,
              ids.secondProductionOrder,
              ids.secondEvent,
            ],
          });
          const outcomes = await Promise.all([
            first.cell.execute(
              command({
                projectionHash: 'a'.repeat(64),
                idempotencyKey: 'order-outbox:race-a',
              }),
            ),
            second.cell.execute(
              command({
                projectionHash: 'b'.repeat(64),
                displayReference: 'RACE-B',
                idempotencyKey: 'order-outbox:race-b',
              }),
            ),
          ]);
          expect(
            outcomes.filter((outcome) => outcome.kind === 'success'),
          ).toHaveLength(1);
          expect(outcomes).toContainEqual(
            expect.objectContaining({
              kind: 'failure',
              failure: expect.objectContaining({
                code: 'fulfillment_demand_diverged',
              }),
            }),
          );
          expect(first.clockReads.length + second.clockReads.length).toBe(1);
          expect(first.usedIds.length + second.usedIds.length).toBe(3);
          const state = await readState();
          expect(state.demands).toHaveLength(1);
          expect(state.productionOrders).toHaveLength(1);
          expect(state.events).toHaveLength(1);
          expect(state.locations).toEqual([
            { id: locationId, liveRevision: 1 },
          ]);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.apply-fulfillment-demand.v1',
    declaration: applyFulfillmentDemandCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls the earlier demand update back on a late production-order CAS miss',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seedBase();
          const harness = makeCell({
            generatedIds: [
              ids.demand,
              ids.productionOrder,
              ids.event,
              ids.secondEvent,
            ],
          });
          await harness.cell.execute(command({ admissionState: 'unreleased' }));
          const before = await readState();
          await faultDatabase.db.execute(sql`
      create function apply_demand_skip_order_update()
      returns trigger language plpgsql as $$
      begin
        return null;
      end;
      $$
    `);
          await faultDatabase.db.execute(sql`
      create trigger apply_demand_skip_order_update
      before update on production_orders
      for each row execute function apply_demand_skip_order_update()
    `);
          try {
            await expect(
              harness.cell.execute(
                command({
                  fulfillmentVersion: 2,
                  projectionHash: 'b'.repeat(64),
                  observedAt: '2026-08-22T15:05:00.000Z',
                  idempotencyKey: 'order-outbox:late-cas',
                }),
              ),
            ).resolves.toEqual({
              kind: 'failure',
              failure: {
                kind: 'conflict',
                code: 'production_fulfillment_demand_order_version_conflict',
                message: 'Production order changed during demand application.',
                safeMessage: 'Production state changed. Refresh and try again.',
              },
            });
            expect(await readState()).toEqual(before);
            expect(harness.clockReads).toEqual(['clock', 'clock']);
            expect(harness.usedIds).toEqual([
              ids.demand,
              ids.productionOrder,
              ids.event,
            ]);
          } finally {
            await removeFaults();
          }
        },
      },
    ],
  });

  it('rolls demand and Production work back when the late event append collides', async () => {
    await seedBase();
    await database.db.insert(productionTestSchema.workEvents).values({
      id: ids.collisionEvent,
      locationId,
      eventType: 'fixture',
      entityType: 'fixture',
      entityId: ids.collisionEvent,
      actorId: '00000000-0000-4000-8000-000000000000',
      expectedVersion: null,
      idempotencyKey: 'fixture-event',
      payload: {},
    });
    const before = await readState();
    const harness = makeCell({
      generatedIds: [ids.demand, ids.productionOrder, ids.collisionEvent],
    });
    await expect(harness.cell.execute(command())).rejects.toMatchObject({
      code: 'fulfillment_demand_application_failed',
      status: 503,
    });
    expect(harness.usedIds).toEqual([
      ids.demand,
      ids.productionOrder,
      ids.collisionEvent,
    ]);
    expect(harness.clockReads).toEqual(['clock']);
    expect(await readState()).toEqual(before);
    expect(before.demands).toEqual([]);
    expect(before.productionOrders).toEqual([]);
    expect(before.events).toEqual([
      expect.objectContaining({ id: ids.collisionEvent, eventType: 'fixture' }),
    ]);
    expect(before.locations).toEqual([{ id: locationId, liveRevision: 1 }]);
  });

  it('waits on the location scheduling lock before attempting the fulfillment lock', async () => {
    await seedBase();
    const blocker = await holdLock((transaction) =>
      transaction.execute(sql`
        select pg_advisory_xact_lock(
          hashtext('production-scheduling'),
          hashtext(${locationId})
        )
      `),
    );
    const harness = makeCell({
      generatedIds: [ids.demand, ids.productionOrder, ids.event],
    });
    const outcome = harness.cell.execute(command());
    try {
      expect(await waitForBlockedLock('advisory')).toBe(true);
      expect(await tryFulfillmentLock()).toBe(true);
    } finally {
      blocker.release();
      await blocker.done;
    }
    await expect(outcome).resolves.toMatchObject({
      kind: 'success',
      value: { outcome: 'applied' },
    });
  });

  it('holds the location lock while waiting on the fulfillment lock', async () => {
    await seedBase();
    const blocker = await holdLock((transaction) =>
      transaction.execute(sql`
        select pg_advisory_xact_lock(
          hashtext(${`fulfillment-demand:${ids.fulfillment}`})
        )
      `),
    );
    const harness = makeCell({
      generatedIds: [ids.demand, ids.productionOrder, ids.event],
    });
    const outcome = harness.cell.execute(command());
    try {
      expect(await waitForBlockedLock('advisory')).toBe(true);
      expect(await tryLocationLock()).toBe(false);
    } finally {
      blocker.release();
      await blocker.done;
    }
    await expect(outcome).resolves.toMatchObject({
      kind: 'success',
      value: { outcome: 'applied' },
    });
  });

  it('holds both advisory locks before waiting on the existing Production order row', async () => {
    await seedBase();
    const initial = makeCell({
      generatedIds: [ids.demand, ids.productionOrder, ids.event],
    });
    await initial.cell.execute(command());
    const blocker = await holdLock((transaction) =>
      transaction
        .select({ id: productionTestSchema.productionOrders.id })
        .from(productionTestSchema.productionOrders)
        .where(
          eq(productionTestSchema.productionOrders.id, ids.productionOrder),
        )
        .for('update'),
    );
    const next = makeCell({ generatedIds: [ids.secondEvent] });
    const outcome = next.cell.execute(
      command({
        fulfillmentVersion: 2,
        projectionHash: 'b'.repeat(64),
        observedAt: '2026-08-22T15:05:00.000Z',
        idempotencyKey: 'order-outbox:row-lock',
      }),
    );
    try {
      expect(await waitForBlockedLock('transactionid')).toBe(true);
      expect(await tryLocationLock()).toBe(false);
      expect(await tryFulfillmentLock()).toBe(false);
    } finally {
      blocker.release();
      await blocker.done;
    }
    await expect(outcome).resolves.toMatchObject({
      kind: 'success',
      value: { outcome: 'applied' },
    });
  });

  proveOperation({
    operationId: 'production.apply-fulfillment-demand.v1',
    declaration: applyFulfillmentDemandCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'collapses concurrent identical fulfillment delivery to one durable projection',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seedBase();
          const first = makeCell({
            generatedIds: [ids.demand, ids.productionOrder, ids.event],
          });
          const second = makeCell({
            generatedIds: [
              ids.secondDemand,
              ids.secondProductionOrder,
              ids.secondEvent,
            ],
          });
          const input = command({
            idempotencyKey: 'order-outbox:same-key-race',
          });

          const outcomes = await Promise.all([
            first.cell.execute(input),
            second.cell.execute(input),
          ]);

          expect(outcomes.every(({ kind }) => kind === 'success')).toBe(true);
          expect(
            outcomes
              .flatMap((outcome) =>
                outcome.kind === 'success' ? [outcome.value.replayed] : [],
              )
              .sort(),
          ).toEqual([false, true]);
          const state = await readState();
          expect(state.demands).toHaveLength(1);
          expect(state.productionOrders).toHaveLength(1);
          expect(state.events).toHaveLength(1);
        },
      },
    ],
  });
});
