import type { Database } from '@pressly/db/client';
import { and, asc, eq, gt, isNull, lte, or } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import * as business from '@pressly/db/schema/business';
import type { ResolveControlAccessRepository } from './resolve-control-access.port.ts';

export const makePostgresResolveControlAccessRepository = (
  db: Database,
): ResolveControlAccessRepository => ({
  loadEffectiveGrants: async ({ identityId, now }) =>
    db
      .select({
        businessId: auth.authAccessGrants.businessId,
        businessName: business.businessAccounts.displayName,
        role: auth.authAccessGrants.role,
        scopeKind: auth.authAccessGrants.scopeKind,
        scopeId: auth.authAccessGrants.scopeId,
      })
      .from(auth.authAccessGrants)
      .innerJoin(
        auth.workforceMemberships,
        and(
          eq(auth.workforceMemberships.id, auth.authAccessGrants.membershipId),
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
        business.businessAccounts,
        eq(business.businessAccounts.id, auth.authAccessGrants.businessId),
      )
      .where(
        and(
          eq(auth.authAccessGrants.identityId, identityId),
          eq(auth.authAccessGrants.state, 'active'),
          eq(auth.workforceMemberships.state, 'active'),
          eq(business.businessAccounts.status, 'active'),
          or(
            isNull(auth.authAccessGrants.startsAt),
            lte(auth.authAccessGrants.startsAt, now),
          ),
          or(
            isNull(auth.authAccessGrants.endsAt),
            gt(auth.authAccessGrants.endsAt, now),
          ),
        ),
      )
      .orderBy(asc(business.businessAccounts.slug)),
  listActiveLocations: async (businessId) =>
    db
      .select({
        id: business.productionLocations.id,
        name: business.productionLocations.name,
        timezone: business.productionLocations.timezone,
      })
      .from(business.productionLocations)
      .where(
        and(
          eq(business.productionLocations.businessId, businessId),
          eq(business.productionLocations.isActive, true),
        ),
      )
      .orderBy(asc(business.productionLocations.name)),
});
