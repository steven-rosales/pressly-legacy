import type { Database } from '@pressly/db/client';
import { eq } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import { runDatabaseOperation } from '../../../foundations/adapters/postgres/database-operation/database-operation.adapter.ts';
import type { BeginMfaEnrollmentStore } from './begin-mfa-enrollment.port.ts';

export const makeBeginMfaEnrollmentStore = (
  db: Database,
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
