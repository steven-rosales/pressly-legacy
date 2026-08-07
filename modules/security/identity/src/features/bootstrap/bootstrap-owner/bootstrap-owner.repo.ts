import { type Database } from '@pressly/db/client';
import { and, eq, sql } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import * as business from '@pressly/db/schema/business';
import type { BootstrapOwnerStore } from './bootstrap-owner.port.ts';
import {
  databaseFailure,
  runDatabaseOperation,
} from '../../../foundations/adapters/postgres/database-operation/database-operation.adapter.ts';

export const makeBootstrapOwnerStore = (db: Database): BootstrapOwnerStore => ({
  createFirstOwner: async (input) =>
    runDatabaseOperation(async () =>
      db.transaction(async (tx) => {
        await tx.execute(sql`
          select pg_advisory_xact_lock(hashtext('pressly.auth.bootstrap_owner'))
        `);

        const [ownerCount] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(auth.authAccessGrants)
          .innerJoin(
            auth.workforceMemberships,
            and(
              eq(
                auth.workforceMemberships.id,
                auth.authAccessGrants.membershipId,
              ),
              eq(
                auth.workforceMemberships.businessId,
                auth.authAccessGrants.businessId,
              ),
              eq(
                auth.workforceMemberships.identityId,
                auth.authAccessGrants.identityId,
              ),
            ),
          )
          .innerJoin(
            auth.authIdentities,
            eq(auth.authIdentities.id, auth.authAccessGrants.identityId),
          )
          .where(
            and(
              eq(auth.authAccessGrants.role, 'owner'),
              eq(auth.authAccessGrants.state, 'active'),
              eq(auth.workforceMemberships.state, 'active'),
              eq(auth.authIdentities.isActive, true),
            ),
          );

        if ((ownerCount?.count ?? 0) > 0) return { status: 'owner_exists' };

        const [businessAccount] = await tx
          .select({ id: business.businessAccounts.id })
          .from(business.businessAccounts)
          .where(
            and(
              eq(business.businessAccounts.id, input.businessId),
              eq(business.businessAccounts.status, 'active'),
            ),
          )
          .limit(1);

        if (businessAccount === undefined)
          throw databaseFailure(
            'bootstrap owner target business account is not active',
          );

        const businessId = businessAccount.id;

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

        await tx.insert(auth.authRoleAssignments).values({
          identityId: identity.id,
          role: 'owner',
          scopeKind: 'global',
        });

        const [membership] = await tx
          .insert(auth.workforceMemberships)
          .values({
            businessId,
            identityId: identity.id,
            state: 'active',
          })
          .returning({ id: auth.workforceMemberships.id });

        if (membership === undefined)
          throw databaseFailure(
            'bootstrap owner workforce membership insert returned no row',
          );

        await tx.insert(auth.authAccessGrants).values({
          businessId,
          membershipId: membership.id,
          identityId: identity.id,
          role: 'owner',
          scopeKind: 'business',
          scopeId: businessId,
          scopeResourceType: '*',
          state: 'active',
          createdByIdentityId: identity.id,
        });

        await tx.insert(auth.authAuditEvents).values({
          businessId,
          eventType: 'auth.owner_bootstrapped',
          resourceType: 'auth_identity',
          resourceId: identity.id,
          metadata: { role: 'owner', scope: 'business' },
        });

        return { status: 'created', identityId: identity.id };
      }),
    ),
});
