import { type PostgresDatabase } from '@pressly/postgres/client';
import type { JsonObject } from '@pressly/codec';
import { runDatabaseOperation } from '../database-operation/database-operation.adapter.ts';
import type { AccessSchema } from '../../schema/public.ts';

type AuthAuditEventInput = Readonly<{
  principalIdentityId?: string;
  eventType: string;
  resourceType: string;
  resourceId?: string;
  metadata?: JsonObject;
}>;

export const recordAuthAuditEvent = (
  db: PostgresDatabase,
  auth: Pick<AccessSchema, 'authAuditEvents'>,
  input: AuthAuditEventInput,
): Promise<void> =>
  runDatabaseOperation(async () => {
    await db
      .insert(auth.authAuditEvents)
      .values({ ...input, metadata: input.metadata ?? {} });
  });
