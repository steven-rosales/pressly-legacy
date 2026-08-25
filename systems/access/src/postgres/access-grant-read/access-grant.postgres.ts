import type { AccessGrantSummary } from '../../model/language/access-grant/access-grant.model.ts';
import type { WorkforceRole } from '../../model/language/workforce/workforce.model.ts';

type StoredGrant = Readonly<{
  id: string;
  businessId: string;
  membershipId: string;
  identityId: string;
  role: string;
  scopeKind: string;
  scopeId: string;
  state: AccessGrantSummary['state'];
  version: number;
  startsAt: Date | null;
  endsAt: Date | null;
}>;

export const grantSummary = (
  grant: StoredGrant,
  effective: boolean,
): AccessGrantSummary => ({
  id: grant.id,
  businessId: grant.businessId,
  membershipId: grant.membershipId,
  identityId: grant.identityId,
  role: grant.role as WorkforceRole,
  scope:
    grant.scopeKind === 'location'
      ? { kind: 'location', id: grant.scopeId }
      : { kind: 'business', id: grant.scopeId },
  state: grant.state,
  version: grant.version,
  startsAt: grant.startsAt,
  endsAt: grant.endsAt,
  effective,
});
