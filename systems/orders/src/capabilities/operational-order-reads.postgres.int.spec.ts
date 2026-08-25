import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresRuntime } from '@pressly/postgres/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ordersTestSchema as orders } from '../testing/schema.ts';
import { makeListRecentOrderAuditV1Capability } from './list-recent-order-audit-v1.postgres.ts';
import { makeResolveCanonicalOrdersByFulfillmentV1Capability } from './resolve-canonical-orders-by-fulfillment-v1.postgres.ts';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const adminDatabaseUrl =
  process.env['PRESSLY_ORDERS_CAPABILITIES_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';
const databaseName =
  process.env['PRESSLY_ORDERS_CAPABILITIES_DATABASE_NAME'] ??
  `pressly_orders_capabilities_${process.pid}_${Date.now().toString(36)}`;
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

const database = createPostgresRuntime({
  databaseUrl,
  schema: orders,
  maxConnections: 4,
});
const now = new Date('2026-08-22T20:00:00.000Z');
const businessId = '97000000-0000-4000-8000-000000000001';
const locationId = 'orders-capability-location';
const customerId = '97000000-0000-4000-8000-000000000002';
const orderId = '97000000-0000-4000-8000-000000000003';
const fulfillmentId = '97000000-0000-4000-8000-000000000004';

const seed = async (): Promise<void> => {
  await database.db.insert(orders.orders).values({
    id: orderId,
    businessId,
    customerId,
    customerVersion: 1,
    customerFirstName: 'Ada',
    customerLastName: 'Lovelace',
    customerBusinessName: 'Analytical Laundry',
    customerPhone: '+12125550100',
    customerEmail: 'ada@example.test',
    customerResolution: 'resolved',
    displayNumber: 'ORD-970',
    state: 'open',
    dueAt: new Date('2026-08-23T20:00:00.000Z'),
    currency: 'USD',
    totalAmountCents: 4_200,
    balanceDueCents: 2_100,
    version: 3,
    createdAt: now,
    updatedAt: now,
  });
  await database.db.insert(orders.orderFulfillments).values({
    id: fulfillmentId,
    businessId,
    orderId,
    typeCode: 'wash_fold',
    locationId,
    releaseState: 'released',
    estimatedWeightLbs: 21,
    estimatedWeightSource: 'source_estimate',
    version: 2,
    createdAt: now,
    updatedAt: now,
  });

  for (let index = 0; index < 9; index += 1) {
    const sourceLinkId = `97000000-0000-4000-8000-${(100 + index)
      .toString()
      .padStart(12, '0')}`;
    const observedAt = new Date(now.getTime() + index * 1_000);
    await database.db.insert(orders.orderSourceLinks).values({
      id: sourceLinkId,
      source: `source-${index}`,
      externalOrderId: `external-${index}`,
      orderId,
      createdAt: observedAt,
      updatedAt: observedAt,
    });
    await database.db.insert(orders.orderSourceSnapshots).values({
      sourceLinkId,
      sourceRevisionAt: observedAt,
      sourceRevisionHash: index.toString(16).padStart(64, '0'),
      adapterVersion: 'orders-capability-v1',
      normalizedPayload: { index },
      observedAt,
      createdAt: observedAt,
      updatedAt: observedAt,
    });
    await database.db.insert(orders.orderCommandReceipts).values({
      idempotencyKey: `orders-capability-command-${index}`,
      commandHash: (index + 10).toString(16).padStart(64, '0'),
      origin: 'pressly_control',
      actorKind: 'human',
      actorId: 'identity-1',
      orderId,
      result: { index },
      reasonCode: index === 0 ? null : `command-${index}`,
      reasonNote: index === 0 ? null : `Command ${index}`,
      createdAt: observedAt,
    });
  }
};

beforeAll(async () => {
  dropDatabase();
  createDatabase();
  await database.check();
  await seed();
});

afterAll(async () => {
  await database.close();
  dropDatabase();
  expect(databaseExists()).toBe(false);
});

describe('Orders collaboration capabilities on PostgreSQL', () => {
  it('resolves canonical Order and Customer facts and completes missing references', async () => {
    const capability = makeResolveCanonicalOrdersByFulfillmentV1Capability({
      db: database.db,
      schema: orders,
    });
    const missingFulfillmentId = '97000000-0000-4000-8000-000000000404';

    await expect(
      capability.execute([
        { referenceId: 'known', fulfillmentId },
        { referenceId: 'missing', fulfillmentId: missingFulfillmentId },
      ]),
    ).resolves.toEqual(
      new Map([
        [
          'known',
          {
            canonicalOrderId: orderId,
            canonicalFulfillmentId: fulfillmentId,
            displayNumber: 'ORD-970',
            customer: {
              resolution: 'resolved',
              userId: customerId,
              firstName: 'Ada',
              lastName: 'Lovelace',
              businessName: 'Analytical Laundry',
              phone: '+12125550100',
            },
            commercialState: 'open',
            admissionState: 'released',
            versions: { order: 3, fulfillment: 2 },
          },
        ],
        ['missing', null],
      ]),
    );
  });

  it('returns the newest eight source observations and commands per Order', async () => {
    const capability = makeListRecentOrderAuditV1Capability(
      database.db,
      orders,
    );
    const result = await capability.execute({ canonicalOrderIds: [orderId] });

    expect(result.sources).toHaveLength(8);
    expect(result.sources[0]).toMatchObject({
      canonicalOrderId: orderId,
      name: 'source-8',
    });
    expect(result.sources.at(-1)).toMatchObject({ name: 'source-1' });
    expect(result.commands).toHaveLength(8);
    expect(result.commands[0]).toMatchObject({
      canonicalOrderId: orderId,
      code: 'command-8',
      actorId: 'identity-1',
    });
    expect(result.commands.at(-1)).toMatchObject({ code: 'command-1' });
  });
});
