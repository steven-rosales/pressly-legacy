import {
  and,
  eq,
  users as schema,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import {
  loadUserCommandReceipt,
  lockUserKey,
  saveUserCommandReceipt,
  signalDuplicateUserContacts,
  userFromRow,
} from '../persistence/postgres-user.shared.ts';
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

  return row === undefined ? null : userFromRow(row);
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

const operations = (tx: DatabaseExecutor): UpdateUserOperations => ({
  lockCommand: (key) => lockUserKey(tx, `users:command:${key}`),
  loadCommandReceipt: (key) => loadUserCommandReceipt(tx, key),
  saveCommandReceipt: (input) => saveUserCommandReceipt(tx, input),
  lockUser: (businessId, userId) =>
    lockUserKey(tx, `users:${businessId}:id:${userId}`),
  loadUser: (businessId, userId) => loadUser(tx, businessId, userId),
  updateUser: (input) => updateUser(tx, input),
  signalDuplicateContacts: (input) => signalDuplicateUserContacts(tx, input),
});

export const makePostgresUpdateUserRepository = (
  db: Database,
): UpdateUserRepository => ({
  transaction: (work) => db.transaction((tx) => work(operations(tx))),
});
