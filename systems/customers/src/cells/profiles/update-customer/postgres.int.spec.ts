import { eq, sql } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
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
import { updateCustomerCellDeclaration } from './cell.ts';

registerCustomersPostgresLifecycle();

const createCustomer = async () => {
  const system = makeCustomersPostgresSystem();
  const outcome = await system.cells.createCustomer.execute({
    businessId: customersBusinessId,
    idempotencyKey: 'create-before-update',
    context: customersCommandContext,
    profile: emptyCustomerProfile,
  });
  expect(outcome.kind).toBe('success');
  if (outcome.kind === 'failure') return null;
  return { system, userId: outcome.value.userId };
};

const updateCommand = (userId: string) => ({
  businessId: customersBusinessId,
  idempotencyKey: 'update-customer-1',
  context: customersCommandContext,
  userId,
  expectedVersion: 1,
  changes: { phone: '+12015550109', active: false },
});

proveOperation({
  operationId: 'customers.update-customer.v1',
  declaration: updateCustomerCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commit_success_and_expected_rejection',
      proves: ['postgres-commit', 'expected-rejection-no-partial-write'],
      run: async () => {
        const fixture = await createCustomer();
        if (fixture === null) return;
        const command = updateCommand(fixture.userId);
        const updated =
          await fixture.system.cells.updateCustomer.execute(command);
        const stale = await fixture.system.cells.updateCustomer.execute({
          ...command,
          idempotencyKey: 'update-customer-stale',
        });

        expect(updated).toMatchObject({
          kind: 'success',
          value: { version: 2, replayed: false },
        });
        expect(stale).toEqual({
          kind: 'failure',
          failure: { kind: 'conflict', code: 'user_version_conflict' },
        });
        await expect(
          customersPostgresDatabase.db
            .select({
              version: customers.users.version,
              phone: customers.users.phone,
              active: customers.users.active,
            })
            .from(customers.users)
            .where(eq(customers.users.id, fixture.userId)),
        ).resolves.toEqual([
          { version: 2, phone: '+12015550109', active: false },
        ]);
      },
    },

    {
      name: 'not_found_rejection_has_no_customer_or_receipt_side_effect',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const execute =
          makeCustomersPostgresSystem().cells.updateCustomer.execute;

        await expect(
          execute(updateCommand('71000000-0000-4000-8000-000000000404')),
        ).resolves.toEqual({
          kind: 'failure',
          failure: { kind: 'not_found', code: 'user_not_found' },
        });
        await expect(
          customersPostgresDatabase.db.select().from(customers.users),
        ).resolves.toEqual([]);
        await expect(
          customersPostgresDatabase.db
            .select()
            .from(customers.userCommandReceipts),
        ).resolves.toEqual([]);
      },
    },

    {
      name: 'same_payload_replay_and_divergent_key_conflict',
      proves: ['same-payload-replay', 'divergent-key-conflict'],
      run: async () => {
        const fixture = await createCustomer();
        if (fixture === null) return;
        const command = updateCommand(fixture.userId);
        const first =
          await fixture.system.cells.updateCustomer.execute(command);
        const replay =
          await fixture.system.cells.updateCustomer.execute(command);
        const conflict = await fixture.system.cells.updateCustomer.execute({
          ...command,
          changes: { phone: '+12015550110' },
        });

        expect(first).toMatchObject({
          kind: 'success',
          value: { version: 2, replayed: false },
        });
        expect(replay).toMatchObject({
          kind: 'success',
          value: { version: 2, replayed: true },
        });
        expect(conflict).toEqual({
          kind: 'failure',
          failure: { kind: 'conflict', code: 'user_idempotency_conflict' },
        });
        await expect(
          customersPostgresDatabase.db
            .select({ version: customers.users.version })
            .from(customers.users)
            .where(eq(customers.users.id, fixture.userId)),
        ).resolves.toEqual([{ version: 2 }]);
      },
    },

    {
      name: 'optimistic_concurrency_race',
      proves: ['same-key-concurrency', 'declared-concurrency-race'],
      run: async () => {
        const fixture = await createCustomer();
        if (fixture === null) return;
        const base = updateCommand(fixture.userId);
        const outcomes = await Promise.all([
          fixture.system.cells.updateCustomer.execute({
            ...base,
            idempotencyKey: 'update-concurrent-1',
            changes: { phone: '+12015550111' },
          }),
          fixture.system.cells.updateCustomer.execute({
            ...base,
            idempotencyKey: 'update-concurrent-2',
            changes: { phone: '+12015550112' },
          }),
        ]);

        expect(
          outcomes.filter((outcome) => outcome.kind === 'success'),
        ).toHaveLength(1);
        expect(
          outcomes.filter(
            (outcome) =>
              outcome.kind === 'failure' &&
              outcome.failure.code === 'user_version_conflict',
          ),
        ).toHaveLength(1);
        await expect(
          customersPostgresDatabase.db
            .select({ version: customers.users.version })
            .from(customers.users)
            .where(eq(customers.users.id, fixture.userId)),
        ).resolves.toEqual([{ version: 2 }]);
      },
    },

    {
      name: 'unexpected_failure_rollback',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        const fixture = await createCustomer();
        if (fixture === null) return;
        await customersPostgresFaultDatabase.execute(sql`
      create function customers_reject_update_receipt()
      returns trigger language plpgsql as $$
      begin
        raise exception 'Customer update receipt fault';
      end;
      $$
    `);
        await customersPostgresFaultDatabase.execute(sql`
      create trigger customers_update_receipt_fault
      before insert on user_command_receipts
      for each row execute function customers_reject_update_receipt()
    `);

        try {
          await expect(
            fixture.system.cells.updateCustomer.execute(
              updateCommand(fixture.userId),
            ),
          ).rejects.toMatchObject({
            tag: 'AppError',
            kind: 'DatabaseError',
            code: 'user_update_failed',
          });
          await expect(
            customersPostgresDatabase.db
              .select({
                version: customers.users.version,
                phone: customers.users.phone,
                active: customers.users.active,
              })
              .from(customers.users)
              .where(eq(customers.users.id, fixture.userId)),
          ).resolves.toEqual([{ version: 1, phone: null, active: true }]);
        } finally {
          await customersPostgresFaultDatabase.execute(
            sql`drop trigger if exists customers_update_receipt_fault on user_command_receipts`,
          );
          await customersPostgresFaultDatabase.execute(
            sql`drop function if exists customers_reject_update_receipt()`,
          );
        }
      },
    },
  ],
});
