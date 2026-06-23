import { auth, eq, sql, type Database } from '@pressly/db';
import type { BootstrapOwnerStore } from '../../../features/bootstrap-owner/bootstrap-owner.port.ts';
import {
  databaseFailure,
  toDatabaseResult,
} from '../../common/database-result.ts';

export const makeBootstrapOwnerStore = (db: Database): BootstrapOwnerStore => ({
  createFirstOwner: async (input) =>
    toDatabaseResult(async () =>
      db.transaction(async (tx) => {
        await tx.execute(sql`
          select pg_advisory_xact_lock(hashtext('pressly.auth.bootstrap_owner'))
        `);

        const [ownerCount] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(auth.authRoleAssignments)
          .where(eq(auth.authRoleAssignments.role, 'owner'));

        if ((ownerCount?.count ?? 0) > 0) return { status: 'owner_exists' };

        const [existingIdentity] = await tx
          .select({ id: auth.authIdentities.id })
          .from(auth.authIdentities)
          .where(eq(auth.authIdentities.emailNormalized, input.emailNormalized))
          .limit(1);

        if (existingIdentity !== undefined)
          return { status: 'identity_exists' };

        const [identity] = await tx
          .insert(auth.authIdentities)
          .values({
            kind: 'human',
            displayName: input.email,
            email: input.email,
            emailNormalized: input.emailNormalized,
            isActive: true,
          })
          .returning();

        if (identity === undefined)
          throw databaseFailure(
            'bootstrap owner identity insert returned no row',
          );

        await tx.insert(auth.authPasswordCredentials).values({
          identityId: identity.id,
          passwordHash: input.passwordHash,
        });

        await tx.insert(auth.authIdentityRoles).values({
          identityId: identity.id,
          role: 'owner',
        });

        await tx.insert(auth.authRoleAssignments).values({
          identityId: identity.id,
          role: 'owner',
          scopeKind: 'global',
        });

        await tx.insert(auth.authAuditEvents).values({
          eventType: 'auth.owner_bootstrapped',
          resourceType: 'auth_identity',
          resourceId: identity.id,
          metadata: { email: input.emailNormalized, role: 'owner' },
        });

        return { status: 'created', identityId: identity.id };
      }),
    ),
});
