import type { Database, DatabaseExecutor } from '@pressly/db/client';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import {
  loadUserCommandReceipt,
  lockUserPersistenceKey,
  saveUserCommandReceipt,
} from '../../../foundations/adapters/postgres/user-command-receipt.adapter.ts';
import { signalDuplicateUserContacts } from '../../../foundations/adapters/postgres/user-duplicate-contact.adapter.ts';
import { insertStoredUser } from '../../../foundations/adapters/postgres/user-write.adapter.ts';
import type {
  CreateUserOperations,
  CreateUserRepository,
} from './create-user.port.ts';

const createUserOperations = (tx: DatabaseExecutor): CreateUserOperations => ({
  lockCommand: (key) => lockUserPersistenceKey(tx, `users:command:${key}`),
  loadCommandReceipt: (key) => loadUserCommandReceipt(tx, key),
  saveCommandReceipt: (input) => saveUserCommandReceipt(tx, input),
  createUser: (input) => insertStoredUser(tx, input),
  signalDuplicateContacts: (input) => signalDuplicateUserContacts(tx, input),
});

export const makePostgresCreateUserRepository = (
  db: Database,
): CreateUserRepository => defineUnitOfWork(db, createUserOperations);
