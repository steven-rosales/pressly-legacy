import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import { makeCustomersSystem } from '@pressly/customers-system/testing/assembly';
import type { CreateCustomerCommand } from '@pressly/customers-system/operations/profiles/create-customer/types';
import type { GetCustomerQuery } from '@pressly/customers-system/operations/profiles/get-customer/types';
import type { ListCustomersQuery } from '@pressly/customers-system/operations/profiles/list-customers/types';
import type { ResolveExactSourceCustomerCommand } from '@pressly/customers-system/operations/sources/resolve-exact-source-customer/types';
import type { UpdateCustomerCommand } from '@pressly/customers-system/operations/profiles/update-customer/types';
import { type TestDatabaseRuntime } from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  normalizeCustomerOutcome,
  observeCustomerState,
} from '../src/public.ts';
import { makeCustomerTestDatabase } from './postgres-database.fixture.ts';

const tableNames = [
  'user_command_receipts',
  'user_consents',
  'user_duplicate_candidates',
  'user_field_authorities',
  'user_source_snapshots',
  'user_source_links',
  'users',
] as const;

const databaseFixture = makeCustomerTestDatabase({
  prefix: 'pressly_customers_target_conformance',
  tableNames,
  maxConnections: 6,
});
const database = databaseFixture.runtime;

const now = new Date('2026-08-22T17:00:00.000Z');
const businessId = '72000000-0000-4000-8000-000000000001';
const otherBusinessId = '72000000-0000-4000-8000-000000000002';
const context = {
  origin: 'pressly_dashboard',
  principal: { kind: 'human', id: 'identity-1' },
} as const;
const emptyProfile = {
  firstName: null,
  lastName: null,
  businessName: null,
  phone: null,
  email: null,
};

type CustomerRunner = Readonly<{
  create: (command: CreateCustomerCommand) => Promise<unknown>;
  update: (command: UpdateCustomerCommand) => Promise<unknown>;
  get: (query: GetCustomerQuery) => Promise<unknown>;
  list: (query: ListCustomersQuery) => Promise<unknown>;
  resolve: (command: ResolveExactSourceCustomerCommand) => Promise<unknown>;
}>;

const targetRunner = (database: TestDatabaseRuntime): CustomerRunner => {
  const system = makeCustomersSystem({
    schema: presslyPostgresOwnerSchemas.customers,
    db: database.db,
    clock: { now: () => now },
  });
  return {
    create: system.cells.createCustomer.execute,
    update: system.cells.updateCustomer.execute,
    get: system.cells.getCustomer.execute,
    list: system.cells.listCustomers.execute,
    resolve: system.capabilities.resolveExactSourceCustomerV1.execute,
  };
};

beforeAll(async () => {
  await databaseFixture.setup();
});
beforeEach(async () => {
  await database.reset();
});
afterAll(async () => {
  await databaseFixture.teardown();
});

const successfulUserId = (outcome: unknown): string => {
  if (outcome === null || typeof outcome !== 'object') return 'missing';
  const container =
    ('tag' in outcome && outcome.tag === 'ok' && 'value' in outcome) ||
    ('kind' in outcome && outcome.kind === 'success' && 'value' in outcome)
      ? outcome.value
      : null;
  if (
    container !== null &&
    typeof container === 'object' &&
    'customer' in container &&
    container.customer !== null &&
    typeof container.customer === 'object' &&
    'customerId' in container.customer &&
    typeof container.customer.customerId === 'string'
  )
    return container.customer.customerId;
  return container !== null &&
    typeof container === 'object' &&
    'userId' in container &&
    typeof container.userId === 'string'
    ? container.userId
    : 'missing';
};

const captureError = async (action: () => Promise<unknown>) => {
  try {
    await action();
    return { unexpected: 'success' };
  } catch (error) {
    if (error === null || typeof error !== 'object')
      return { unexpected: error };
    return Object.fromEntries(
      ['tag', 'kind', 'code', 'message', 'safeMessage', 'status'].map((key) => [
        key,
        Reflect.get(error, key),
      ]),
    );
  }
};

const runProfileScenario = async (
  database: TestDatabaseRuntime,
  runner: CustomerRunner,
) => {
  const firstCommand: CreateCustomerCommand = {
    businessId,
    idempotencyKey: 'create-customer-1',
    context,
    profile: {
      ...emptyProfile,
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '+12015550101',
    },
  };
  const first = await runner.create(firstCommand);
  const replay = await runner.create(firstCommand);
  const idempotencyConflict = await runner.create({
    ...firstCommand,
    profile: { ...firstCommand.profile, firstName: 'Different' },
  });
  const second = await runner.create({
    businessId,
    idempotencyKey: 'create-customer-2',
    context,
    profile: {
      ...emptyProfile,
      firstName: 'Grace',
      lastName: 'Hopper',
      phone: '+12015550101',
    },
  });
  const firstUserId = successfulUserId(first);
  const secondUserId = successfulUserId(second);
  const update = await runner.update({
    businessId,
    idempotencyKey: 'update-customer-1',
    context,
    userId: secondUserId,
    expectedVersion: 1,
    changes: { email: 'grace@example.com', active: false },
  });
  const stale = await runner.update({
    businessId,
    idempotencyKey: 'update-customer-2',
    context,
    userId: secondUserId,
    expectedVersion: 1,
    changes: { email: 'other@example.com' },
  });
  const get = await runner.get({ businessId, userId: secondUserId });
  const crossBusinessGet = await runner.get({
    businessId: otherBusinessId,
    userId: secondUserId,
  });
  const list = await runner.list({
    businessId,
    query: '  grace  ',
    active: false,
    limit: 50,
    cursor: null,
  });
  const invalidCursor = await runner.list({
    businessId,
    query: null,
    active: null,
    limit: 50,
    cursor: 'invalid-cursor',
  });
  const aliases = new Map([
    [firstUserId, '$customer-1'],
    [secondUserId, '$customer-2'],
  ]);

  return {
    outcomes: [
      first,
      replay,
      idempotencyConflict,
      second,
      update,
      stale,
      get,
      crossBusinessGet,
      list,
      invalidCursor,
    ].map((outcome) => normalizeCustomerOutcome(outcome, aliases)),
    state: await observeCustomerState(database.db, aliases),
  };
};

const sourceCommand = (
  input: Readonly<{
    businessId?: string;
    externalUserId?: string;
    idempotencyKey?: string;
    hash?: string;
  }> = {},
): ResolveExactSourceCustomerCommand => ({
  businessId: input.businessId ?? businessId,
  source: 'cents',
  externalUserId: input.externalUserId ?? 'source-customer-1',
  profile: {
    ...emptyProfile,
    firstName: 'Ada',
    phone: '+12015550101',
  },
  revision: {
    at: now,
    hash: input.hash ?? 'a'.repeat(64),
    adapterVersion: 'cents-v1',
    observedAt: now,
    normalizedPayload: { customer: { id: 'source-customer-1' } },
  },
  idempotencyKey: input.idempotencyKey ?? 'proposal-1:customer',
  context,
  now,
});

const runSourceScenario = async (
  database: TestDatabaseRuntime,
  runner: CustomerRunner,
) => {
  const first = await runner.resolve(sourceCommand());
  const replay = await runner.resolve(sourceCommand());
  const businessConflict = await runner.resolve(
    sourceCommand({ businessId: otherBusinessId }),
  );
  const concurrentCommand = sourceCommand({
    externalUserId: 'source-customer-concurrent',
    idempotencyKey: 'proposal-concurrent:customer',
  });
  const concurrent = await Promise.all([
    runner.resolve(concurrentCommand),
    runner.resolve(concurrentCommand),
  ]);
  const rollbackError = await captureError(() =>
    runner.resolve(
      sourceCommand({
        externalUserId: 'source-customer-invalid',
        idempotencyKey: 'proposal-invalid:customer',
        hash: 'invalid-hash',
      }),
    ),
  );
  const userId = successfulUserId(first);
  const concurrentUserId = successfulUserId(concurrent[0]);
  const aliases = new Map([
    [userId, '$source-customer'],
    [concurrentUserId, '$source-customer-concurrent'],
  ]);
  const normalizedConcurrent = concurrent
    .map((outcome) => normalizeCustomerOutcome(outcome, aliases))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );

  return {
    outcomes: [first, replay, businessConflict].map((outcome) =>
      normalizeCustomerOutcome(outcome, aliases),
    ),
    concurrent: normalizedConcurrent,
    rollbackError,
    state: await observeCustomerState(database.db, aliases),
  };
};

describe('Customers-system PostgreSQL conformance', () => {
  it('pins create, update, read, idempotency, version, audit and duplicate behavior', async () => {
    const target = await runProfileScenario(database, targetRunner(database));
    expect(target.outcomes).toEqual([
      {
        kind: 'success',
        value: { userId: '$customer-1', version: 1, replayed: false },
      },
      {
        kind: 'success',
        value: { userId: '$customer-1', version: 1, replayed: true },
      },
      {
        kind: 'failure',
        failure: { kind: 'conflict', code: 'user_idempotency_conflict' },
      },
      {
        kind: 'success',
        value: { userId: '$customer-2', version: 1, replayed: false },
      },
      {
        kind: 'success',
        value: { userId: '$customer-2', version: 2, replayed: false },
      },
      {
        kind: 'failure',
        failure: { kind: 'conflict', code: 'user_version_conflict' },
      },
      {
        kind: 'success',
        value: expect.objectContaining({
          id: '$customer-2',
          version: 2,
          active: false,
          displayName: 'Grace Hopper',
          possibleDuplicateCount: 1,
        }),
      },
      {
        kind: 'failure',
        failure: { kind: 'not_found', code: 'user_not_found' },
      },
      {
        kind: 'success',
        value: {
          items: [
            expect.objectContaining({
              id: '$customer-2',
              version: 2,
              active: false,
              displayName: 'Grace Hopper',
              possibleDuplicateCount: 1,
            }),
          ],
          nextCursor: null,
        },
      },
      {
        kind: 'failure',
        failure: { kind: 'validation', code: 'user_cursor_invalid' },
      },
    ]);
    expect(target.state.customers).toEqual([
      expect.objectContaining({
        id: '$customer-1',
        businessId,
        version: 1,
        active: true,
        firstName: 'Ada',
        lastName: 'Lovelace',
        phone: '+12015550101',
      }),
      expect.objectContaining({
        id: '$customer-2',
        businessId,
        version: 2,
        active: false,
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
      }),
    ]);
    expect(target.state.fieldAuthorities).toHaveLength(10);
    expect(
      target.state.fieldAuthorities.every(
        (authority) =>
          Reflect.get(authority as object, 'authority') === 'pressly',
      ),
    ).toBe(true);
    expect(target.state.duplicateCandidates).toEqual([
      expect.objectContaining({
        userId: '$customer-2',
        candidateUserId: '$customer-1',
        reason: 'same_phone',
        status: 'open',
      }),
    ]);
    expect(
      target.state.commandReceipts.map((receipt) =>
        Reflect.get(receipt as object, 'idempotencyKey'),
      ),
    ).toEqual(['create-customer-1', 'create-customer-2', 'update-customer-1']);
    expect(target.state.sourceEvidence).toEqual([]);
  });

  it('pins exact-source resolution, business conflict and atomic rollback', async () => {
    const target = await runSourceScenario(database, targetRunner(database));
    expect(target.outcomes).toEqual([
      {
        kind: 'success',
        value: {
          customer: expect.objectContaining({
            customerId: '$source-customer',
            businessId,
            version: 1,
            active: true,
            profile: expect.objectContaining({
              firstName: 'Ada',
              phone: '+12015550101',
            }),
          }),
          created: true,
        },
      },
      {
        kind: 'success',
        value: {
          customer: expect.objectContaining({
            customerId: '$source-customer',
            businessId,
            version: 1,
          }),
          created: false,
        },
      },
      {
        kind: 'failure',
        failure: {
          kind: 'conflict',
          code: 'canonical_source_user_business_conflict',
        },
      },
    ]);
    expect(target.concurrent).toEqual([
      {
        kind: 'success',
        value: {
          customer: expect.objectContaining({
            customerId: '$source-customer-concurrent',
            businessId,
            version: 1,
          }),
          created: false,
        },
      },
      {
        kind: 'success',
        value: {
          customer: expect.objectContaining({
            customerId: '$source-customer-concurrent',
            businessId,
            version: 1,
          }),
          created: true,
        },
      },
    ]);
    expect(target.rollbackError).toEqual({
      tag: 'AppError',
      kind: 'DatabaseError',
      code: 'canonical_source_user_resolution_failed',
      message: 'The canonical source user could not be resolved.',
      safeMessage: 'The canonical source user could not be resolved.',
      status: 503,
    });
    expect(target.state.customers).toEqual([
      expect.objectContaining({
        id: '$source-customer',
        businessId,
        version: 1,
        active: true,
        firstName: 'Ada',
      }),
      expect.objectContaining({
        id: '$source-customer-concurrent',
        businessId,
        version: 1,
        active: true,
        firstName: 'Ada',
      }),
    ]);
    expect(target.state.fieldAuthorities).toHaveLength(10);
    expect(target.state.duplicateCandidates).toEqual([
      expect.objectContaining({
        userId: '$source-customer-concurrent',
        candidateUserId: '$source-customer',
        reason: 'same_phone',
        status: 'open',
      }),
    ]);
    expect(
      target.state.commandReceipts.map((receipt) =>
        Reflect.get(receipt as object, 'idempotencyKey'),
      ),
    ).toEqual(['proposal-1:customer', 'proposal-concurrent:customer']);
    expect(target.state.sourceEvidence).toHaveLength(2);
    expect(
      target.state.sourceEvidence.map((evidence) => ({
        externalUserId: Reflect.get(evidence as object, 'externalUserId'),
        sourceRevisionHash: Reflect.get(
          evidence as object,
          'sourceRevisionHash',
        ),
      })),
    ).toEqual([
      {
        externalUserId: 'source-customer-1',
        sourceRevisionHash: 'a'.repeat(64),
      },
      {
        externalUserId: 'source-customer-concurrent',
        sourceRevisionHash: 'a'.repeat(64),
      },
    ]);
  });
});
