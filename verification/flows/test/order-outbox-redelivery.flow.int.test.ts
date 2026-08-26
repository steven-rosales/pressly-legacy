import {
  makeProductionActorReadV1Capability,
  makeProductionScopeReconciliationV1Capability,
} from '@pressly/access-system/assembly/production-capabilities';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeUnknownError } from '@pressly/errors/app-error';
import { makeJobCatalogFromOwners } from '@pressly/topology/jobs';
import { makeIngressSystem } from '@pressly/ingress-system/testing/assembly';
import { makeDurableQueueJob } from '@pressly/jobs';
import { registrationsFromJobCatalog } from '@pressly/jobs-host';
import { nullLogger } from '@pressly/logging';
import {
  nullCounterSink,
  nullErrorReporter,
  nullMeasurementSink,
} from '@pressly/observability';
import { makeOrdersIntegrationSystem } from '@pressly/orders-system/testing/assembly';
import { makeOrderOutboxDurableQueue } from '@pressly/orders-system/capabilities/order-outbox-job';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import { toOrderOutboxDurableJobDelivery } from '@pressly/production-system/capabilities/apply-fulfillment-demand-job';
import { createTestDatabaseRuntime } from '@pressly/testkit/database';
import { makeSequenceIdSource } from '@pressly/testkit/id-source';
import { asc } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedProductionLocationFixture } from './production-location-fixture.postgres.ts';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const adminDatabaseUrl =
  process.env['PRESSLY_ORDER_OUTBOX_FLOW_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';
const databaseName = `pressly_order_outbox_flow_test_${process.pid}_${Date.now().toString(36)}`;
const databaseUrl = (() => {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${databaseName}`;
  url.search = '';
  return url.toString();
})();

const run = (executable: string, args: readonly string[], env = process.env) =>
  execFileSync(executable, [...args], {
    cwd: repositoryRoot,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180_000,
  });

const dropDatabase = (): void => {
  run('dropdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--if-exists',
    '--force',
    databaseName,
  ]);
};

const createDatabase = (): void => {
  run('createdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--template',
    'template0',
    databaseName,
  ]);
  run('pnpm', ['db:migrate'], {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NODE_ENV: 'test',
  });
};

const databaseExists = (): boolean =>
  run('psql', [
    adminDatabaseUrl,
    '-Atqc',
    `select datname from pg_database where datname = '${databaseName}'`,
  ]).trim() === databaseName;

const database = createTestDatabaseRuntime({
  databaseUrl,
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
    'order_outbox_events',
    'order_fulfillments',
    'orders',
    'production_shifts',
    'production_locations',
    'business_accounts',
  ],
  maxConnections: 12,
});

const ids = {
  business: '73000000-0000-4000-8000-000000000001',
  order: '73000000-0000-4000-8000-000000000002',
  fulfillment: '73000000-0000-4000-8000-000000000003',
  outbox: '73000000-0000-4000-8000-000000000004',
  demand: '73000000-0000-4000-8000-000000000005',
  productionOrder: '73000000-0000-4000-8000-000000000006',
  workEvent: '73000000-0000-4000-8000-000000000007',
} as const;
const locationId = 'order-outbox-redelivery-location';
const initialNow = new Date('2026-08-22T16:00:00.000Z');
let currentNow = initialNow;
const clock = { now: () => currentNow };

const seedAccessScope = async (): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.access.businessAccounts)
    .values({
      id: ids.business,
      slug: 'order-outbox-redelivery',
      displayName: 'Order outbox redelivery',
      createdAt: initialNow,
      updatedAt: initialNow,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.access.accessProductionLocations)
    .values({
      id: locationId,
      businessId: ids.business,
      name: 'Order outbox redelivery',
      timezone: 'America/New_York',
      createdAt: initialNow,
      updatedAt: initialNow,
    });
};

const seedProductionLocation = async (): Promise<void> => {
  await seedProductionLocationFixture(database.db, {
    id: locationId,
    businessId: ids.business,
    name: 'Order outbox redelivery',
    timezone: 'America/New_York',
    createdAt: initialNow,
    updatedAt: initialNow,
  });
};

const seedOrdersOutbox = async (): Promise<void> => {
  await database.db.insert(presslyPostgresOwnerSchemas.orders.orders).values({
    id: ids.order,
    businessId: ids.business,
    customerResolution: 'not_provided',
    displayNumber: 'P-730',
    state: 'open',
    dueAt: new Date('2026-08-23T20:00:00.000Z'),
    createdAt: initialNow,
    updatedAt: initialNow,
  });
  await database.db
    .insert(presslyPostgresOwnerSchemas.orders.orderFulfillments)
    .values({
      id: ids.fulfillment,
      businessId: ids.business,
      orderId: ids.order,
      typeCode: 'wash_fold',
      locationId,
      releaseState: 'released',
      estimatedWeightLbs: 18,
      estimatedWeightSource: 'source_estimate',
      version: 1,
      createdAt: initialNow,
      updatedAt: initialNow,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.orders.orderOutboxEvents)
    .values({
      id: ids.outbox,
      orderId: ids.order,
      fulfillmentId: ids.fulfillment,
      eventType: 'fulfillment_demand_changed',
      aggregateVersion: 1,
      payload: {
        schemaVersion: 2,
        eventType: 'fulfillment_demand_changed',
        fulfillmentId: ids.fulfillment,
        displayNumber: 'P-730',
        locationId,
        typeCode: 'wash_fold',
        admissionState: 'released',
        commercialState: 'open',
        dueAt: '2026-08-23T20:00:00.000Z',
        estimatedWeightLbs: 18,
        estimatedWeightSource: 'source_estimate',
        version: 1,
        observedAt: '2026-08-22T15:00:00.000Z',
      },
      status: 'pending',
      attempts: 0,
      availableAt: initialNow,
      createdAt: initialNow,
    });
};

beforeAll(async () => {
  dropDatabase();
  createDatabase();
  await database.check();
}, 180_000);
beforeEach(async () => {
  currentNow = initialNow;
  await database.reset();
  await seedAccessScope();
  await seedProductionLocation();
  await seedOrdersOutbox();
});
afterAll(async () => {
  await database.close();
  dropDatabase();
  expect(databaseExists()).toBe(false);
}, 60_000);

describe('order_outbox crash redelivery flow', () => {
  it('replays one committed Production effect after crashing before acknowledgement', async () => {
    const ordersSystem = makeOrdersIntegrationSystem({
      schema: presslyPostgresOwnerSchemas.orders,
      db: database.db,
      clock,
    });
    const productionSystem = makeProductionSystem({
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
      db: database.db,
      clock,
      ids: makeSequenceIdSource([
        ids.demand,
        ids.productionOrder,
        ids.workEvent,
      ]),
    });
    const ingressSystem = makeIngressSystem({
      schema: presslyPostgresOwnerSchemas.ingress,
      db: database.db,
      clock,
      ids: makeSequenceIdSource(['73000000-0000-4000-8000-000000000099']),
      processInboundEvent: {
        proposeIncomingOrder: (command) =>
          ordersSystem.cells.proposeIncomingOrder.execute(command),
        closeIncomingOrderSource: (command) =>
          ordersSystem.cells.closeIncomingOrderSource.execute(command),
        resolveSourceClosedFulfillment: (command) =>
          productionSystem.cells.resolveSourceClosedFulfillment.execute(
            command,
          ),
      },
    });
    const catalog = makeJobCatalogFromOwners({
      'system:ingress': ingressSystem,
      'system:production': productionSystem,
    });
    const registration = registrationsFromJobCatalog(catalog).find(
      (candidate) => candidate.queue === 'order_outbox',
    );
    expect(registration).toBeDefined();
    if (registration === undefined) return;

    const firstQueue = makeOrderOutboxDurableQueue({
      cells: ordersSystem.cells,
      workerId: 'worker-before-crash',
      leaseMs: 30_000,
      batchSize: 10,
      backlogMeasurementIntervalMs: 60_000,
      nowNanoseconds: () => 0n,
      logger: nullLogger,
      counters: nullCounterSink,
      measurements: nullMeasurementSink,
      errors: nullErrorReporter,
      toDelivery: toOrderOutboxDurableJobDelivery,
    });
    const crashBeforeAcknowledge = makeDurableQueueJob({
      job: registration,
      queue: {
        ...firstQueue,
        complete: async () => {
          throw { fault: 'crash after Production commit before ack' };
        },
      },
      classifyUnexpected: (failure) => {
        const error = normalizeUnknownError(failure);
        return {
          code: error.code,
          message: error.safeMessage,
          retryable: true,
        };
      },
      retryBaseMs: 1_000,
      retryMaxMs: 300_000,
      now: clock.now,
      nowNanoseconds: () => 1n,
      random: () => 0.5,
    });

    await expect(
      crashBeforeAcknowledge.runOnce(new AbortController().signal),
    ).rejects.toEqual({
      fault: 'crash after Production commit before ack',
    });

    await expect(
      database.db
        .select()
        .from(presslyPostgresOwnerSchemas.production.orderDemands),
    ).resolves.toHaveLength(1);
    await expect(
      database.db
        .select()
        .from(presslyPostgresOwnerSchemas.production.productionOrders),
    ).resolves.toHaveLength(1);
    await expect(
      database.db
        .select()
        .from(presslyPostgresOwnerSchemas.production.workEvents),
    ).resolves.toHaveLength(1);
    await expect(
      database.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orderOutboxEvents),
    ).resolves.toMatchObject([
      {
        id: ids.outbox,
        status: 'processing',
        attempts: 1,
        leaseOwner: 'worker-before-crash',
      },
    ]);

    currentNow = new Date(initialNow.getTime() + 30_001);
    const redeliveryQueue = makeOrderOutboxDurableQueue({
      cells: ordersSystem.cells,
      workerId: 'worker-after-crash',
      leaseMs: 30_000,
      batchSize: 10,
      backlogMeasurementIntervalMs: 60_000,
      nowNanoseconds: () => 61_000_000_000n,
      logger: nullLogger,
      counters: nullCounterSink,
      measurements: nullMeasurementSink,
      errors: nullErrorReporter,
      toDelivery: toOrderOutboxDurableJobDelivery,
    });
    const redelivery = makeDurableQueueJob({
      job: registration,
      queue: redeliveryQueue,
      classifyUnexpected: (failure) => {
        const error = normalizeUnknownError(failure);
        return {
          code: error.code,
          message: error.safeMessage,
          retryable: true,
        };
      },
      retryBaseMs: 1_000,
      retryMaxMs: 300_000,
      now: clock.now,
      nowNanoseconds: () => 62_000_000_000n,
      random: () => 0.5,
    });

    await expect(
      redelivery.runOnce(new AbortController().signal),
    ).resolves.toBe(1);

    await expect(
      database.db
        .select()
        .from(presslyPostgresOwnerSchemas.production.orderDemands),
    ).resolves.toHaveLength(1);
    await expect(
      database.db
        .select()
        .from(presslyPostgresOwnerSchemas.production.productionOrders),
    ).resolves.toHaveLength(1);
    const workEvents = await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.workEvents)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.workEvents.id));
    expect(workEvents).toHaveLength(1);
    expect(workEvents[0]).toMatchObject({
      id: ids.workEvent,
      idempotencyKey: `order-outbox:${ids.outbox}`,
      eventType: 'fulfillment_demand_applied',
    });
    await expect(
      database.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orderOutboxEvents),
    ).resolves.toMatchObject([
      {
        id: ids.outbox,
        status: 'completed',
        attempts: 2,
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: currentNow,
      },
    ]);
  });
});
