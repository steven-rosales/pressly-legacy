import type {
  PostgresDatabase,
  PostgresTransaction,
} from '@pressly/postgres/client';
import { and, eq } from '@pressly/postgres/query';
import { defineUnitOfWork } from '@pressly/postgres/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import type { UnitOfWork } from '@pressly/cells/unit-of-work';
import { runDatabaseOperation } from '../../../postgres/database-operation/database-operation.adapter.ts';
import type { RegenerateMfaRecoveryCodesStore } from './regenerate-mfa-recovery-codes.port.ts';
import type { AccessSchema } from '../../../schema/public.ts';

export const makeRegenerateMfaRecoveryCodesStore = (
  db: PostgresDatabase,
  auth: AccessSchema,
  unitOfWork: UnitOfWork<PostgresTransaction> = defineUnitOfWork(
    db,
    (transaction) => transaction,
  ),
): RegenerateMfaRecoveryCodesStore => ({
  replaceRecoveryCodes: async (input) =>
    runDatabaseOperation(async () => {
      await unitOfWork.transaction(async (tx) => {
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
