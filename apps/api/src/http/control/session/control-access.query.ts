import {
  and,
  asc,
  auth,
  business,
  eq,
  gt,
  isNull,
  lte,
  or,
  type Database,
} from '@pressly/db';
import type { PresslyApplication } from '@pressly/contracts';
import {
  controlCapabilitiesFor,
  isControlGrant,
} from './control-access.policy.ts';
import type {
  ControlAccess,
  ResolveControlAccess,
} from './control-session.port.ts';

const applicationManifest = (input: {
  controlOrigin: string;
  processorOrigin: string;
  includeProcessor: boolean;
}): readonly PresslyApplication[] => [
  {
    id: 'control',
    label: 'Pressly Control',
    description: 'Manage people, customers, orders, and account security.',
    href: input.controlOrigin,
  },
  ...(input.includeProcessor
    ? [
        {
          id: 'processor' as const,
          label: 'Pressly Processor',
          description: 'Run intake, scheduling, and laundry-floor production.',
          href: input.processorOrigin,
        },
      ]
    : []),
];

export const makeControlAccessResolver = (input: {
  db: Database;
  controlOrigin: string;
  processorOrigin: string;
  clock?: Readonly<{ now: () => Date }>;
}): ResolveControlAccess => {
  const clock = input.clock ?? { now: () => new Date() };

  return async (session) => {
    const now = clock.now();
    const effectiveGrants = await input.db
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
          eq(auth.authAccessGrants.identityId, session.principal.identityId),
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
      .orderBy(asc(business.businessAccounts.slug));

    const controlGrants = effectiveGrants.filter(isControlGrant);
    if (controlGrants.length === 0) return null;

    const businessIds = new Set(controlGrants.map((grant) => grant.businessId));
    if (businessIds.size !== 1) return null;

    const businessId = controlGrants[0]!.businessId;
    const businessName = controlGrants[0]!.businessName;
    const businessGrants = effectiveGrants.filter(
      (grant) => grant.businessId === businessId,
    );
    const hasBusinessScope = controlGrants.some(
      (grant) => grant.scopeKind === 'business',
    );
    const allowedLocationIds = new Set(
      controlGrants
        .filter((grant) => grant.scopeKind === 'location')
        .map((grant) => grant.scopeId),
    );
    const allLocations = await input.db
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
      .orderBy(asc(business.productionLocations.name));
    const locations = hasBusinessScope
      ? allLocations
      : allLocations.filter((location) => allowedLocationIds.has(location.id));
    const access: ControlAccess = {
      business: { id: businessId, name: businessName },
      locations,
      selectedLocationId: locations[0]?.id ?? null,
      capabilities: controlCapabilitiesFor(
        controlGrants,
        session.principalAttributes.assuranceLevel,
      ),
      applications: applicationManifest({
        controlOrigin: input.controlOrigin,
        processorOrigin: input.processorOrigin,
        includeProcessor:
          locations.length > 0 &&
          businessGrants.some((grant) =>
            ['owner', 'manager', 'operator'].includes(grant.role),
          ),
      }),
    };

    return access;
  };
};
