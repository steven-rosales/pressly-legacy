import { type Database } from '@pressly/db/client';
import { and, count, eq } from '@pressly/db/query';
import * as schema from '@pressly/db/schema/users';
import { projectUserSummary } from '../../../foundations/language/user-summary/user-summary.projection.ts';
import type { GetUserRepository } from './get-user.port.ts';

export const makePostgresGetUserRepository =
  (db: Database): GetUserRepository =>
  async (query) => {
    const [row] = await db
      .select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.businessId, query.businessId),
          eq(schema.users.id, query.userId),
        ),
      )
      .limit(1);
    if (row === undefined) return null;

    const [duplicate] = await db
      .select({ value: count() })
      .from(schema.userDuplicateCandidates)
      .where(
        and(
          eq(schema.userDuplicateCandidates.userId, row.id),
          eq(schema.userDuplicateCandidates.status, 'open'),
        ),
      );

    return projectUserSummary(row, Number(duplicate?.value ?? 0));
  };
