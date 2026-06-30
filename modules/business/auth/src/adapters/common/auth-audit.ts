import type { Result } from '@pressly/kernel';
import { auth, type Database } from '@pressly/db';
import type { AppError } from '@pressly/errors';
import { toDatabaseResult } from './database-result.ts';

type AuthAuditEventInput = Readonly<{
  principalIdentityId?: string;
  eventType: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}>;

export const recordAuthAuditEvent = (
  db: Database,
  input: AuthAuditEventInput,
): Promise<Result<void, AppError>> =>
  toDatabaseResult(async () => {
    await db
      .insert(auth.authAuditEvents)
      .values({ ...input, metadata: input.metadata ?? {} });
  });
