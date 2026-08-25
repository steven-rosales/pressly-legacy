import type {
  PostgresDatabase,
  PostgresTransaction,
} from '@pressly/postgres/client';
import { and, eq, sql } from '@pressly/postgres/query';
import { defineUnitOfWork } from '@pressly/postgres/unit-of-work';
import type { UnitOfWork } from '@pressly/cells/unit-of-work';
import type { BootstrapOwnerStore } from './bootstrap-owner.port.ts';
import {
  databaseFailure,
  runDatabaseOperation,
} from '../../../postgres/database-operation/database-operation.adapter.ts';
import type { AccessSchema } from '../../../schema/public.ts';

export const makeBootstrapOwnerStore = (
  db: PostgresDatabase,
  access: AccessSchema,
  unitOfWork: UnitOfWork<PostgresTransaction> = defineUnitOfWork(
    db,
    (transaction) => transaction,
  ),
): BootstrapOwnerStore => {
  const auth = access;
  const business = access;
  return {
    createFirstOwner: async (input) =>
      runDatabaseOperation(async () =>
        unitOfWork.transaction(async (tx) => {
          await tx.execute(sql`
          select pg_advisory_xact_lock(hashtext('pressly.auth.bootstrap_owner'))
        `);

          const activeOwners = await tx
            .select({
              identityId: auth.authIdentities.id,
              emailNormalized: auth.authIdentities.emailNormalized,
              businessId: auth.authAccessGrants.businessId,
              passwordHash: auth.authPasswordCredentials.passwordHash,
            })
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
            .innerJoin(
              auth.authPasswordCredentials,
              eq(
                auth.authPasswordCredentials.identityId,
                auth.authIdentities.id,
              ),
            )
            .where(
              and(
                eq(auth.authAccessGrants.role, 'owner'),
                eq(auth.authAccessGrants.state, 'active'),
                eq(auth.workforceMemberships.state, 'active'),
                eq(auth.authIdentities.isActive, true),
              ),
            );

          const [[businessById], [businessBySlug], [existingIdentity]] =
            await Promise.all([
              tx
                .select({
                  id: business.businessAccounts.id,
                  slug: business.businessAccounts.slug,
                  displayName: business.businessAccounts.displayName,
                  status: business.businessAccounts.status,
                })
                .from(business.businessAccounts)
                .where(eq(business.businessAccounts.id, input.businessId))
                .limit(1),
              tx
                .select({ id: business.businessAccounts.id })
                .from(business.businessAccounts)
                .where(eq(business.businessAccounts.slug, input.businessSlug))
                .limit(1),
              tx
                .select({ id: auth.authIdentities.id })
                .from(auth.authIdentities)
                .where(
                  eq(
                    auth.authIdentities.emailNormalized,
                    input.emailNormalized,
                  ),
                )
                .limit(1),
            ]);

          if (
            (businessById !== undefined &&
              (businessById.slug !== input.businessSlug ||
                businessById.displayName !== input.businessDisplayName ||
                businessById.status !== 'active')) ||
            (businessBySlug !== undefined &&
              businessBySlug.id !== input.businessId)
          )
            return { status: 'business_conflict' };

          if (activeOwners.length > 0) {
            const owner = activeOwners.find(
              (candidate) =>
                candidate.businessId === input.businessId &&
                candidate.emailNormalized === input.emailNormalized,
            );
            if (owner !== undefined && businessById !== undefined) {
              if (!(await input.verifyExistingPassword(owner.passwordHash)))
                return { status: 'credential_conflict' };
              return { status: 'replayed', identityId: owner.identityId };
            }
            return { status: 'owner_exists' };
          }

          if (existingIdentity !== undefined)
            return { status: 'identity_exists' };

          if (businessById === undefined) {
            const [createdBusiness] = await tx
              .insert(business.businessAccounts)
              .values({
                id: input.businessId,
                slug: input.businessSlug,
                displayName: input.businessDisplayName,
                status: 'active',
              })
              .returning({ id: business.businessAccounts.id });
            if (createdBusiness === undefined)
              throw databaseFailure(
                'bootstrap business account insert returned no row',
              );
          }

          const businessId = input.businessId;

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
  };
};
