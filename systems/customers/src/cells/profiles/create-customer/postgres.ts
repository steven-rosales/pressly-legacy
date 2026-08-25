import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import {
  insertStoredCustomer,
  loadCustomerCommandReceipt,
  lockCustomerPersistenceKey,
  saveCustomerCommandReceipt,
  signalPossibleDuplicateContacts,
  type CustomerRecordSchema,
} from '../../../postgres/customer-record.postgres.ts';
import type {
  CreateCustomerRepository,
  CreateCustomerTransaction,
} from './types.ts';

const operations = (
  transaction: PostgresExecutor,
  customers: CustomerRecordSchema,
): CreateCustomerTransaction => ({
  lockCommand: (key) =>
    lockCustomerPersistenceKey(transaction, `users:command:${key}`),
  loadCommandReceipt: (key) =>
    loadCustomerCommandReceipt(transaction, customers, key),
  createCustomer: (input) =>
    insertStoredCustomer(transaction, customers, input),
  saveCommandReceipt: (input) =>
    saveCustomerCommandReceipt(transaction, customers, input),
  signalDuplicateContacts: (input) =>
    signalPossibleDuplicateContacts(transaction, customers, input),
});

export const makeCreateCustomerPostgresRepository = (
  database: PostgresDatabase,
  customers: CustomerRecordSchema,
): CreateCustomerRepository => ({
  transaction: (work) =>
    database.transaction((transaction) =>
      work(operations(transaction, customers)),
    ),
});
