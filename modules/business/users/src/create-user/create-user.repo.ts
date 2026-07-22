import type { Database, DatabaseExecutor } from '@pressly/db';
import {
  insertStoredUser,
  loadUserCommandReceipt,
  lockUserKey,
  saveUserCommandReceipt,
  signalDuplicateUserContacts,
} from '../persistence/postgres-user.shared.ts';
import type {
  CreateUserOperations,
  CreateUserRepository,
} from './create-user.port.ts';

const operations = (tx: DatabaseExecutor): CreateUserOperations => ({
  lockCommand: (key) => lockUserKey(tx, `users:command:${key}`),
  loadCommandReceipt: (key) => loadUserCommandReceipt(tx, key),
  saveCommandReceipt: (input) => saveUserCommandReceipt(tx, input),
  createUser: (input) => insertStoredUser(tx, input),
  signalDuplicateContacts: (input) => signalDuplicateUserContacts(tx, input),
});

export const makePostgresCreateUserRepository = (
  db: Database,
): CreateUserRepository => ({
  transaction: (work) => db.transaction((tx) => work(operations(tx))),
});
