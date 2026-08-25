import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, asc, eq, gt, isNull, lte, or } from '@pressly/postgres/query';
import { invariantViolationError } from '@pressly/errors/factories';
import { runDatabaseOperation } from '../../../postgres/database-operation/database-operation.adapter.ts';
import type { EffectiveAccessGrantFact } from './list-effective-access-grants.model.ts';
import type { ListEffectiveAccessGrantsStore } from './list-effective-access-grants.port.ts';
import type { AccessSchema } from '../../../schema/public.ts';

const effectiveGrantFact = (row: {
  businessId: string;
  businessName: string;
  role: string;
  scopeKind: string;
  scopeId: string;
}): EffectiveAccessGrantFact => {
  if (
    (row.role === 'owner' ||
      row.role === 'manager' ||
      row.role === 'operator') &&
    (row.scopeKind === 'business' || row.scopeKind === 'location')
  )
    return { ...row, role: row.role, scopeKind: row.scopeKind };

  throw invariantViolationError({
    code: 'effective_access_grant_invalid',
    message: 'Stored effective Access grant has invalid role or scope facts.',
    safeMessage: 'Access data is inconsistent.',
    details: { role: row.role, scopeKind: row.scopeKind },
  });
};

export const makeListEffectiveAccessGrantsStore = (
  db: PostgresDatabase,
  access: AccessSchema,
): ListEffectiveAccessGrantsStore => {
  const auth = access;
  const business = access;
  return {
    listEffectiveGrants: (input) =>
      runDatabaseOperation(async () => {
        const rows = await db
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
            business.businessAccounts,
            eq(business.businessAccounts.id, auth.authAccessGrants.businessId),
          )
          .where(
            and(
              eq(auth.authAccessGrants.identityId, input.identityId),
              eq(auth.authAccessGrants.state, 'active'),
              eq(auth.workforceMemberships.state, 'active'),
              eq(business.businessAccounts.status, 'active'),
              or(
                isNull(auth.authAccessGrants.startsAt),
                lte(auth.authAccessGrants.startsAt, input.now),
              ),
              or(
                isNull(auth.authAccessGrants.endsAt),
                gt(auth.authAccessGrants.endsAt, input.now),
              ),
            ),
          )
          .orderBy(asc(business.businessAccounts.slug));
        return rows.map(effectiveGrantFact);
      }),
  };
};
