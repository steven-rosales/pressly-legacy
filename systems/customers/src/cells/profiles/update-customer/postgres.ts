import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, eq } from '@pressly/postgres/query';
import {
  loadCustomerCommandReceipt,
  lockCustomerPersistenceKey,
  mapStoredCustomer,
  saveCustomerCommandReceipt,
  signalPossibleDuplicateContacts,
  type CustomerRecordSchema,
} from '../../../postgres/customer-record.postgres.ts';
import type {
  UpdateCustomerRepository,
  UpdateCustomerTransaction,
} from './types.ts';

const loadCustomer = async (
  transaction: PostgresExecutor,
  customers: Pick<CustomerRecordSchema, 'users'>,
  businessId: string,
  userId: string,
) => {
  const [row] = await transaction
    .select()
    .from(customers.users)
    .where(
      and(
        eq(customers.users.businessId, businessId),
        eq(customers.users.id, userId),
      ),
    )
    .limit(1);
  return row === undefined ? null : mapStoredCustomer(row);
};

const operations = (
  transaction: PostgresExecutor,
  customers: CustomerRecordSchema,
): UpdateCustomerTransaction => ({
  lockCommand: (key) =>
    lockCustomerPersistenceKey(transaction, `users:command:${key}`),
  loadCommandReceipt: (key) =>
    loadCustomerCommandReceipt(transaction, customers, key),
  saveCommandReceipt: (input) =>
    saveCustomerCommandReceipt(transaction, customers, input),
  lockCustomer: (businessId, userId) =>
    lockCustomerPersistenceKey(transaction, `users:${businessId}:id:${userId}`),
  loadCustomer: (businessId, userId) =>
    loadCustomer(transaction, customers, businessId, userId),
  updateCustomer: async (input) => {
    await transaction
      .update(customers.users)
      .set({
        ...input.changes,
        version: input.nextVersion,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(customers.users.businessId, input.businessId),
          eq(customers.users.id, input.userId),
        ),
      );

    for (const fieldName of input.authorityFields)
      await transaction
        .insert(customers.userFieldAuthorities)
        .values({
          userId: input.userId,
          fieldName,
          authority: 'pressly',
          source: null,
          updatedAt: input.now,
        })
        .onConflictDoUpdate({
          target: [
            customers.userFieldAuthorities.userId,
            customers.userFieldAuthorities.fieldName,
          ],
          set: { authority: 'pressly', source: null, updatedAt: input.now },
        });
  },
  signalDuplicateContacts: (input) =>
    signalPossibleDuplicateContacts(transaction, customers, input),
});

export const makeUpdateCustomerPostgresRepository = (
  database: PostgresDatabase,
  customers: CustomerRecordSchema,
): UpdateCustomerRepository => ({
  transaction: (work) =>
    database.transaction((transaction) =>
      work(operations(transaction, customers)),
    ),
});
