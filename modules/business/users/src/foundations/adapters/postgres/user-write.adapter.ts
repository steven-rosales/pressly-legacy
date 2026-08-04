import { type DatabaseExecutor } from '@pressly/db/client';
import * as schema from '@pressly/db/schema/users';
import { invariantViolationError } from '@pressly/errors/factories';
import type { User } from '../../language/users/user.entity.ts';
import type {
  UserFieldName,
  UserProfile,
} from '../../language/users/user-profile.value.ts';
import { mapStoredUser } from './user.persistence.mapper.ts';

export const insertStoredUser = async (
  db: DatabaseExecutor,
  input: {
    businessId: string;
    profile: UserProfile;
    authorityFields: readonly UserFieldName[];
    now: Date;
  },
): Promise<User> => {
  const [created] = await db
    .insert(schema.users)
    .values({
      businessId: input.businessId,
      ...input.profile,
      version: 1,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning();

  if (created === undefined)
    throw invariantViolationError({
      code: 'user_insert_result_missing',
      message: 'User insert returned no row.',
      safeMessage: 'Stored user data is inconsistent.',
    });

  await db.insert(schema.userFieldAuthorities).values(
    input.authorityFields.map((fieldName) => ({
      userId: created.id,
      fieldName,
      authority: 'pressly',
      source: null,
      updatedAt: input.now,
    })),
  );

  return mapStoredUser(created);
};
