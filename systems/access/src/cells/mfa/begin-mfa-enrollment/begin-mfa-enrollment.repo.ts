import type { PostgresDatabase } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import { runDatabaseOperation } from '../../../postgres/database-operation/database-operation.adapter.ts';
import type { BeginMfaEnrollmentStore } from './begin-mfa-enrollment.port.ts';
import type { AccessSchema } from '../../../schema/public.ts';

export const makeBeginMfaEnrollmentStore = (
  db: PostgresDatabase,
  auth: AccessSchema,
): BeginMfaEnrollmentStore => ({
  beginEnrollment: async (input) =>
    runDatabaseOperation(async () => {
      const [existing] = await db
        .select({ status: auth.authMfaCredentials.status })
        .from(auth.authMfaCredentials)
        .where(eq(auth.authMfaCredentials.identityId, input.identityId))
        .limit(1);
      if (existing?.status === 'enabled') return 'already_enabled';

      await db
        .insert(auth.authMfaCredentials)
        .values({
          identityId: input.identityId,
          encryptedSecret: input.encryptedSecret,
          status: 'pending',
          updatedAt: input.now,
        })
        .onConflictDoUpdate({
          target: auth.authMfaCredentials.identityId,
          set: {
            encryptedSecret: input.encryptedSecret,
            status: 'pending',
            lastUsedCounter: null,
            enabledAt: null,
            updatedAt: input.now,
          },
        });
      return 'pending';
    }),
});
