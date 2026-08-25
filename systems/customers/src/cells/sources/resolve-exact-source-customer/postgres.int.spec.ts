import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  customersOtherBusinessId,
  customersPostgresDatabase,
  makeCustomersPostgresSystem,
  makeSourceCustomerCommand,
  registerCustomersPostgresLifecycle,
} from '../../../testing/customers-postgres.fixture.ts';
import { customersTestSchema as customers } from '../../../testing/schema.ts';
import { resolveExactSourceCustomerCellDeclaration } from './cell.ts';

registerCustomersPostgresLifecycle();

const execute = (command: ReturnType<typeof makeSourceCustomerCommand>) =>
  makeCustomersPostgresSystem().capabilities.resolveExactSourceCustomerV1.execute(
    command,
  );

proveOperation({
  operationId: 'customers.resolve-exact-source-customer.v1',
  declaration: resolveExactSourceCustomerCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commit_success_replay_and_business_conflict',
      proves: [
        'postgres-commit',
        'same-payload-replay',
        'divergent-key-conflict',
        'expected-rejection-no-partial-write',
      ],
      run: async () => {
        const first = await execute(makeSourceCustomerCommand());
        const replay = await execute(makeSourceCustomerCommand());
        const conflict = await execute(
          makeSourceCustomerCommand({ businessId: customersOtherBusinessId }),
        );

        expect(first).toMatchObject({
          kind: 'success',
          value: { created: true },
        });
        expect(replay).toMatchObject({
          kind: 'success',
          value: { created: false },
        });
        expect(conflict).toEqual({
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'canonical_source_user_business_conflict',
          },
        });
        await expect(
          customersPostgresDatabase.db.select().from(customers.users),
        ).resolves.toHaveLength(1);
        await expect(
          customersPostgresDatabase.db.select().from(customers.userSourceLinks),
        ).resolves.toHaveLength(1);
        await expect(
          customersPostgresDatabase.db
            .select()
            .from(customers.userSourceSnapshots),
        ).resolves.toHaveLength(1);
      },
    },

    {
      name: 'idempotency_conflict_does_not_create_a_second_source_customer',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const firstCommand = makeSourceCustomerCommand({
          externalUserId: 'customer-idempotency-first',
          idempotencyKey: 'shared-customer-command',
        });
        const secondSourceCommand = makeSourceCustomerCommand({
          externalUserId: 'customer-idempotency-second',
          idempotencyKey: 'shared-customer-command',
        });
        const conflictingCommand = {
          ...secondSourceCommand,
          profile: { ...secondSourceCommand.profile, firstName: 'Grace' },
        };

        await expect(execute(firstCommand)).resolves.toMatchObject({
          kind: 'success',
          value: { created: true },
        });
        const before = {
          users: await customersPostgresDatabase.db
            .select()
            .from(customers.users),
          links: await customersPostgresDatabase.db
            .select()
            .from(customers.userSourceLinks),
          snapshots: await customersPostgresDatabase.db
            .select()
            .from(customers.userSourceSnapshots),
          receipts: await customersPostgresDatabase.db
            .select()
            .from(customers.userCommandReceipts),
        };

        await expect(execute(conflictingCommand)).resolves.toEqual({
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'user_idempotency_conflict',
          },
        });

        await expect(
          customersPostgresDatabase.db.select().from(customers.users),
        ).resolves.toEqual(before.users);
        await expect(
          customersPostgresDatabase.db.select().from(customers.userSourceLinks),
        ).resolves.toEqual(before.links);
        await expect(
          customersPostgresDatabase.db
            .select()
            .from(customers.userSourceSnapshots),
        ).resolves.toEqual(before.snapshots);
        await expect(
          customersPostgresDatabase.db
            .select()
            .from(customers.userCommandReceipts),
        ).resolves.toEqual(before.receipts);
      },
    },

    {
      name: 'same_source_concurrency',
      proves: ['same-key-concurrency', 'declared-concurrency-race'],
      run: async () => {
        const command = makeSourceCustomerCommand({
          externalUserId: 'customer-concurrent',
          idempotencyKey: 'proposal-concurrent:customer',
        });
        const outcomes = await Promise.all([
          execute(command),
          execute(command),
        ]);

        expect(outcomes.map((outcome) => outcome.kind)).toEqual([
          'success',
          'success',
        ]);
        expect(
          outcomes.map((outcome) =>
            outcome.kind === 'success' ? outcome.value.created : null,
          ),
        ).toEqual(expect.arrayContaining([true, false]));
        const resolvedIds = outcomes.flatMap((outcome) =>
          outcome.kind === 'success' ? [outcome.value.customer.customerId] : [],
        );
        expect(new Set(resolvedIds).size).toBe(1);
        await expect(
          customersPostgresDatabase.db.select().from(customers.users),
        ).resolves.toHaveLength(1);
        await expect(
          customersPostgresDatabase.db.select().from(customers.userSourceLinks),
        ).resolves.toHaveLength(1);
      },
    },

    {
      name: 'unexpected_failure_rollback',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        await expect(
          execute(makeSourceCustomerCommand({ hash: 'invalid-hash' })),
        ).rejects.toMatchObject({
          tag: 'AppError',
          kind: 'DatabaseError',
          code: 'canonical_source_user_resolution_failed',
        });

        await expect(
          customersPostgresDatabase.db.select().from(customers.users),
        ).resolves.toEqual([]);
        await expect(
          customersPostgresDatabase.db
            .select()
            .from(customers.userCommandReceipts),
        ).resolves.toEqual([]);
        await expect(
          customersPostgresDatabase.db.select().from(customers.userSourceLinks),
        ).resolves.toEqual([]);
      },
    },
  ],
});
