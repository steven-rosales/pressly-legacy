import { proveOperation } from '@pressly/testkit/operation-proof';
import { sql } from '@pressly/postgres/query';
import { expect } from 'vitest';
import {
  customersBusinessId,
  customersCommandContext,
  customersPostgresDatabase,
  customersPostgresFaultDatabase,
  emptyCustomerProfile,
  makeCustomersPostgresSystem,
  registerCustomersPostgresLifecycle,
} from '../../../testing/customers-postgres.fixture.ts';
import { customersTestSchema as customers } from '../../../testing/schema.ts';
import { createCustomerCellDeclaration } from './cell.ts';

registerCustomersPostgresLifecycle();

const command = {
  businessId: customersBusinessId,
  idempotencyKey: 'create-customer-1',
  context: customersCommandContext,
  profile: {
    ...emptyCustomerProfile,
    firstName: 'Ada',
    phone: '+12015550101',
  },
};

proveOperation({
  operationId: 'customers.create-customer.v1',
  declaration: createCustomerCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commit_success_and_same_payload_replay',
      proves: ['postgres-commit', 'same-payload-replay'],
      run: async () => {
        const execute =
          makeCustomersPostgresSystem().cells.createCustomer.execute;
        const first = await execute(command);
        const replay = await execute(command);

        expect(first).toMatchObject({
          kind: 'success',
          value: { version: 1, replayed: false },
        });
        expect(replay).toMatchObject({
          kind: 'success',
          value: { version: 1, replayed: true },
        });
        await expect(
          customersPostgresDatabase.db.select().from(customers.users),
        ).resolves.toHaveLength(1);
        await expect(
          customersPostgresDatabase.db
            .select({
              origin: customers.userCommandReceipts.origin,
              actorKind: customers.userCommandReceipts.actorKind,
              actorId: customers.userCommandReceipts.actorId,
            })
            .from(customers.userCommandReceipts),
        ).resolves.toEqual([
          {
            origin: 'pressly_dashboard',
            actorKind: 'human',
            actorId: 'identity-1',
          },
        ]);
      },
    },

    {
      name: 'divergent_key_conflict_no_partial_write',
      proves: ['divergent-key-conflict', 'expected-rejection-no-partial-write'],
      run: async () => {
        const execute =
          makeCustomersPostgresSystem().cells.createCustomer.execute;
        await execute(command);
        const conflict = await execute({
          ...command,
          profile: { ...command.profile, firstName: 'Different' },
        });

        expect(conflict).toEqual({
          kind: 'failure',
          failure: { kind: 'conflict', code: 'user_idempotency_conflict' },
        });
        await expect(
          customersPostgresDatabase.db.select().from(customers.users),
        ).resolves.toHaveLength(1);
        await expect(
          customersPostgresDatabase.db
            .select()
            .from(customers.userCommandReceipts),
        ).resolves.toHaveLength(1);
      },
    },

    {
      name: 'same_key_concurrency',
      proves: ['same-key-concurrency', 'declared-concurrency-race'],
      run: async () => {
        const execute =
          makeCustomersPostgresSystem().cells.createCustomer.execute;
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
            outcome.kind === 'success' ? outcome.value.replayed : null,
          ),
        ).toEqual(expect.arrayContaining([false, true]));
        await expect(
          customersPostgresDatabase.db.select().from(customers.users),
        ).resolves.toHaveLength(1);
        await expect(
          customersPostgresDatabase.db
            .select()
            .from(customers.userCommandReceipts),
        ).resolves.toHaveLength(1);
      },
    },

    {
      name: 'unexpected_failure_rollback',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        await customersPostgresFaultDatabase.execute(sql`
          create function customers_reject_create_receipt()
          returns trigger language plpgsql as $$
          begin
            raise exception 'Customer create receipt fault';
          end;
          $$
        `);
        await customersPostgresFaultDatabase.execute(sql`
          create trigger customers_create_receipt_fault
          before insert on user_command_receipts
          for each row execute function customers_reject_create_receipt()
        `);

        try {
          const execute =
            makeCustomersPostgresSystem().cells.createCustomer.execute;
          await expect(execute(command)).rejects.toMatchObject({
            tag: 'AppError',
            kind: 'DatabaseError',
            code: 'user_create_failed',
          });
          await expect(
            customersPostgresDatabase.db.select().from(customers.users),
          ).resolves.toEqual([]);
          await expect(
            customersPostgresDatabase.db
              .select()
              .from(customers.userCommandReceipts),
          ).resolves.toEqual([]);
        } finally {
          await customersPostgresFaultDatabase.execute(
            sql`drop trigger if exists customers_create_receipt_fault on user_command_receipts`,
          );
          await customersPostgresFaultDatabase.execute(
            sql`drop function if exists customers_reject_create_receipt()`,
          );
        }
      },
    },
  ],
});
