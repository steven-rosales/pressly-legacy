import type { Database } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import { invariantViolationError } from '@pressly/errors/factories';
import { runDatabaseOperation } from '../../../foundations/adapters/postgres/database-operation/database-operation.adapter.ts';
import type { RegenerateMfaRecoveryCodesStore } from './regenerate-mfa-recovery-codes.port.ts';

export const makeRegenerateMfaRecoveryCodesStore = (
  db: Database,
): RegenerateMfaRecoveryCodesStore => ({
  replaceRecoveryCodes: async (input) =>
    runDatabaseOperation(async () => {
      await db.transaction(async (tx) => {
        const [credential] = await tx
          .select({ id: auth.authMfaCredentials.id })
          .from(auth.authMfaCredentials)
          .where(
            and(
              eq(auth.authMfaCredentials.identityId, input.identityId),
              eq(auth.authMfaCredentials.status, 'enabled'),
            ),
          )
          .limit(1);
        if (credential === undefined)
          throw invariantViolationError({
            code: 'mfa_recovery_codes_identity_not_enabled',
            message:
              'MFA recovery codes cannot be replaced without an enabled credential.',
          });

        await tx
          .delete(auth.authMfaRecoveryCodes)
          .where(eq(auth.authMfaRecoveryCodes.identityId, input.identityId));
        await tx.insert(auth.authMfaRecoveryCodes).values(
          input.recoveryCodeHashes.map((codeHash) => ({
            identityId: input.identityId,
            codeHash,
          })),
        );
        await tx.insert(auth.authAuditEvents).values({
          principalIdentityId: input.identityId,
          eventType: 'auth.mfa.recovery_codes_regenerated',
          resourceType: 'auth_identity',
          resourceId: input.identityId,
        });
      });
    }),
});
