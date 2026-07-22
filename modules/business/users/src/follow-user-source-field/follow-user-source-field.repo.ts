import type { Database, DatabaseExecutor } from '@pressly/db';
import {
  followStoredUserSourceField,
  loadStoredUser,
  loadUserCommandReceipt,
  lockUserKey,
  saveUserCommandReceipt,
  userSourceLinkExists,
} from '../persistence/postgres-user.shared.ts';
import type {
  FollowUserSourceFieldOperations,
  FollowUserSourceFieldRepository,
} from './follow-user-source-field.port.ts';

const operations = (tx: DatabaseExecutor): FollowUserSourceFieldOperations => ({
  lockCommand: (key) => lockUserKey(tx, `users:command:${key}`),
  loadCommandReceipt: (key) => loadUserCommandReceipt(tx, key),
  saveCommandReceipt: (input) => saveUserCommandReceipt(tx, input),
  lockUser: (userId) => lockUserKey(tx, `users:id:${userId}`),
  loadUser: (userId) => loadStoredUser(tx, userId),
  sourceLinkExists: (input) => userSourceLinkExists(tx, input),
  followSourceField: (input) => followStoredUserSourceField(tx, input),
});

export const makePostgresFollowUserSourceFieldRepository = (
  db: Database,
): FollowUserSourceFieldRepository => ({
  transaction: (work) => db.transaction((tx) => work(operations(tx))),
});
