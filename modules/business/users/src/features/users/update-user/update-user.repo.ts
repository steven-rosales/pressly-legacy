import { type Database, type DatabaseExecutor } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as schema from '@pressly/db/schema/users';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import {
  loadUserCommandReceipt,
  lockUserPersistenceKey,
  saveUserCommandReceipt,
} from '../../../foundations/adapters/postgres/user-command-receipt.adapter.ts';
import { signalDuplicateUserContacts } from '../../../foundations/adapters/postgres/user-duplicate-contact.adapter.ts';
import { mapStoredUser } from '../../../foundations/adapters/postgres/user.persistence.mapper.ts';
import type {
  UpdateUserOperations,
  UpdateUserRepository,
} from './update-user.port.ts';

const loadUser = async (
  tx: DatabaseExecutor,
  businessId: string,
  userId: string,
) => {
  const [row] = await tx
    .select()
    .from(schema.users)
    .where(
      and(eq(schema.users.businessId, businessId), eq(schema.users.id, userId)),
    )
    .limit(1);

  return row === undefined ? null : mapStoredUser(row);
};

const updateUser = async (
  tx: DatabaseExecutor,
  input: Parameters<UpdateUserOperations['updateUser']>[0],
): Promise<void> => {
  await tx
    .update(schema.users)
    .set({
      ...input.changes,
      version: input.nextVersion,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.users.businessId, input.businessId),
        eq(schema.users.id, input.userId),
      ),
    );

  for (const fieldName of input.authorityFields)
    await tx
      .insert(schema.userFieldAuthorities)
      .values({
        userId: input.userId,
        fieldName,
        authority: 'pressly',
        source: null,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [
          schema.userFieldAuthorities.userId,
          schema.userFieldAuthorities.fieldName,
        ],
        set: { authority: 'pressly', source: null, updatedAt: input.now },
      });
};

const updateUserOperations = (tx: DatabaseExecutor): UpdateUserOperations => ({
  lockCommand: (key) => lockUserPersistenceKey(tx, `users:command:${key}`),
  loadCommandReceipt: (key) => loadUserCommandReceipt(tx, key),
  saveCommandReceipt: (input) => saveUserCommandReceipt(tx, input),
  lockUser: (businessId, userId) =>
    lockUserPersistenceKey(tx, `users:${businessId}:id:${userId}`),
  loadUser: (businessId, userId) => loadUser(tx, businessId, userId),
  updateUser: (input) => updateUser(tx, input),
  signalDuplicateContacts: (input) => signalDuplicateUserContacts(tx, input),
});

export const makePostgresUpdateUserRepository = (
  db: Database,
): UpdateUserRepository => defineUnitOfWork(db, updateUserOperations);
