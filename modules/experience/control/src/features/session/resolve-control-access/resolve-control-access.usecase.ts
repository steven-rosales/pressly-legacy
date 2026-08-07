import type { Clock } from '@pressly/time';
import type {
  ControlAccess,
  ControlAccessPrincipal,
} from '../../../foundations/language/control-access/control-access.model.ts';
import type { ResolveControlAccessRepository } from './resolve-control-access.port.ts';
import { controlApplicationManifest } from './control-application.projection.ts';
import {
  controlCapabilitiesFor,
  isControlGrant,
} from './control-access.policy.ts';

export type ResolveControlAccess = (
  principal: ControlAccessPrincipal,
) => Promise<ControlAccess | null>;

export const makeResolveControlAccess =
  (deps: {
    repo: ResolveControlAccessRepository;
    clock: Clock;
    controlOrigin: string;
    processorOrigin: string;
  }): ResolveControlAccess =>
  async (principal) => {
    const effectiveGrants = await deps.repo.loadEffectiveGrants({
      identityId: principal.identityId,
      now: deps.clock.now(),
    });
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
    const allLocations = await deps.repo.listActiveLocations(businessId);
    const locations = hasBusinessScope
      ? allLocations
      : allLocations.filter((location) => allowedLocationIds.has(location.id));

    return {
      business: { id: businessId, name: businessName },
      locations,
      selectedLocationId: locations[0]?.id ?? null,
      capabilities: controlCapabilitiesFor(
        controlGrants,
        principal.assuranceLevel,
      ),
      applications: controlApplicationManifest({
        controlOrigin: deps.controlOrigin,
        processorOrigin: deps.processorOrigin,
        includeProcessor:
          locations.length > 0 &&
          businessGrants.some((grant) =>
            ['owner', 'manager', 'operator'].includes(grant.role),
          ),
      }),
    };
  };
