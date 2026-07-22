import type { Database, DatabaseExecutor } from '@pressly/db';
import {
  loadStoredUser,
  loadUserCommandReceipt,
  lockUserKey,
  saveUserCommandReceipt,
  signalDuplicateUserContacts,
  updateStoredUser,
} from '../persistence/postgres-user.shared.ts';
import type {
  UpdateUserOperations,
  UpdateUserRepository,
} from './update-user.port.ts';

const operations = (tx: DatabaseExecutor): UpdateUserOperations => ({
  lockCommand: (key) => lockUserKey(tx, `users:command:${key}`),
  loadCommandReceipt: (key) => loadUserCommandReceipt(tx, key),
  saveCommandReceipt: (input) => saveUserCommandReceipt(tx, input),
  lockUser: (userId) => lockUserKey(tx, `users:id:${userId}`),
  loadUser: (userId) => loadStoredUser(tx, userId),
  updateUser: (input) => updateStoredUser(tx, input),
  signalDuplicateContacts: (input) => signalDuplicateUserContacts(tx, input),
});

export const makePostgresUpdateUserRepository = (
  db: Database,
): UpdateUserRepository => ({
  transaction: (work) => db.transaction((tx) => work(operations(tx))),
});
