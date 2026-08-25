import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPostgresRuntime,
  type PostgresDatabase,
} from '@pressly/postgres/client';
import { sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import { createTestDatabaseRuntime } from '@pressly/testkit/database';
import { makeOrdersIntegrationSystem } from '@pressly/orders-system/testing/assembly';
import type { CloseIncomingOrderSourceCommand } from '@pressly/orders-system/operations/intake/close-incoming-order-source/types';
import type { ProposeIncomingOrderCommand } from '@pressly/orders-system/operations/intake/propose-incoming-order/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const adminDatabaseUrl =
  process.env['PRESSLY_ORDERS_INTAKE_CONFORMANCE_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';
const databaseName =
  process.env['PRESSLY_ORDERS_INTAKE_CONFORMANCE_DATABASE_NAME'] ??
  `pressly_orders_intake_conformance_test_${process.pid}_${Date.now().toString(36)}`;
const databaseUrl = (() => {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${databaseName}`;
  url.search = '';
  return url.toString();
})();
const resetDatabaseUrl = databaseUrl;

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
  'order_source_links',
  'order_source_proposals',
  'order_outbox_events',
  'order_items',
  'order_fulfillments',
  'order_command_receipts',
  'orders',
] as const;

const database = createTestDatabaseRuntime({
  databaseUrl,
  resetDatabaseUrl,
  tableNames,
  maxConnections: 10,
});
const faultDatabase = createPostgresRuntime({
  schema: presslyPostgresOwnerSchemas.orders,
  databaseUrl: resetDatabaseUrl,
  maxConnections: 1,
});

const businessId = '73000000-0000-4000-8000-000000000001';
const locationId = 'orders-intake-conformance-location';
const proposalId = '73000000-0000-4000-8000-000000000002';
const orderId = '73000000-0000-4000-8000-000000000003';
const fulfillmentId = '73000000-0000-4000-8000-000000000004';
const now = new Date('2026-08-22T16:10:00.000Z');
const clock = { now: () => now };

const removeTransitionInsertFault = async (
  database: PostgresDatabase,
): Promise<void> => {
  await database.execute(
    sql`drop trigger if exists orders_intake_conformance_transition_fault on order_source_proposal_transitions`,
  );
  await database.execute(
    sql`drop function if exists orders_intake_conformance_reject_transition()`,
  );
};

const installTransitionInsertFault = async (
  database: PostgresDatabase,
): Promise<void> => {
  await database.execute(sql`
    create function orders_intake_conformance_reject_transition()
    returns trigger language plpgsql as $$
    begin
      raise exception 'injected Orders intake conformance transition failure';
    end;
    $$
  `);
  await database.execute(sql`
    create trigger orders_intake_conformance_transition_fault
    before insert on order_source_proposal_transitions
    for each row execute function orders_intake_conformance_reject_transition()
  `);
};

const proposalSnapshot = (externalOrderId: string) => ({
  customer: {
    externalUserId: 'customer-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    businessName: 'Analytical Laundry',
    phone: '+12125550100',
    email: 'ada@example.test',
    normalizedPayload: { id: 'customer-1' },
  },
  displayNumber: `P-${externalOrderId}`,
  dueAt: new Date('2026-08-23T20:00:00.000Z'),
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

const proposeCommand = (
  externalOrderId: string,
): ProposeIncomingOrderCommand => ({
  context: {
    origin: 'external_orders_adapter',
    principal: { kind: 'system', id: 'external-orders' },
  },
  source: 'cents',
  externalOrderId,
  proposalKind: 'submitted_order',
  snapshot: proposalSnapshot(externalOrderId),
  revision: {
    at: new Date('2026-08-22T15:59:00.000Z'),
    hash: 'a'.repeat(64),
    adapterVersion: 'external-orders-v1',
    observedAt: new Date('2026-08-22T16:00:00.000Z'),
    normalizedPayload: { order: { id: externalOrderId, state: 'SUBMITTED' } },
  },
});

const closeCommand = (
  externalOrderId: string,
): CloseIncomingOrderSourceCommand => ({
  context: {
    origin: 'external_orders_adapter',
    principal: { kind: 'system', id: 'external-orders' },
  },
  source: 'cents',
  externalOrderId,
  terminalCode: 'completed',
  revision: {
    at: new Date('2026-08-22T16:05:00.000Z'),
    hash: 'b'.repeat(64),
    adapterVersion: 'external-orders-v1',
    observedAt: new Date('2026-08-22T16:05:01.000Z'),
    normalizedPayload: {
      order: { id: externalOrderId, state: 'completed' },
    },
  },
});

const seedProposal = async (
  database: PostgresDatabase,
  input: Readonly<{
    externalOrderId: string;
    state?:
      | 'pending'
      | 'source_closed'
      | 'restored_pending'
      | 'accepted'
      | 'rejected';
    version?: number;
  }>,
): Promise<void> => {
  const snapshot = proposalSnapshot(input.externalOrderId);
  await database
    .insert(presslyPostgresOwnerSchemas.orders.orderSourceProposals)
    .values({
      id: proposalId,
      source: 'cents',
      externalOrderId: input.externalOrderId,
      locationId,
      proposalKind: 'submitted_order',
      sourceRevisionAt: new Date('2026-08-22T15:59:00.000Z'),
      sourceRevisionHash: 'a'.repeat(64),
      adapterVersion: 'external-orders-v1',
      proposalSnapshot: {
        order: { ...snapshot, dueAt: snapshot.dueAt.toISOString() },
        source: { order: { id: input.externalOrderId, state: 'SUBMITTED' } },
      },
      customerDisplayName: 'Analytical Laundry',
      customerPhone: '+12125550100',
      customerEmail: 'ada@example.test',
      displayNumber: snapshot.displayNumber,
      dueAt: snapshot.dueAt,
      estimatedWeightLbs: 18,
      observedAt: new Date('2026-08-22T16:00:00.000Z'),
      state: input.state ?? 'pending',
      version: input.version ?? 1,
      createdAt: new Date('2026-08-22T16:00:00.000Z'),
    });
};

const seedTombstone = async (
  database: PostgresDatabase,
  externalOrderId: string,
  storedProposalId: string | null = proposalId,
): Promise<void> => {
  const command = closeCommand(externalOrderId);
  await database
    .insert(presslyPostgresOwnerSchemas.orders.orderSourceTerminalTombstones)
    .values({
      source: command.source,
      externalOrderId,
      proposalId: storedProposalId,
      terminalCode: command.terminalCode,
      sourceRevisionAt: command.revision.at,
      sourceRevisionHash: command.revision.hash,
      adapterVersion: command.revision.adapterVersion,
      normalizedPayload: command.revision.normalizedPayload,
      observedAt: command.revision.observedAt,
      createdAt: command.revision.observedAt,
    });
};

const seedCanonical = async (
  database: PostgresDatabase,
  externalOrderId: string,
): Promise<void> => {
  await database.insert(presslyPostgresOwnerSchemas.orders.orders).values({
    id: orderId,
    businessId,
    customerResolution: 'not_provided',
    displayNumber: `P-${externalOrderId}`,
    dueAt: new Date('2026-08-23T20:00:00.000Z'),
    currency: 'USD',
    totalAmountCents: 3_600,
    balanceDueCents: 3_600,
    createdAt: now,
    updatedAt: now,
  });
  await database
    .insert(presslyPostgresOwnerSchemas.orders.orderFulfillments)
    .values({
      id: fulfillmentId,
      businessId,
      orderId,
      typeCode: 'wash_fold',
      locationId,
      releaseState: 'released',
      estimatedWeightLbs: 18,
      estimatedWeightSource: 'source_estimate',
      createdAt: now,
      updatedAt: now,
    });
  await database
    .insert(presslyPostgresOwnerSchemas.orders.orderSourceLinks)
    .values({
      source: 'cents',
      externalOrderId,
      orderId,
      createdAt: now,
      updatedAt: now,
    });
};

const ordersSystem = () =>
  makeOrdersIntegrationSystem({
    schema: presslyPostgresOwnerSchemas.orders,
    db: database.db,
    clock,
  });

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null
    ? (value as Readonly<Record<string, unknown>>)
    : null;

const stateObservation = async (database: PostgresDatabase) => {
  const proposals = await database
    .select({
      id: presslyPostgresOwnerSchemas.orders.orderSourceProposals.id,
      source: presslyPostgresOwnerSchemas.orders.orderSourceProposals.source,
      externalOrderId:
        presslyPostgresOwnerSchemas.orders.orderSourceProposals.externalOrderId,
      locationId:
        presslyPostgresOwnerSchemas.orders.orderSourceProposals.locationId,
      proposalKind:
        presslyPostgresOwnerSchemas.orders.orderSourceProposals.proposalKind,
      sourceRevisionAt:
        presslyPostgresOwnerSchemas.orders.orderSourceProposals
          .sourceRevisionAt,
      sourceRevisionHash:
        presslyPostgresOwnerSchemas.orders.orderSourceProposals
          .sourceRevisionHash,
      adapterVersion:
        presslyPostgresOwnerSchemas.orders.orderSourceProposals.adapterVersion,
      proposalSnapshot:
        presslyPostgresOwnerSchemas.orders.orderSourceProposals
          .proposalSnapshot,
      customerDisplayName:
        presslyPostgresOwnerSchemas.orders.orderSourceProposals
          .customerDisplayName,
      customerPhone:
        presslyPostgresOwnerSchemas.orders.orderSourceProposals.customerPhone,
      customerEmail:
        presslyPostgresOwnerSchemas.orders.orderSourceProposals.customerEmail,
      displayNumber:
        presslyPostgresOwnerSchemas.orders.orderSourceProposals.displayNumber,
      dueAt: presslyPostgresOwnerSchemas.orders.orderSourceProposals.dueAt,
      estimatedWeightLbs:
        presslyPostgresOwnerSchemas.orders.orderSourceProposals
          .estimatedWeightLbs,
      observedAt:
        presslyPostgresOwnerSchemas.orders.orderSourceProposals.observedAt,
      state: presslyPostgresOwnerSchemas.orders.orderSourceProposals.state,
      version: presslyPostgresOwnerSchemas.orders.orderSourceProposals.version,
      createdAt:
        presslyPostgresOwnerSchemas.orders.orderSourceProposals.createdAt,
    })
    .from(presslyPostgresOwnerSchemas.orders.orderSourceProposals);
  const tombstones = await database
    .select({
      source:
        presslyPostgresOwnerSchemas.orders.orderSourceTerminalTombstones.source,
      externalOrderId:
        presslyPostgresOwnerSchemas.orders.orderSourceTerminalTombstones
          .externalOrderId,
      proposalId:
        presslyPostgresOwnerSchemas.orders.orderSourceTerminalTombstones
          .proposalId,
      terminalCode:
        presslyPostgresOwnerSchemas.orders.orderSourceTerminalTombstones
          .terminalCode,
      sourceRevisionAt:
        presslyPostgresOwnerSchemas.orders.orderSourceTerminalTombstones
          .sourceRevisionAt,
      sourceRevisionHash:
        presslyPostgresOwnerSchemas.orders.orderSourceTerminalTombstones
          .sourceRevisionHash,
      adapterVersion:
        presslyPostgresOwnerSchemas.orders.orderSourceTerminalTombstones
          .adapterVersion,
      normalizedPayload:
        presslyPostgresOwnerSchemas.orders.orderSourceTerminalTombstones
          .normalizedPayload,
      observedAt:
        presslyPostgresOwnerSchemas.orders.orderSourceTerminalTombstones
          .observedAt,
      createdAt:
        presslyPostgresOwnerSchemas.orders.orderSourceTerminalTombstones
          .createdAt,
    })
    .from(presslyPostgresOwnerSchemas.orders.orderSourceTerminalTombstones);
  const transitions = await database
    .select({
      proposalId:
        presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions
          .proposalId,
      fromState:
        presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions
          .fromState,
      toState:
        presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions
          .toState,
      eventType:
        presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions
          .eventType,
      proposalVersion:
        presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions
          .proposalVersion,
      idempotencyKey:
        presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions
          .idempotencyKey,
      commandHash:
        presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions
          .commandHash,
      origin:
        presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions
          .origin,
      actorKind:
        presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions
          .actorKind,
      actorId:
        presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions
          .actorId,
      reasonCode:
        presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions
          .reasonCode,
      reasonNote:
        presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions
          .reasonNote,
      sourceTerminalCode:
        presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions
          .sourceTerminalCode,
      occurredAt:
        presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions
          .occurredAt,
    })
    .from(presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions);
  return { proposals, tombstones, transitions };
};

const resetDatabase = async (): Promise<void> => {
  await removeTransitionInsertFault(faultDatabase.db);
  await database.reset();
};

const capture = async (work: () => Promise<unknown>) => {
  try {
    return { returned: await work() };
  } catch (error) {
    const record = asRecord(error);
    return {
      thrown: {
        kind: record?.['kind'],
        code: record?.['code'],
        safeMessage: record?.['safeMessage'],
        status: record?.['status'],
      },
    };
  }
};

const outcomeName = (
  outcome: Awaited<
    ReturnType<
      ReturnType<
        typeof ordersSystem
      >['cells']['proposeIncomingOrder']['execute']
    >
  >,
): string =>
  outcome.kind === 'success' ? outcome.value.outcome : outcome.failure.code;

beforeAll(async () => {
  createDatabase();
  await database.check();
  await faultDatabase.check();
}, 180_000);
beforeEach(resetDatabase);
afterAll(async () => {
  await removeTransitionInsertFault(faultDatabase.db);
  await database.close();
  await faultDatabase.close();
  dropDatabase();
  expect(databaseExists()).toBe(false);
}, 60_000);

describe('Orders-system incoming intake conformance', () => {
  it('returns executable validation failures without durable effects', async () => {
    const invalidProposal = {
      ...proposeCommand('invalid-proposal'),
      source: ' ',
    };
    const invalidClose = {
      ...closeCommand('invalid-close'),
      revision: {
        ...closeCommand('invalid-close').revision,
        hash: 'not-a-hash',
      },
    };
    const system = ordersSystem();

    await expect(
      system.cells.proposeIncomingOrder.execute(invalidProposal),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'incoming_order_proposal_invalid' },
    });
    await expect(
      system.cells.closeIncomingOrderSource.execute(invalidClose),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'incoming_order_source_close_invalid' },
    });
    expect(await stateObservation(database.db)).toEqual({
      proposals: [],
      tombstones: [],
      transitions: [],
    });
  });

  it('preserves proposal creation, identity replay and exact stored evidence', async () => {
    const command = proposeCommand('create-replay-conformance');
    const system = ordersSystem();
    const first = await system.cells.proposeIncomingOrder.execute(command);
    const replay = await system.cells.proposeIncomingOrder.execute(command);

    expect(first).toMatchObject({
      kind: 'success',
      value: { outcome: 'proposed', version: 1, replayed: false },
    });
    expect(replay).toMatchObject({
      kind: 'success',
      value: { outcome: 'existing_proposal', version: 1, replayed: true },
    });
    const state = await stateObservation(database.db);
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0]).toMatchObject({
      source: command.source,
      externalOrderId: command.externalOrderId,
      locationId,
      proposalKind: 'submitted_order',
      sourceRevisionAt: command.revision.at,
      sourceRevisionHash: command.revision.hash,
      adapterVersion: command.revision.adapterVersion,
      observedAt: command.revision.observedAt,
      state: 'pending',
      version: 1,
    });
    expect(state.proposals[0]?.proposalSnapshot).toEqual({
      order: {
        ...command.snapshot,
        dueAt: command.snapshot.dueAt.toISOString(),
      },
      source: command.revision.normalizedPayload,
    });
    expect(state.tombstones).toEqual([]);
    expect(state.transitions).toEqual([]);
  });

  it('preserves canonical, tombstone and existing-proposal precedence', async () => {
    const externalOrderId = 'precedence-conformance';
    for (const fixture of ['proposal', 'tombstone', 'canonical'] as const) {
      await resetDatabase();
      await seedProposal(database.db, { externalOrderId });
      if (fixture !== 'proposal')
        await seedTombstone(database.db, externalOrderId);
      if (fixture === 'canonical')
        await seedCanonical(database.db, externalOrderId);

      const outcome = await ordersSystem().cells.proposeIncomingOrder.execute(
        proposeCommand(externalOrderId),
      );
      expect(outcome).toMatchObject({
        kind: 'success',
        value: {
          outcome:
            fixture === 'proposal'
              ? 'existing_proposal'
              : fixture === 'tombstone'
                ? 'source_closed'
                : 'existing_order',
          replayed: true,
        },
      });
    }
  });

  it('preserves tombstone-first suppression and retained evidence', async () => {
    const externalOrderId = 'tombstone-first-conformance';
    const system = ordersSystem();
    const closed = await system.cells.closeIncomingOrderSource.execute(
      closeCommand(externalOrderId),
    );
    const proposed = await system.cells.proposeIncomingOrder.execute(
      proposeCommand(externalOrderId),
    );

    expect(closed).toMatchObject({
      kind: 'success',
      value: { outcome: 'tombstoned', replayed: false },
    });
    expect(proposed).toMatchObject({
      kind: 'success',
      value: { outcome: 'source_closed', replayed: true },
    });
    expect(await stateObservation(database.db)).toMatchObject({
      proposals: [],
      tombstones: [{ externalOrderId, terminalCode: 'completed' }],
      transitions: [],
    });
  });

  it('preserves pending closure lifecycle and event bytes', async () => {
    const externalOrderId = 'pending-close-conformance';
    await seedProposal(database.db, { externalOrderId });
    const command = closeCommand(externalOrderId);
    const outcome =
      await ordersSystem().cells.closeIncomingOrderSource.execute(command);

    expect(outcome).toMatchObject({
      kind: 'success',
      value: {
        outcome: 'source_closed',
        proposalId,
        version: 2,
        canonical: null,
        replayed: false,
      },
    });
    expect(await stateObservation(database.db)).toMatchObject({
      proposals: [{ id: proposalId, state: 'source_closed', version: 2 }],
      tombstones: [{ externalOrderId, proposalId, terminalCode: 'completed' }],
      transitions: [
        {
          proposalId,
          fromState: 'pending',
          toState: 'source_closed',
          eventType: 'source_close',
          proposalVersion: 2,
          sourceTerminalCode: 'completed',
        },
      ],
    });
  });

  it('preserves source-closed, restored and canonical return behavior', async () => {
    const externalOrderId = 'terminal-state-conformance';
    const fixtures = [
      {
        state: 'source_closed' as const,
        version: 2,
        canonical: false,
        expected: 'already_source_closed',
      },
      {
        state: 'restored_pending' as const,
        version: 3,
        canonical: false,
        expected: 'already_decided',
      },
      {
        state: 'pending' as const,
        version: 1,
        canonical: true,
        expected: 'existing_order',
      },
    ] as const;
    for (const fixture of fixtures) {
      await resetDatabase();
      await seedProposal(database.db, { externalOrderId, ...fixture });
      await seedTombstone(database.db, externalOrderId);
      if (fixture.canonical) await seedCanonical(database.db, externalOrderId);

      const outcome =
        await ordersSystem().cells.closeIncomingOrderSource.execute(
          closeCommand(externalOrderId),
        );
      expect(outcome).toMatchObject({
        kind: 'success',
        value: {
          outcome: fixture.expected,
          canonical: fixture.canonical
            ? {
                orderId,
                fulfillmentId,
                locationId,
                releaseState: 'released',
              }
            : null,
          replayed: true,
        },
      });
    }
  });

  it('serializes duplicate proposal and closure races to one identity', async () => {
    const proposalExternalId = 'duplicate-proposal-race';
    const proposal = proposeCommand(proposalExternalId);
    const proposalOutcomes = await Promise.all([
      ordersSystem().cells.proposeIncomingOrder.execute(proposal),
      ordersSystem().cells.proposeIncomingOrder.execute(proposal),
    ]);
    expect(proposalOutcomes.map(outcomeName).sort()).toEqual([
      'existing_proposal',
      'proposed',
    ]);
    let state = await stateObservation(database.db);
    expect(state.proposals).toHaveLength(1);
    expect(state.tombstones).toEqual([]);
    expect(state.transitions).toEqual([]);

    await resetDatabase();
    const closeExternalId = 'duplicate-close-race';
    await seedProposal(database.db, { externalOrderId: closeExternalId });
    const close = closeCommand(closeExternalId);
    const closeOutcomes = await Promise.all([
      ordersSystem().cells.closeIncomingOrderSource.execute(close),
      ordersSystem().cells.closeIncomingOrderSource.execute(close),
    ]);
    expect(
      closeOutcomes
        .map((outcome) =>
          outcome.kind === 'success'
            ? outcome.value.outcome
            : outcome.failure.code,
        )
        .sort(),
    ).toEqual(['already_source_closed', 'source_closed']);
    state = await stateObservation(database.db);
    expect(state.proposals).toMatchObject([
      { externalOrderId: closeExternalId, state: 'source_closed', version: 2 },
    ]);
    expect(state.tombstones).toHaveLength(1);
    expect(state.transitions).toHaveLength(1);
  });

  it('rolls back tombstone and proposal mutation when transition insertion fails', async () => {
    const externalOrderId = 'rollback-conformance';
    await seedProposal(database.db, { externalOrderId });
    const command = closeCommand(externalOrderId);
    await installTransitionInsertFault(faultDatabase.db);

    let captured: unknown;
    try {
      captured = await capture(() =>
        ordersSystem().cells.closeIncomingOrderSource.execute(command),
      );
    } finally {
      await removeTransitionInsertFault(faultDatabase.db);
    }

    expect(captured).toMatchObject({
      thrown: {
        kind: 'DatabaseError',
        code: 'incoming_order_source_close_failed',
        status: 503,
      },
    });
    expect(await stateObservation(database.db)).toMatchObject({
      proposals: [{ state: 'pending', version: 1 }],
      tombstones: [],
      transitions: [],
    });
  });
});
