import { auth, type Database } from '@pressly/db';
import type { AuthAuditEventInput } from '@pressly/contracts';
import type { AppError, Result } from '@pressly/errors';
import { toDatabaseResult } from './database-result.ts';

export const recordAuthAuditEvent = (
  db: Database,
  input: AuthAuditEventInput,
): Promise<Result<void, AppError>> =>
  toDatabaseResult(async () => {
    await db
      .insert(auth.authAuditEvents)
      .values({ ...input, metadata: input.metadata ?? {} });
  });
