import { type Database } from '@pressly/db/client';
import * as auth from '@pressly/db/schema/auth';
import type { JsonObject } from '@pressly/codec';
import { runDatabaseOperation } from '../database-operation/database-operation.adapter.ts';

type AuthAuditEventInput = Readonly<{
  principalIdentityId?: string;
  eventType: string;
  resourceType: string;
  resourceId?: string;
  metadata?: JsonObject;
}>;

export const recordAuthAuditEvent = (
  db: Database,
  input: AuthAuditEventInput,
): Promise<void> =>
  runDatabaseOperation(async () => {
    await db
      .insert(auth.authAuditEvents)
      .values({ ...input, metadata: input.metadata ?? {} });
  });
