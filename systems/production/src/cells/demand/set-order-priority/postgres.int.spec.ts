import { proveOperation } from '@pressly/testkit/operation-proof';
import { setOrderPriorityCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { eq } from '@pressly/postgres/query';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeExecuteSetOrderPriority } from './execute.ts';
import { setOrderPriorityIdempotency } from './idempotency.ts';
import { makeSetOrderPriorityPostgresRepository } from './postgres.ts';

const productionTables = [
  'work_events',
  'production_order_stage_attempts',
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
  'order_source_snapshots',
  'order_source_customer_refs',
  'order_source_links',
  'order_items',
  'webhook_events',
  'source_location_bindings',
  'production_locations',
] as const;

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: productionTables,
  maxConnections: 4,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : {
        resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
      }),
});

beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  sourceOrder: '10000000-0000-4000-8000-000000000002',
  fulfillment: '10000000-0000-4000-8000-000000000003',
  demand: '10000000-0000-4000-8000-000000000004',
  productionOrder: '10000000-0000-4000-8000-000000000005',
  workEvent: '10000000-0000-4000-8000-000000000006',
} as const;

const locationId = 'location-1';
const businessId = '00000000-0000-4000-8000-000000000100';
const now = new Date('2026-08-21T15:00:00.000Z');

const seedOrder = async (): Promise<void> => {
  const dueAt = new Date('2026-08-21T20:00:00.000Z');
  const createdAt = new Date('2026-08-21T07:00:00.000Z');
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId,
    name: 'Priority Test Facility',
    timezone: 'America/New_York',
  });
  await database.db.insert(productionTestSchema.orderDemands).values({
    id: ids.demand,
    fulfillmentId: ids.fulfillment,
    fulfillmentVersion: 1,
    projectionHash: 'a'.repeat(64),
    admissionState: 'released',
    commercialState: 'open',
    displayReference: 'ORDER-PRIORITY-1',
    locationId,
    revisionAt: createdAt,
    phase: 'production_released',
    estimatedWeightLbs: 25,
    estimatedWeightSource: 'test_estimate',
    dueAt,
  });
  await database.db.insert(productionTestSchema.productionOrders).values({
    id: ids.productionOrder,
    orderDemandId: ids.demand,
    locationId,
    dueAt,
    priority: false,
    operationalStatus: 'eligible',
    executionStatus: 'unassigned',
    resolutionState: 'open',
    derivedWeightLbs: 25,
    derivedWeightSource: 'test_estimate',
    version: 2,
  });
};

const makeIds = (first: string = ids.workEvent): IdSource => {
  let next = 1;
  return {
    next: () =>
      next++ === 1
        ? first
        : `20000000-0000-4000-8000-${String(next).padStart(12, '0')}`,
  };
};

const command = (idempotencyKey = 'priority-command-1') => ({
  locationId,
  productionOrderId: ids.productionOrder,
  actorId: ids.actor,
  priority: true,
  expectedVersion: 2,
  idempotencyKey,
});

const makeExecute = (idSource: IdSource = makeIds()) =>
  makeExecuteSetOrderPriority({
    repo: makeSetOrderPriorityPostgresRepository(
      {
        db: database.db,
        ids: idSource,
      },
      productionTestSchema,
    ),
    idempotency: setOrderPriorityIdempotency,
    policy: productionRules,
    clock: { now: () => now },
  });

describe('set order priority native Postgres cell', () => {
  proveOperation({
    operationId: 'production.set-order-priority.v1',
    declaration: setOrderPriorityCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'commits once, advances the live revision, and replays the receipt',
        proves: ['postgres-commit', 'same-payload-replay'],
        run: async () => {
          await seedOrder();
          const execute = makeExecute();

          await expect(execute(command())).resolves.toEqual({
            kind: 'success',
            value: {
              entityId: ids.productionOrder,
              version: 3,
              replayed: false,
            },
          });
          await expect(execute(command())).resolves.toEqual({
            kind: 'success',
            value: {
              entityId: ids.productionOrder,
              version: 3,
              replayed: true,
            },
          });

          const [order] = await database.db
            .select({
              priority: productionTestSchema.productionOrders.priority,
              version: productionTestSchema.productionOrders.version,
            })
            .from(productionTestSchema.productionOrders)
            .where(
              eq(productionTestSchema.productionOrders.id, ids.productionOrder),
            );
          const events = await database.db
            .select()
            .from(productionTestSchema.workEvents)
            .where(
              eq(
                productionTestSchema.workEvents.idempotencyKey,
                'priority-command-1',
              ),
            );
          const [location] = await database.db
            .select({
              liveRevision:
                productionTestSchema.productionLocations.liveRevision,
            })
            .from(productionTestSchema.productionLocations)
            .where(eq(productionTestSchema.productionLocations.id, locationId));

          expect(order).toEqual({ priority: true, version: 3 });
          expect(events).toHaveLength(1);
          expect(events[0]).toMatchObject({
            eventType: 'production_order_priority_changed',
            entityId: ids.productionOrder,
            expectedVersion: 2,
          });
          expect(location?.liveRevision).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.set-order-priority.v1',
    declaration: setOrderPriorityCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes same-version writes so exactly one command commits',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seedOrder();
          const execute = makeExecute(makeIds());

          const outcomes = await Promise.all([
            execute(command('priority-race-command-1')),
            execute(command('priority-race-command-2')),
          ]);

          expect(
            outcomes.filter((outcome) => outcome.kind === 'success'),
          ).toHaveLength(1);
          expect(outcomes).toContainEqual(
            expect.objectContaining({
              kind: 'failure',
              failure: expect.objectContaining({
                code: 'production_order_version_conflict',
              }),
            }),
          );
          const events = await database.db
            .select()
            .from(productionTestSchema.workEvents);
          expect(events).toHaveLength(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.set-order-priority.v1',
    declaration: setOrderPriorityCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back the order update when the work-event append fails',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seedOrder();
          await database.db.insert(productionTestSchema.workEvents).values({
            id: ids.workEvent,
            locationId,
            eventType: 'fixture',
            entityType: 'production_order',
            entityId: ids.productionOrder,
            actorId: ids.actor,
            expectedVersion: 1,
            idempotencyKey: 'fixture-event-1',
            payload: {},
          });
          const execute = makeExecute(makeIds(ids.workEvent));

          await expect(execute(command())).rejects.toMatchObject({
            code: 'production_priority_failed',
            status: 503,
          });
          const [order] = await database.db
            .select({
              priority: productionTestSchema.productionOrders.priority,
              version: productionTestSchema.productionOrders.version,
            })
            .from(productionTestSchema.productionOrders)
            .where(
              eq(productionTestSchema.productionOrders.id, ids.productionOrder),
            );
          expect(order).toEqual({ priority: false, version: 2 });
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.set-order-priority.v1',
    declaration: setOrderPriorityCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rejects divergent priority reuse without another order mutation',
        proves: [
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seedOrder();
          const execute = makeExecute();
          await expect(execute(command())).resolves.toMatchObject({
            kind: 'success',
          });
          const [before] = await database.db
            .select()
            .from(productionTestSchema.productionOrders)
            .where(
              eq(productionTestSchema.productionOrders.id, ids.productionOrder),
            );

          await expect(
            execute({ ...command(), priority: false }),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_idempotency_conflict',
            },
          });
          const [after] = await database.db
            .select()
            .from(productionTestSchema.productionOrders)
            .where(
              eq(productionTestSchema.productionOrders.id, ids.productionOrder),
            );
          expect(after).toEqual(before);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
        },
      },
      {
        name: 'collapses concurrent identical priority commands after the location lock',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seedOrder();
          const input = command('priority-same-key-race');
          const outcomes = await Promise.all([
            makeExecute(makeIds('79000000-0000-4000-8000-000000000001'))(input),
            makeExecute(makeIds('7a000000-0000-4000-8000-000000000001'))(input),
          ]);

          expect(outcomes.every(({ kind }) => kind === 'success')).toBe(true);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
          const [order] = await database.db
            .select({
              priority: productionTestSchema.productionOrders.priority,
              version: productionTestSchema.productionOrders.version,
            })
            .from(productionTestSchema.productionOrders)
            .where(
              eq(productionTestSchema.productionOrders.id, ids.productionOrder),
            );
          expect(order).toEqual({ priority: true, version: 3 });
        },
      },
    ],
  });
});
