import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeAccessSystem } from '@pressly/access-system/testing/assembly';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import { makeCustomersSystem } from '@pressly/customers-system/testing/assembly';
import { makeOrdersSystem } from '@pressly/orders-system/testing/assembly';
import type { CreateOrderCommand } from '@pressly/orders-system/operations/lifecycle/create-order/types';
import {
  createTestDatabaseRuntime,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  normalizeOrdersOutcome,
  normalizeOrdersValue,
  ordersOutcomeValue,
} from '../src/public.ts';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const adminDatabaseUrl =
  process.env['PRESSLY_ORDERS_CONFORMANCE_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';
const suffix = `${process.pid}_${Date.now().toString(36)}`;
const targetDatabaseName =
  process.env['PRESSLY_ORDERS_CONFORMANCE_TARGET_DATABASE_NAME'] ??
  `pressly_orders_target_test_${suffix}`;
const run = (executable: string, args: readonly string[], env = process.env) =>
  execFileSync(executable, [...args], {
    cwd: repositoryRoot,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180_000,
  });
const databaseUrl = (name: string): string => {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${name}`;
  url.search = '';
  return url.toString();
};
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
  dropDatabase(name);
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
  'order_source_proposal_transitions',
  'order_source_proposal_resolutions',
  'order_source_terminal_tombstones',
  'order_source_customer_refs',
  'order_source_snapshots',
  'order_source_links',
  'order_source_proposals',
  'order_outbox_events',
  'order_items',
  'order_fulfillments',
  'order_command_receipts',
  'orders',
  'user_command_receipts',
  'user_duplicate_candidates',
  'user_field_authorities',
  'user_source_snapshots',
  'user_source_links',
  'users',
  'access_production_locations',
  'business_accounts',
] as const;
type ConformanceDatabase = TestDatabaseRuntime & Readonly<{ name: string }>;
const makeDatabase = (name: string): ConformanceDatabase =>
  Object.freeze({
    name,
    ...createTestDatabaseRuntime({
      databaseUrl: databaseUrl(name),
      tableNames,
      maxConnections: 12,
    }),
  });
const targetDatabase = makeDatabase(targetDatabaseName);

const now = new Date('2026-08-22T19:00:00.000Z');
const businessId = '75000000-0000-4000-8000-000000000001';
const locationId = 'orders-conformance-location';
const context = {
  origin: 'pressly_dashboard',
  principal: { kind: 'human' as const, id: 'identity-orders-conformance' },
};

type Runner = Readonly<{
  create: (command: Record<string, unknown>) => Promise<unknown>;
  correct: (command: Record<string, unknown>) => Promise<unknown>;
  complete: (command: Record<string, unknown>) => Promise<unknown>;
  cancel: (command: Record<string, unknown>) => Promise<unknown>;
  release: (command: Record<string, unknown>) => Promise<unknown>;
  withdraw: (command: Record<string, unknown>) => Promise<unknown>;
  get: (query: Record<string, unknown>) => Promise<unknown>;
  list: (query: Record<string, unknown>) => Promise<unknown>;
  listIncoming: (query: Record<string, unknown>) => Promise<unknown>;
  accept: (command: Record<string, unknown>) => Promise<unknown>;
  reject: (command: Record<string, unknown>) => Promise<unknown>;
  restore: (command: Record<string, unknown>) => Promise<unknown>;
}>;

const targetRunner = (database: ConformanceDatabase): Runner => {
  const accessOwner = makeAccessSystem({
    db: database.db,
    schema: presslyPostgresOwnerSchemas.access,
    clock: { now: () => now },
    tokenSecret: 'orders-conformance-access-token-secret',
    sessionTtlMinutes: 30,
    sessionIdleTimeoutMinutes: 30,
    loginWindowMinutes: 15,
    loginMaxFailures: 5,
    mfaChallengeTtlMinutes: 5,
    mfaChallengeMaxAttempts: 8,
    mfaEncryptionKey: Buffer.alloc(32, 3).toString('base64'),
    mfaIssuer: 'Pressly Orders Conformance',
    policies: {
      pricing: { freshSessionMaxAgeMinutes: 15 },
      authSessions: { freshSessionMaxAgeMinutes: 15 },
      mfa: { freshSessionMaxAgeMinutes: 15 },
    },
  });
  const customersOwner = makeCustomersSystem({
    schema: presslyPostgresOwnerSchemas.customers,
    db: database.db,
    clock: { now: () => now },
  });
  const cells = makeOrdersSystem({
    schema: presslyPostgresOwnerSchemas.orders,
    db: database.db,
    clock: { now: () => now },
    orderLocationFactsV1: accessOwner.capabilities.orderLocationFactsV1,
    ...customersOwner.capabilities,
  }).cells;
  return {
    create: (command) => cells.createOrder.execute(command as never),
    correct: (command) => cells.correctOrder.execute(command as never),
    complete: (command) => cells.completeOrder.execute(command as never),
    cancel: (command) => cells.cancelOrder.execute(command as never),
    release: (command) => cells.releaseFulfillment.execute(command as never),
    withdraw: (command) => cells.withdrawFulfillment.execute(command as never),
    get: (query) => cells.getCanonicalOrder.execute(query as never),
    list: (query) => cells.listCanonicalOrders.execute(query as never),
    listIncoming: (query) =>
      cells.listIncomingOrderProposals.execute(query as never),
    accept: (command) =>
      cells.acceptIncomingOrderProposal.execute(command as never),
    reject: (command) =>
      cells.rejectIncomingOrderProposal.execute(command as never),
    restore: (command) =>
      cells.restoreIncomingOrderProposal.execute(command as never),
  };
};

const seedOwner = async (db: PostgresDatabase): Promise<void> => {
  await db.insert(presslyPostgresOwnerSchemas.access.businessAccounts).values({
    id: businessId,
    slug: 'orders-conformance',
    displayName: 'Orders Conformance',
    createdAt: now,
    updatedAt: now,
  });
  await db
    .insert(presslyPostgresOwnerSchemas.access.accessProductionLocations)
    .values({
      id: locationId,
      businessId,
      name: 'Orders Conformance',
      timezone: 'America/New_York',
      createdAt: now,
      updatedAt: now,
    });
};

const proposalIds = {
  reject: '75000000-0000-4000-8000-000000000101',
  accept: '75000000-0000-4000-8000-000000000102',
  restore: '75000000-0000-4000-8000-000000000103',
  race: '75000000-0000-4000-8000-000000000104',
} as const;
const proposalSnapshot = (externalOrderId: string) => ({
  order: {
    customer: {
      externalUserId: `customer-${externalOrderId}`,
      firstName: 'Ada',
      lastName: 'Lovelace',
      businessName: null,
      phone: '+12125550100',
      email: `${externalOrderId}@example.test`,
      normalizedPayload: { id: `customer-${externalOrderId}` },
    },
    displayNumber: `P-${externalOrderId}`,
    dueAt: '2026-08-25T20:00:00.000Z',
    currency: 'USD',
    totalAmountCents: 4_000,
    balanceDueCents: 4_000,
    items: [
      {
        lineKey: 'laundry',
        itemType: 'service',
        code: 'wash_fold',
        description: 'Wash and fold',
        quantity: 20,
        unit: 'lb',
        unitPriceCents: 200,
        totalAmountCents: 4_000,
        sourceMetadata: { source: 'cents' },
      },
    ],
    fulfillment: {
      typeCode: 'wash_fold',
      locationId,
      estimatedWeightLbs: 20,
      estimatedWeightSource: 'source_estimate',
    },
  },
  source: { order: { id: externalOrderId } },
});
const seedProposals = async (db: PostgresDatabase, includeRace = false) => {
  const values = [
    { id: proposalIds.reject, externalOrderId: 'reject', observedOffset: 1 },
    { id: proposalIds.accept, externalOrderId: 'accept', observedOffset: 2 },
    {
      id: proposalIds.restore,
      externalOrderId: 'restore',
      observedOffset: 3,
      state: 'source_closed',
      version: 2,
    },
    ...(includeRace
      ? [
          {
            id: proposalIds.race,
            externalOrderId: 'race',
            observedOffset: 4,
          },
        ]
      : []),
  ];
  await db
    .insert(presslyPostgresOwnerSchemas.orders.orderSourceProposals)
    .values(
      values.map((value) => ({
        id: value.id,
        source: 'cents',
        externalOrderId: value.externalOrderId,
        locationId,
        proposalKind: 'submitted_order',
        sourceRevisionAt: new Date('2026-08-22T18:00:00.000Z'),
        sourceRevisionHash: 'a'.repeat(64),
        adapterVersion: 'external-orders-v1',
        proposalSnapshot: proposalSnapshot(value.externalOrderId),
        customerDisplayName: 'Ada Lovelace',
        customerPhone: '+12125550100',
        customerEmail: `${value.externalOrderId}@example.test`,
        displayNumber: `P-${value.externalOrderId}`,
        dueAt: new Date('2026-08-25T20:00:00.000Z'),
        estimatedWeightLbs: 20,
        observedAt: new Date(`2026-08-22T18:0${value.observedOffset}:00.000Z`),
        state: value.state ?? 'pending',
        version: value.version ?? 1,
        createdAt: now,
      })),
    );
  await db
    .insert(presslyPostgresOwnerSchemas.orders.orderSourceTerminalTombstones)
    .values({
      source: 'cents',
      externalOrderId: 'restore',
      proposalId: proposalIds.restore,
      terminalCode: 'completed',
      sourceRevisionAt: now,
      sourceRevisionHash: 'b'.repeat(64),
      adapterVersion: 'external-orders-v1',
      normalizedPayload: { state: 'completed' },
      observedAt: now,
      createdAt: now,
    });
};

const createCommand = (idempotencyKey: string): CreateOrderCommand => ({
  businessId,
  idempotencyKey,
  context,
  reasonCode: 'new_customer_order',
  reasonNote: null,
  customer: {
    resolution: 'not_provided',
    userId: null,
    externalUserId: null,
  },
  displayNumber: `N-${idempotencyKey}`,
  dueAt: new Date('2026-08-24T20:00:00.000Z'),
  currency: 'USD',
  totalAmountCents: 3_600,
  balanceDueCents: 3_600,
  items: [
    {
      lineKey: 'laundry',
      itemType: 'service',
      code: 'wash_fold',
      description: 'Wash and fold',
      quantity: 18,
      unit: 'lb',
      unitPriceCents: 200,
      totalAmountCents: 3_600,
      sourceMetadata: { service: 'wash_fold' },
    },
  ],
  fulfillment: {
    typeCode: 'wash_fold',
    locationId,
    estimatedWeightLbs: 18,
    estimatedWeightSource: 'source_estimate',
  },
});

const sortedNormalized = (rows: readonly unknown[]) =>
  rows
    .map(normalizeOrdersValue)
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
const observe = async (database: ConformanceDatabase) => ({
  orders: sortedNormalized(
    await database.db.select().from(presslyPostgresOwnerSchemas.orders.orders),
  ),
  fulfillments: sortedNormalized(
    await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.orders.orderFulfillments),
  ),
  items: sortedNormalized(
    await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.orders.orderItems),
  ),
  receipts: sortedNormalized(
    await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.orders.orderCommandReceipts),
  ),
  outbox: sortedNormalized(
    await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.orders.orderOutboxEvents),
  ),
  proposals: sortedNormalized(
    await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.orders.orderSourceProposals),
  ),
  transitions: sortedNormalized(
    await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions),
  ),
  resolutions: sortedNormalized(
    await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.orders.orderSourceProposalResolutions),
  ),
  sourceLinks: sortedNormalized(
    await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.orders.orderSourceLinks),
  ),
  sourceSnapshots: sortedNormalized(
    await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.orders.orderSourceSnapshots),
  ),
  sourceCustomers: sortedNormalized(
    await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.orders.orderSourceCustomerRefs),
  ),
  customers: sortedNormalized(
    await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.customers.users),
  ),
  customerLinks: sortedNormalized(
    await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.customers.userSourceLinks),
  ),
  customerReceipts: sortedNormalized(
    await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.customers.userCommandReceipts),
  ),
});

beforeAll(async () => {
  createDatabase(targetDatabase.name);
  await targetDatabase.check();
});
beforeEach(async () => {
  await targetDatabase.reset();
  await seedOwner(targetDatabase.db);
});
afterAll(async () => {
  await targetDatabase.close();
  dropDatabase(targetDatabase.name);
  expect(databaseExists(targetDatabase.name)).toBe(false);
});

const runCanonicalScenario = async (
  database: ConformanceDatabase,
  runner: Runner,
) => {
  const outputs: unknown[] = [];
  const firstCommand = createCommand('canonical-first');
  const first = await runner.create(firstCommand as never);
  outputs.push(first, await runner.create(firstCommand as never));
  outputs.push(
    await runner.create({
      ...firstCommand,
      displayNumber: 'conflict',
    } as never),
  );
  const firstValue = ordersOutcomeValue(first);
  const orderId = String(firstValue['orderId']);
  const fulfillmentId = String(firstValue['fulfillmentId']);
  outputs.push(
    await runner.get({ businessId, locationIds: [locationId], orderId }),
  );
  outputs.push(
    await runner.list({
      businessId,
      locationIds: [locationId],
      query: 'canonical-first',
      state: 'open',
      limit: 1,
      cursor: null,
    }),
  );
  outputs.push(
    await runner.correct({
      businessId,
      locationId,
      orderId,
      expectedOrderVersion: 1,
      expectedFulfillmentVersion: 1,
      changes: {
        displayNumber: 'CORRECTED',
        fulfillment: {
          estimatedWeight: { lbs: 12, source: 'manager_estimate' },
        },
      },
      idempotencyKey: 'correct-first',
      context,
      reasonCode: 'manager_correction',
      reasonNote: 'Corrected details.',
    }),
  );
  outputs.push(
    await runner.complete({
      businessId,
      locationId,
      orderId,
      expectedVersion: 2,
      idempotencyKey: 'complete-first',
      context,
      reasonCode: 'service_completed',
      reasonNote: null,
    }),
  );

  const second = await runner.create(
    createCommand('canonical-second') as never,
  );
  outputs.push(second);
  outputs.push(
    await runner.cancel({
      businessId,
      locationId,
      orderId: String(ordersOutcomeValue(second)['orderId']),
      expectedVersion: 1,
      idempotencyKey: 'cancel-second',
      context,
      reasonCode: 'customer_canceled',
      reasonNote: null,
    }),
  );

  const third = await runner.create(createCommand('canonical-third') as never);
  outputs.push(third);
  outputs.push(
    await runner.release({
      businessId,
      fulfillmentId: String(ordersOutcomeValue(third)['fulfillmentId']),
      locationId,
      expectedOrderVersion: 1,
      expectedFulfillmentVersion: 1,
      idempotencyKey: 'release-third',
      context,
      reasonCode: 'ready_for_production',
      reasonNote: null,
    }),
  );
  outputs.push(
    await runner.withdraw({
      businessId,
      fulfillmentId: String(ordersOutcomeValue(third)['fulfillmentId']),
      locationId,
      expectedOrderVersion: 2,
      expectedFulfillmentVersion: 2,
      idempotencyKey: 'withdraw-third',
      context,
      reasonCode: 'commercial_canceled',
      reasonNote: null,
    }),
  );
  return {
    outputs: outputs.map(normalizeOrdersOutcome),
    state: await observe(database),
    firstIds: { orderId, fulfillmentId },
  };
};

const runIncomingScenario = async (
  database: ConformanceDatabase,
  runner: Runner,
) => {
  await seedProposals(database.db);
  const outputs: unknown[] = [];
  outputs.push(
    await runner.listIncoming({
      locationId,
      view: 'needs_review',
      limit: 1,
      cursor: null,
    }),
    await runner.listIncoming({
      locationId,
      view: 'source_closed',
      limit: 10,
      cursor: null,
    }),
  );
  const reject = {
    proposalId: proposalIds.reject,
    locationId,
    expectedVersion: 1,
    idempotencyKey: 'reject-proposal',
    context,
    reasonCode: 'duplicate_order',
    reasonNote: null,
  };
  outputs.push(await runner.reject(reject), await runner.reject(reject));
  outputs.push(
    await runner.restore({
      proposalId: proposalIds.restore,
      locationId,
      expectedVersion: 2,
      idempotencyKey: 'restore-proposal',
      context,
      reasonCode: 'source_closure_overridden',
      reasonNote: null,
    }),
  );
  const accept = {
    proposalId: proposalIds.accept,
    locationId,
    expectedVersion: 1,
    idempotencyKey: 'accept-proposal',
    context,
    reasonCode: 'incoming_order_accepted',
    reasonNote: null,
  };
  outputs.push(await runner.accept(accept), await runner.accept(accept));
  return {
    outputs: outputs.map(normalizeOrdersOutcome),
    state: await observe(database),
  };
};

describe('Orders-system PostgreSQL conformance', () => {
  it('pins all canonical commands and Orders-owned customer-snapshot get/list behavior, receipts, versions and outbox bytes', async () => {
    const target = await runCanonicalScenario(
      targetDatabase,
      targetRunner(targetDatabase),
    );
    expect(
      target.outputs.map((outcome) => {
        const value = outcome as {
          kind: string;
          value?: Record<string, unknown>;
          failure?: Record<string, unknown>;
        };
        return value.kind === 'failure'
          ? { kind: value.kind, code: value.failure?.['code'] }
          : {
              kind: value.kind,
              version:
                value.value?.['version'] ?? value.value?.['orderVersion'],
              replayed: value.value?.['replayed'],
              displayNumber: value.value?.['displayNumber'],
              state: value.value?.['state'],
              itemCount: Array.isArray(value.value?.['items'])
                ? value.value['items'].length
                : undefined,
            };
      }),
    ).toEqual([
      { kind: 'success', version: 1, replayed: false },
      { kind: 'success', version: 1, replayed: true },
      { kind: 'failure', code: 'order_idempotency_conflict' },
      {
        kind: 'success',
        version: 1,
        displayNumber: 'N-canonical-first',
        state: 'open',
        itemCount: 1,
      },
      { kind: 'success', itemCount: 1 },
      { kind: 'success', version: 2, replayed: false },
      { kind: 'success', version: 3, replayed: false },
      { kind: 'success', version: 1, replayed: false },
      { kind: 'success', version: 2, replayed: false },
      { kind: 'success', version: 1, replayed: false },
      { kind: 'success', version: 2, replayed: false },
      { kind: 'success', version: 3, replayed: false },
    ]);
    expect(
      target.state.orders.map((row) => {
        const value = row as Record<string, unknown>;
        return {
          displayNumber: value['displayNumber'],
          state: value['state'],
          version: value['version'],
        };
      }),
    ).toEqual([
      { displayNumber: 'CORRECTED', state: 'completed', version: 3 },
      {
        displayNumber: 'N-canonical-second',
        state: 'canceled',
        version: 2,
      },
      {
        displayNumber: 'N-canonical-third',
        state: 'open',
        version: 3,
      },
    ]);
    expect(
      target.state.fulfillments.map((row) => {
        const value = row as Record<string, unknown>;
        return {
          releaseState: value['releaseState'],
          estimatedWeightLbs: value['estimatedWeightLbs'],
          version: value['version'],
        };
      }),
    ).toEqual([
      { releaseState: 'unreleased', estimatedWeightLbs: 12, version: 2 },
      { releaseState: 'unreleased', estimatedWeightLbs: 18, version: 1 },
      { releaseState: 'withdrawn', estimatedWeightLbs: 18, version: 3 },
    ]);
    expect(target.state.items).toHaveLength(3);
    expect(
      target.state.receipts.map((row) => {
        const value = row as Record<string, unknown>;
        return [value['idempotencyKey'], value['reasonCode']];
      }),
    ).toEqual([
      ['cancel-second', 'customer_canceled'],
      ['canonical-first', 'new_customer_order'],
      ['canonical-second', 'new_customer_order'],
      ['canonical-third', 'new_customer_order'],
      ['complete-first', 'service_completed'],
      ['correct-first', 'manager_correction'],
      ['release-third', 'ready_for_production'],
      ['withdraw-third', 'commercial_canceled'],
    ]);
    expect(
      target.state.outbox.map((row) => {
        const value = row as Record<string, unknown>;
        const payload = value['payload'] as Record<string, unknown>;
        return [
          value['aggregateVersion'],
          payload['displayNumber'],
          payload['commercialState'],
          payload['admissionState'],
        ];
      }),
    ).toEqual([
      [1, 'N-canonical-first', 'open', 'unreleased'],
      [1, 'N-canonical-second', 'open', 'unreleased'],
      [1, 'N-canonical-third', 'open', 'unreleased'],
      [2, 'CORRECTED', 'open', 'unreleased'],
      [2, 'N-canonical-second', 'canceled', 'unreleased'],
      [2, 'N-canonical-third', 'open', 'released'],
      [3, 'CORRECTED', 'completed', 'unreleased'],
      [3, 'N-canonical-third', 'open', 'withdrawn'],
    ]);
    for (const key of [
      'proposals',
      'transitions',
      'resolutions',
      'sourceLinks',
      'sourceSnapshots',
      'sourceCustomers',
      'customers',
      'customerLinks',
      'customerReceipts',
    ] as const)
      expect(target.state[key]).toEqual([]);
  });

  it('pins proposal list/reject/restore/accept behavior and exact Orders-owned customer/source snapshots', async () => {
    const target = await runIncomingScenario(
      targetDatabase,
      targetRunner(targetDatabase),
    );
    expect(
      target.outputs.map((outcome) => {
        const value = (outcome as { value: Record<string, unknown> }).value;
        return {
          kind: (outcome as { kind: string }).kind,
          state: value['state'],
          version: value['version'],
          replayed: value['replayed'],
          itemState: Array.isArray(value['items'])
            ? (value['items'][0] as Record<string, unknown>)['state']
            : undefined,
          nextCursor:
            value['nextCursor'] === null
              ? null
              : typeof value['nextCursor'] === 'string'
                ? '<cursor>'
                : undefined,
        };
      }),
    ).toEqual([
      { kind: 'success', itemState: 'pending', nextCursor: '<cursor>' },
      { kind: 'success', itemState: 'source_closed', nextCursor: null },
      { kind: 'success', state: 'rejected', version: 2, replayed: false },
      { kind: 'success', state: 'rejected', version: 2, replayed: true },
      {
        kind: 'success',
        state: 'restored_pending',
        version: 3,
        replayed: false,
      },
      { kind: 'success', state: 'accepted', version: 2, replayed: false },
      { kind: 'success', state: 'accepted', version: 2, replayed: true },
    ]);
    expect(target.state.orders).toEqual([
      expect.objectContaining({
        customerResolution: 'resolved',
        displayNumber: 'P-accept',
        state: 'open',
        version: 1,
      }),
    ]);
    expect(target.state.fulfillments).toEqual([
      expect.objectContaining({
        releaseState: 'unreleased',
        estimatedWeightLbs: 20,
        version: 1,
      }),
    ]);
    expect(target.state.items).toHaveLength(1);
    expect(target.state.receipts).toEqual([
      expect.objectContaining({
        idempotencyKey: 'accept-proposal',
        reasonCode: 'incoming_order_accepted',
      }),
    ]);
    expect(target.state.outbox).toEqual([
      expect.objectContaining({
        aggregateVersion: 1,
        payload: expect.objectContaining({
          displayNumber: 'P-accept',
          commercialState: 'open',
          admissionState: 'unreleased',
        }),
      }),
    ]);
    expect(
      target.state.proposals.map((row) => {
        const value = row as Record<string, unknown>;
        return [value['externalOrderId'], value['state'], value['version']];
      }),
    ).toEqual([
      ['accept', 'accepted', 2],
      ['reject', 'rejected', 2],
      ['restore', 'restored_pending', 3],
    ]);
    expect(
      target.state.transitions.map((row) => {
        const value = row as Record<string, unknown>;
        return [value['eventType'], value['fromState'], value['toState']];
      }),
    ).toEqual([
      ['accept', 'pending', 'accepted'],
      ['reject', 'pending', 'rejected'],
      ['restore', 'source_closed', 'restored_pending'],
    ]);
    expect(
      target.state.resolutions.map((row) =>
        Reflect.get(row as object, 'decision'),
      ),
    ).toEqual(['accepted', 'rejected']);
    expect(target.state.sourceLinks).toHaveLength(1);
    expect(target.state.sourceSnapshots).toHaveLength(1);
    expect(target.state.sourceCustomers).toHaveLength(1);
    expect(target.state.customers).toEqual([
      expect.objectContaining({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'accept@example.test',
      }),
    ]);
    expect(target.state.customerLinks).toHaveLength(1);
    expect(target.state.customerReceipts).toEqual([
      expect.objectContaining({
        idempotencyKey: `incoming-order-proposal:${proposalIds.accept}:customer`,
      }),
    ]);
  });

  it('preserves advisory-lock race effects for lifecycle and proposal decisions', async () => {
    const runRace = async (database: ConformanceDatabase, runner: Runner) => {
      const created = await runner.create(createCommand('race-order') as never);
      const orderId = String(ordersOutcomeValue(created)['orderId']);
      const lifecycle = await Promise.all([
        runner.complete({
          businessId,
          locationId,
          orderId,
          expectedVersion: 1,
          idempotencyKey: 'race-complete',
          context,
          reasonCode: 'service_completed',
          reasonNote: null,
        }),
        runner.cancel({
          businessId,
          locationId,
          orderId,
          expectedVersion: 1,
          idempotencyKey: 'race-cancel',
          context,
          reasonCode: 'customer_canceled',
          reasonNote: null,
        }),
      ]);
      await seedProposals(database.db, true);
      const proposal = await Promise.all([
        runner.accept({
          proposalId: proposalIds.race,
          locationId,
          expectedVersion: 1,
          idempotencyKey: 'race-accept',
          context,
          reasonCode: 'incoming_order_accepted',
          reasonNote: null,
        }),
        runner.reject({
          proposalId: proposalIds.race,
          locationId,
          expectedVersion: 1,
          idempotencyKey: 'race-reject',
          context,
          reasonCode: 'duplicate_order',
          reasonNote: null,
        }),
      ]);
      return {
        lifecycle: lifecycle.map(normalizeOrdersOutcome),
        proposal: proposal.map(normalizeOrdersOutcome),
        lifecycleRows: (
          await database.db
            .select()
            .from(presslyPostgresOwnerSchemas.orders.orders)
        ).filter((row) => row.displayNumber === 'N-race-order'),
        proposalTransitions: (
          await database.db
            .select()
            .from(
              presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions,
            )
        ).filter((row) => row.proposalId === proposalIds.race),
        proposalResolutions: (
          await database.db
            .select()
            .from(
              presslyPostgresOwnerSchemas.orders.orderSourceProposalResolutions,
            )
        ).filter((row) => row.proposalId === proposalIds.race),
      };
    };
    const target = await runRace(targetDatabase, targetRunner(targetDatabase));
    expect(
      target.lifecycle
        .map((outcome) => (outcome as { kind: string }).kind)
        .sort(),
    ).toEqual(['failure', 'success']);
    expect(
      target.proposal
        .map((outcome) => (outcome as { kind: string }).kind)
        .sort(),
    ).toEqual(['failure', 'success']);
    expect(target.lifecycleRows).toHaveLength(1);
    expect(target.lifecycleRows[0]?.version).toBe(2);
    expect(target.proposalTransitions).toHaveLength(1);
    expect(target.proposalResolutions).toHaveLength(1);
  });

  it('retains owner-committed Customer resolution and retries the rolled-back Order acceptance after a late fault', async () => {
    const installFault = async (database: ConformanceDatabase) => {
      await database.db.execute(sql`
        create function orders_conformance_reject_receipt()
        returns trigger language plpgsql as $$
        begin
          raise exception 'injected conformance receipt failure';
        end;
        $$
      `);
      await database.db.execute(sql`
        create trigger orders_conformance_receipt_fault
        before insert on order_command_receipts
        for each row execute function orders_conformance_reject_receipt()
      `);
    };
    const removeFault = async (database: ConformanceDatabase) => {
      await database.db.execute(
        sql`drop trigger if exists orders_conformance_receipt_fault on order_command_receipts`,
      );
      await database.db.execute(
        sql`drop function if exists orders_conformance_reject_receipt()`,
      );
    };
    const capture = async (action: () => Promise<unknown>) => {
      try {
        await action();
        return { unexpected: 'success' };
      } catch (error) {
        return normalizeOrdersValue(
          error === null || typeof error !== 'object'
            ? error
            : Object.fromEntries(
                ['kind', 'code', 'message', 'safeMessage', 'status'].map(
                  (key) => [key, Reflect.get(error, key)],
                ),
              ),
        );
      }
    };
    await seedProposals(targetDatabase.db);
    await installFault(targetDatabase);
    const command = {
      proposalId: proposalIds.accept,
      locationId,
      expectedVersion: 1,
      idempotencyKey: 'rollback-accept',
      context,
      reasonCode: 'incoming_order_accepted',
      reasonNote: null,
    };
    const targetError = await capture(() =>
      targetRunner(targetDatabase).accept(command),
    );
    expect(targetError).toMatchObject({
      code: 'incoming_order_proposal_accept_failed',
      status: 503,
    });
    expect(
      await targetDatabase.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orders),
    ).toEqual([]);
    expect(
      await targetDatabase.db
        .select()
        .from(presslyPostgresOwnerSchemas.customers.users),
    ).toHaveLength(1);
    expect(
      await targetDatabase.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orderSourceLinks),
    ).toEqual([]);
    expect(
      await targetDatabase.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orderCommandReceipts),
    ).toEqual([]);
    expect(
      await targetDatabase.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orderOutboxEvents),
    ).toEqual([]);
    const proposal = (
      await targetDatabase.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orderSourceProposals)
    ).find((row) => row.id === proposalIds.accept);
    expect(proposal).toMatchObject({ state: 'pending', version: 1 });

    await removeFault(targetDatabase);
    const retried = await targetRunner(targetDatabase).accept(command);
    expect(retried).toMatchObject({
      kind: 'success',
      value: { state: 'accepted', replayed: false },
    });
    expect(
      await targetDatabase.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orders),
    ).toHaveLength(1);
    expect(
      await targetDatabase.db
        .select()
        .from(presslyPostgresOwnerSchemas.customers.users),
    ).toHaveLength(1);
  });
});
