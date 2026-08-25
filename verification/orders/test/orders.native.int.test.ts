import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeAccessSystem } from '@pressly/access-system/testing/assembly';
import { makeCustomersSystem } from '@pressly/customers-system/testing/assembly';
import { eq, sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import {
  createTestDatabaseRuntime,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashOrderCommand } from '@pressly/orders-system/models/canonical-order/policy';
import { makeOrdersSystem } from '@pressly/orders-system/testing/assembly';
import type { CreateOrderCommand } from '@pressly/orders-system/operations/lifecycle/create-order/types';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const adminDatabaseUrl =
  process.env['PRESSLY_ORDERS_NATIVE_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';
const databaseName =
  process.env['PRESSLY_ORDERS_NATIVE_DATABASE_NAME'] ??
  `pressly_orders_native_test_${process.pid}_${Date.now().toString(36)}`;
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
  dropDatabase();
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
const database: TestDatabaseRuntime = createTestDatabaseRuntime({
  databaseUrl,
  tableNames,
  maxConnections: 12,
});

const now = new Date('2026-08-22T18:30:00.000Z');
const businessId = '74000000-0000-4000-8000-000000000001';
const locationId = 'orders-native-location';
const context = {
  origin: 'pressly_dashboard',
  principal: { kind: 'human' as const, id: 'identity-orders-native' },
};
const clock = { now: () => now };
const accessOwner = makeAccessSystem({
  db: database.db,
  schema: presslyPostgresOwnerSchemas.access,
  clock,
  tokenSecret: 'orders-native-access-token-secret',
  sessionTtlMinutes: 30,
  sessionIdleTimeoutMinutes: 30,
  loginWindowMinutes: 15,
  loginMaxFailures: 5,
  mfaChallengeTtlMinutes: 5,
  mfaChallengeMaxAttempts: 8,
  mfaEncryptionKey: Buffer.alloc(32, 4).toString('base64'),
  mfaIssuer: 'Pressly Orders Native',
  policies: {
    pricing: { freshSessionMaxAgeMinutes: 15 },
    authSessions: { freshSessionMaxAgeMinutes: 15 },
    mfa: { freshSessionMaxAgeMinutes: 15 },
  },
});
const customersOwner = makeCustomersSystem({
  schema: presslyPostgresOwnerSchemas.customers,
  db: database.db,
  clock,
});
const system = () =>
  makeOrdersSystem({
    schema: presslyPostgresOwnerSchemas.orders,
    db: database.db,
    clock,
    orderLocationFactsV1: accessOwner.capabilities.orderLocationFactsV1,
    ...customersOwner.capabilities,
  });
const customersSystem = () => customersOwner;

type NativeOutcome<Value, Failure> =
  | Readonly<{ kind: 'success'; value: Value }>
  | Readonly<{ kind: 'failure'; failure: Failure }>;

const success = <Value, Failure>(
  outcome: NativeOutcome<Value, Failure>,
): Value => {
  expect(outcome.kind).toBe('success');
  if (outcome.kind === 'failure') throw outcome.failure;
  return outcome.value;
};
const failure = <Value, Failure>(
  outcome: NativeOutcome<Value, Failure>,
): Failure => {
  expect(outcome.kind).toBe('failure');
  if (outcome.kind === 'success') throw outcome.value;
  return outcome.failure;
};

const createCommand = (
  idempotencyKey: string,
  overrides: Partial<CreateOrderCommand> = {},
): CreateOrderCommand => ({
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
  ...overrides,
});

const proposalCommand = (externalOrderId: string) => ({
  context: {
    origin: 'external_orders_adapter',
    principal: { kind: 'system' as const, id: 'external-orders' },
  },
  source: 'cents',
  externalOrderId,
  proposalKind: 'submitted_order' as const,
  snapshot: {
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
    dueAt: new Date('2026-08-25T20:00:00.000Z'),
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
  revision: {
    at: new Date('2026-08-22T18:00:00.000Z'),
    hash: 'a'.repeat(64),
    adapterVersion: 'external-orders-v1',
    observedAt: new Date('2026-08-22T18:01:00.000Z'),
    normalizedPayload: { order: { id: externalOrderId } },
  },
});

const seedOwner = async (): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.access.businessAccounts)
    .values({
      id: businessId,
      slug: 'orders-native',
      displayName: 'Orders Native',
      createdAt: now,
      updatedAt: now,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.access.accessProductionLocations)
    .values({
      id: locationId,
      businessId,
      name: 'Orders Native',
      timezone: 'America/New_York',
      createdAt: now,
      updatedAt: now,
    });
};

const removeReceiptFault = async (): Promise<void> => {
  await database.db.execute(
    sql`drop trigger if exists orders_native_receipt_fault on order_command_receipts`,
  );
  await database.db.execute(
    sql`drop function if exists orders_native_reject_receipt()`,
  );
};
const installReceiptFault = async (): Promise<void> => {
  await database.db.execute(sql`
    create function orders_native_reject_receipt()
    returns trigger language plpgsql as $$
    begin
      raise exception 'injected Orders native receipt failure';
    end;
    $$
  `);
  await database.db.execute(sql`
    create trigger orders_native_receipt_fault
    before insert on order_command_receipts
    for each row execute function orders_native_reject_receipt()
  `);
};

beforeAll(async () => {
  createDatabase();
  await database.check();
});
beforeEach(async () => {
  await removeReceiptFault();
  await database.reset();
  await seedOwner();
});
afterAll(async () => {
  await removeReceiptFault();
  await database.close();
  dropDatabase();
  expect(databaseExists()).toBe(false);
});

describe('Orders native cells on isolated PostgreSQL', () => {
  it('creates, replays, reads and paginates exact canonical state and message bytes', async () => {
    const command = createCommand('native-create-1');
    const created = success(await system().cells.createOrder.execute(command));
    expect(success(await system().cells.createOrder.execute(command))).toEqual({
      ...created,
      replayed: true,
    });
    expect(
      failure(
        await system().cells.createOrder.execute({
          ...command,
          displayNumber: 'different',
        }),
      ),
    ).toMatchObject({ code: 'order_idempotency_conflict' });

    const detail = success(
      await system().cells.getCanonicalOrder.execute({
        businessId,
        locationIds: [locationId],
        orderId: created.orderId,
      }),
    );
    expect(detail).toMatchObject({
      orderId: created.orderId,
      orderVersion: 1,
      customer: { resolution: 'not_provided', displayName: null },
      fulfillment: { releaseState: 'unreleased' },
      items: command.items,
    });
    const listed = success(
      await system().cells.listCanonicalOrders.execute({
        businessId,
        locationIds: [locationId],
        query: 'native-create-1',
        state: 'open',
        limit: 1,
        cursor: null,
      }),
    );
    expect(listed).toMatchObject({
      items: [{ orderId: created.orderId }],
      nextCursor: null,
    });

    const [receipt] = await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.orders.orderCommandReceipts);
    expect(receipt).toMatchObject({
      idempotencyKey: command.idempotencyKey,
      commandHash: hashOrderCommand(command),
      origin: context.origin,
      actorKind: 'human',
      actorId: context.principal.id,
      reasonCode: 'new_customer_order',
      reasonNote: null,
      result: created,
      createdAt: now,
    });
    const [event] = await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.orders.orderOutboxEvents);
    expect(event).toMatchObject({
      orderId: created.orderId,
      fulfillmentId: created.fulfillmentId,
      eventType: 'fulfillment_demand_changed',
      aggregateVersion: 1,
      status: 'pending',
      attempts: 0,
      availableAt: now,
      createdAt: now,
      payload: {
        schemaVersion: 2,
        eventType: 'fulfillment_demand_changed',
        fulfillmentId: created.fulfillmentId,
        displayNumber: command.displayNumber,
        locationId,
        typeCode: 'wash_fold',
        admissionState: 'unreleased',
        commercialState: 'open',
        dueAt: command.dueAt.toISOString(),
        estimatedWeightLbs: 18,
        estimatedWeightSource: 'source_estimate',
        version: 1,
        observedAt: now.toISOString(),
      },
    });
  });

  it('validates Customer through its owner capability before rolling back an independent late Orders fault', async () => {
    const resolvedCustomer = {
      resolution: 'resolved' as const,
      userId: '74000000-0000-4000-8000-000000000010',
      externalUserId: null,
    };
    expect(
      failure(
        await system().cells.createOrder.execute(
          createCommand('native-missing-customer', {
            customer: resolvedCustomer,
          }),
        ),
      ),
    ).toMatchObject({ code: 'order_reference_not_found' });
    const customerId = success(
      await customersSystem().cells.createCustomer.execute({
        businessId,
        idempotencyKey: 'native-existing-customer',
        context,
        profile: {
          firstName: 'Grace',
          lastName: 'Hopper',
          businessName: null,
          phone: null,
          email: 'grace@example.test',
        },
      }),
    ).userId;
    await installReceiptFault();
    const command = createCommand('native-create-rollback', {
      customer: { ...resolvedCustomer, userId: customerId },
    });
    await expect(
      system().cells.createOrder.execute(command),
    ).rejects.toMatchObject({ code: 'order_create_failed' });
    expect(
      await database.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orders),
    ).toEqual([]);
    expect(
      await database.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orderFulfillments),
    ).toEqual([]);
    expect(
      await database.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orderOutboxEvents),
    ).toEqual([]);
  });

  it('corrects descriptions with exact dual versions, receipt replay and outbox evidence', async () => {
    const created = success(
      await system().cells.createOrder.execute(createCommand('native-correct')),
    );
    const command = {
      businessId,
      locationId,
      orderId: created.orderId,
      expectedOrderVersion: 1,
      expectedFulfillmentVersion: 1,
      changes: {
        displayNumber: 'CORRECTED',
        items: [
          {
            lineKey: 'dry-clean',
            itemType: 'service',
            code: 'dry_clean',
            description: 'Dry cleaning',
            quantity: 2,
            unit: 'item',
            unitPriceCents: 900,
            totalAmountCents: 1_800,
            sourceMetadata: { corrected: true },
          },
        ],
        fulfillment: {
          estimatedWeight: { lbs: 12, source: 'manager_estimate' },
        },
      },
      idempotencyKey: 'native-correct-command',
      context,
      reasonCode: 'manager_correction' as const,
      reasonNote: 'Customer supplied corrected details.',
    };
    const corrected = success(
      await system().cells.correctOrder.execute(command),
    );
    expect(corrected).toEqual({ ...created, version: 2, replayed: false });
    expect(success(await system().cells.correctOrder.execute(command))).toEqual(
      {
        ...corrected,
        replayed: true,
      },
    );
    expect(
      failure(
        await system().cells.correctOrder.execute({
          ...command,
          idempotencyKey: 'native-correct-stale',
        }),
      ),
    ).toMatchObject({ code: 'order_version_conflict' });
    const detail = success(
      await system().cells.getCanonicalOrder.execute({
        businessId,
        locationIds: [locationId],
        orderId: created.orderId,
      }),
    );
    expect(detail).toMatchObject({
      orderVersion: 2,
      fulfillmentVersion: 2,
      displayNumber: 'CORRECTED',
      items: command.changes.items,
      fulfillment: {
        estimatedWeightLbs: 12,
        estimatedWeightSource: 'manager_estimate',
      },
    });
    expect(
      await database.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orderOutboxEvents),
    ).toHaveLength(2);
  });

  it('completes and cancels independently, then serializes a terminal-state race', async () => {
    const completedOrder = success(
      await system().cells.createOrder.execute(createCommand('complete-me')),
    );
    const completed = success(
      await system().cells.completeOrder.execute({
        businessId,
        locationId,
        orderId: completedOrder.orderId,
        expectedVersion: 1,
        idempotencyKey: 'complete-command',
        context,
        reasonCode: 'service_completed',
        reasonNote: null,
      }),
    );
    expect(completed.version).toBe(2);

    const canceledOrder = success(
      await system().cells.createOrder.execute(createCommand('cancel-me')),
    );
    const canceled = success(
      await system().cells.cancelOrder.execute({
        businessId,
        locationId,
        orderId: canceledOrder.orderId,
        expectedVersion: 1,
        idempotencyKey: 'cancel-command',
        context,
        reasonCode: 'customer_canceled',
        reasonNote: null,
      }),
    );
    expect(canceled.version).toBe(2);

    const racing = success(
      await system().cells.createOrder.execute(createCommand('race-terminal')),
    );
    const outcomes = await Promise.all([
      system().cells.completeOrder.execute({
        businessId,
        locationId,
        orderId: racing.orderId,
        expectedVersion: 1,
        idempotencyKey: 'race-complete',
        context,
        reasonCode: 'service_completed',
        reasonNote: null,
      }),
      system().cells.cancelOrder.execute({
        businessId,
        locationId,
        orderId: racing.orderId,
        expectedVersion: 1,
        idempotencyKey: 'race-cancel',
        context,
        reasonCode: 'customer_canceled',
        reasonNote: null,
      }),
    ]);
    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual([
      'failure',
      'success',
    ]);
    expect(
      outcomes.find((outcome) => outcome.kind === 'failure'),
    ).toMatchObject({ failure: { code: 'order_version_conflict' } });
  });

  it('releases, withdraws and serializes competing fulfillment commands', async () => {
    const created = success(
      await system().cells.createOrder.execute(createCommand('release-me')),
    );
    const released = success(
      await system().cells.releaseFulfillment.execute({
        businessId,
        fulfillmentId: created.fulfillmentId,
        locationId,
        expectedOrderVersion: 1,
        expectedFulfillmentVersion: 1,
        idempotencyKey: 'release-command',
        context,
        reasonCode: 'ready_for_production',
        reasonNote: null,
      }),
    );
    expect(released.version).toBe(2);
    const withdrawn = success(
      await system().cells.withdrawFulfillment.execute({
        businessId,
        fulfillmentId: created.fulfillmentId,
        locationId,
        expectedOrderVersion: 2,
        expectedFulfillmentVersion: 2,
        idempotencyKey: 'withdraw-command',
        context,
        reasonCode: 'commercial_canceled',
        reasonNote: null,
      }),
    );
    expect(withdrawn.version).toBe(3);
    const [stored] = await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.orders.orderFulfillments)
      .where(
        eq(
          presslyPostgresOwnerSchemas.orders.orderFulfillments.id,
          created.fulfillmentId,
        ),
      );
    expect(stored).toMatchObject({ releaseState: 'withdrawn', version: 3 });

    const racing = success(
      await system().cells.createOrder.execute(createCommand('race-release')),
    );
    const outcomes = await Promise.all([
      system().cells.releaseFulfillment.execute({
        businessId,
        fulfillmentId: racing.fulfillmentId,
        locationId,
        expectedOrderVersion: 1,
        expectedFulfillmentVersion: 1,
        idempotencyKey: 'race-release-command',
        context,
        reasonCode: 'ready_for_production',
        reasonNote: null,
      }),
      system().cells.withdrawFulfillment.execute({
        businessId,
        fulfillmentId: racing.fulfillmentId,
        locationId,
        expectedOrderVersion: 1,
        expectedFulfillmentVersion: 1,
        idempotencyKey: 'race-withdraw-command',
        context,
        reasonCode: 'commercial_canceled',
        reasonNote: null,
      }),
    ]);
    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual([
      'failure',
      'success',
    ]);
    expect(
      outcomes.find((outcome) => outcome.kind === 'failure'),
    ).toMatchObject({ failure: { code: 'fulfillment_version_conflict' } });
  });

  it('lists, rejects, restores and accepts proposals with exact Customer and source evidence', async () => {
    const ordersSystem = system();
    const rejectProposal = success(
      await ordersSystem.cells.proposeIncomingOrder.execute(
        proposalCommand('reject-me'),
      ),
    );
    const acceptProposal = success(
      await ordersSystem.cells.proposeIncomingOrder.execute(
        proposalCommand('accept-me'),
      ),
    );
    const restoreProposal = success(
      await ordersSystem.cells.proposeIncomingOrder.execute(
        proposalCommand('restore-me'),
      ),
    );
    const pageOne = success(
      await ordersSystem.cells.listIncomingOrderProposals.execute({
        locationId,
        view: 'needs_review',
        limit: 1,
        cursor: null,
      }),
    );
    expect(pageOne.items).toHaveLength(1);
    expect(pageOne.nextCursor).not.toBeNull();
    const pageTwo = success(
      await ordersSystem.cells.listIncomingOrderProposals.execute({
        locationId,
        view: 'needs_review',
        limit: 1,
        cursor: pageOne.nextCursor,
      }),
    );
    expect(pageTwo.items).toHaveLength(1);
    expect(pageTwo.nextCursor).not.toBeNull();
    const pageThree = success(
      await ordersSystem.cells.listIncomingOrderProposals.execute({
        locationId,
        view: 'needs_review',
        limit: 1,
        cursor: pageTwo.nextCursor,
      }),
    );
    expect(pageThree.items).toHaveLength(1);
    expect(pageThree.nextCursor).toBeNull();
    expect(
      [...pageOne.items, ...pageTwo.items, ...pageThree.items]
        .map((proposal) => proposal.externalOrderId)
        .sort(),
    ).toEqual(['accept-me', 'reject-me', 'restore-me']);

    const rejectCommand = {
      proposalId: rejectProposal.proposalId!,
      locationId,
      expectedVersion: 1,
      idempotencyKey: 'reject-proposal-command',
      context,
      reasonCode: 'duplicate_order' as const,
      reasonNote: null,
    };
    expect(
      success(
        await ordersSystem.cells.rejectIncomingOrderProposal.execute(
          rejectCommand,
        ),
      ),
    ).toMatchObject({ state: 'rejected', version: 2, replayed: false });
    expect(
      success(
        await ordersSystem.cells.rejectIncomingOrderProposal.execute(
          rejectCommand,
        ),
      ),
    ).toMatchObject({ state: 'rejected', version: 2, replayed: true });

    await ordersSystem.cells.closeIncomingOrderSource.execute({
      context: proposalCommand('restore-me').context,
      source: 'cents',
      externalOrderId: 'restore-me',
      terminalCode: 'completed',
      revision: {
        at: now,
        hash: 'b'.repeat(64),
        adapterVersion: 'external-orders-v1',
        observedAt: now,
        normalizedPayload: { state: 'completed' },
      },
    });
    const restored = success(
      await ordersSystem.cells.restoreIncomingOrderProposal.execute({
        proposalId: restoreProposal.proposalId!,
        locationId,
        expectedVersion: 2,
        idempotencyKey: 'restore-proposal-command',
        context,
        reasonCode: 'source_closure_overridden',
        reasonNote: null,
      }),
    );
    expect(restored).toMatchObject({ state: 'restored_pending', version: 3 });

    const accepted = success(
      await ordersSystem.cells.acceptIncomingOrderProposal.execute({
        proposalId: acceptProposal.proposalId!,
        locationId,
        expectedVersion: 1,
        idempotencyKey: 'accept-proposal-command',
        context,
        reasonCode: 'incoming_order_accepted',
        reasonNote: null,
      }),
    );
    expect(accepted).toMatchObject({
      state: 'accepted',
      version: 2,
      orderId: expect.any(String),
      fulfillmentId: expect.any(String),
      replayed: false,
    });
    expect(
      success(
        await ordersSystem.cells.acceptIncomingOrderProposal.execute({
          proposalId: acceptProposal.proposalId!,
          locationId,
          expectedVersion: 1,
          idempotencyKey: 'accept-proposal-command',
          context,
          reasonCode: 'incoming_order_accepted',
          reasonNote: null,
        }),
      ),
    ).toEqual({ ...accepted, replayed: true });
    expect(
      success(
        await customersSystem().cells.listCustomers.execute({
          businessId,
          query: null,
          active: null,
          limit: 100,
          cursor: null,
        }),
      ).items,
    ).toHaveLength(1);
    expect(
      await database.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orderSourceLinks),
    ).toHaveLength(1);
    expect(
      await database.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orderSourceSnapshots),
    ).toHaveLength(1);
    expect(
      await database.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orderSourceCustomerRefs),
    ).toMatchObject([
      {
        externalUserId: 'customer-accept-me',
        resolution: 'resolved',
        resolvedCustomerId: expect.any(String),
      },
    ]);
    expect(
      await database.db
        .select()
        .from(
          presslyPostgresOwnerSchemas.orders.orderSourceProposalResolutions,
        ),
    ).toHaveLength(2);
  });

  it('retains owner-committed Customer resolution and retries the rolled-back Order acceptance after a late fault', async () => {
    const proposed = success(
      await system().cells.proposeIncomingOrder.execute(
        proposalCommand('accept-rollback'),
      ),
    );
    await installReceiptFault();
    await expect(
      system().cells.acceptIncomingOrderProposal.execute({
        proposalId: proposed.proposalId!,
        locationId,
        expectedVersion: 1,
        idempotencyKey: 'accept-rollback-command',
        context,
        reasonCode: 'incoming_order_accepted',
        reasonNote: null,
      }),
    ).rejects.toMatchObject({ code: 'incoming_order_proposal_accept_failed' });
    expect(
      await database.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orders),
    ).toEqual([]);
    expect(
      success(
        await customersSystem().cells.listCustomers.execute({
          businessId,
          query: null,
          active: null,
          limit: 100,
          cursor: null,
        }),
      ).items,
    ).toHaveLength(1);
    expect(
      await database.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orderSourceLinks),
    ).toEqual([]);
    expect(
      await database.db
        .select()
        .from(
          presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions,
        ),
    ).toEqual([]);
    expect(
      await database.db
        .select()
        .from(
          presslyPostgresOwnerSchemas.orders.orderSourceProposalResolutions,
        ),
    ).toEqual([]);
    expect(
      await database.db
        .select({
          state: presslyPostgresOwnerSchemas.orders.orderSourceProposals.state,
        })
        .from(presslyPostgresOwnerSchemas.orders.orderSourceProposals),
    ).toEqual([{ state: 'pending' }]);

    await removeReceiptFault();
    const retried = success(
      await system().cells.acceptIncomingOrderProposal.execute({
        proposalId: proposed.proposalId!,
        locationId,
        expectedVersion: 1,
        idempotencyKey: 'accept-rollback-command',
        context,
        reasonCode: 'incoming_order_accepted',
        reasonNote: null,
      }),
    );
    expect(retried).toMatchObject({ state: 'accepted', replayed: false });
    expect(
      await database.db
        .select()
        .from(presslyPostgresOwnerSchemas.orders.orders),
    ).toHaveLength(1);
    expect(
      success(
        await customersSystem().cells.listCustomers.execute({
          businessId,
          query: null,
          active: null,
          limit: 100,
          cursor: null,
        }),
      ).items,
    ).toHaveLength(1);
  });
});
