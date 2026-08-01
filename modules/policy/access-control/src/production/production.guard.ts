import type { Request, RequestHandler, Response } from 'express';
import { isAssignmentActive } from '@pressly/auth/authorization';
import type { AccessControlAuthPort } from '../auth.port.ts';
import type { LocationAncestryPort } from '../location-ancestry.port.ts';
import { makeProductionPolicies } from './production.policy.ts';
import {
  productionLocationResource,
  productionOperationsResource,
} from './production.resource.ts';

export type ProductionAccessControl = Readonly<{
  authenticate: RequestHandler;
  read: RequestHandler;
  schedule: RequestHandler;
  accept: RequestHandler;
  start: RequestHandler;
  queue: RequestHandler;
  override: RequestHandler;
  priority: RequestHandler;
  intake: RequestHandler;
  admission: RequestHandler;
  resources: RequestHandler;
  stage: RequestHandler;
  readActorId: (response: Response) => string;
  readAllowedLocationIds: (
    response: Response,
  ) => Promise<readonly string[] | null>;
}>;

const readLocationId = (request: Request): string => {
  const locationId = request.params['locationId'];

  if (typeof locationId !== 'string' || locationId.length === 0)
    throw Object.assign(new Error('Production location is required.'), {
      code: 'production_location_required',
    });

  return locationId;
};

export const makeProductionAccessControl = (input: {
  auth: AccessControlAuthPort;
  locationAncestry: LocationAncestryPort;
  clock?: Readonly<{ now: () => Date }>;
}): ProductionAccessControl => {
  const clock = input.clock ?? { now: () => new Date() };
  const policies = makeProductionPolicies();
  const readResource = async (request: Request) => {
    const locationId = readLocationId(request);
    const businessId =
      await input.locationAncestry.resolveBusinessId(locationId);
    return productionLocationResource(locationId, businessId);
  };
  const locationGuard = (
    action: Parameters<AccessControlAuthPort['authorize']>[0]['action'],
  ) => input.auth.authorize({ action, policies, readResource });

  return {
    authenticate: input.auth.authenticate,
    read: locationGuard('production:read'),
    schedule: locationGuard('production:schedule'),
    accept: locationGuard('production:accept'),
    start: locationGuard('production:start'),
    queue: locationGuard('production:queue'),
    override: locationGuard('production:override'),
    priority: locationGuard('production:priority'),
    intake: locationGuard('production:intake'),
    admission: locationGuard('production:admission'),
    resources: input.auth.authorize({
      action: 'production:resources',
      policies,
      readResource: productionOperationsResource,
    }),
    stage: locationGuard('production:stage'),
    readActorId: (response) => input.auth.readPrincipal(response).identityId,
    readAllowedLocationIds: async (response) => {
      const assignments =
        input.auth.readPrincipalAttributes?.(response).assignments ?? [];
      const now = clock.now();
      const productionAssignments = assignments.filter(
        (assignment) =>
          ['owner', 'manager', 'admin', 'operator'].includes(assignment.role) &&
          isAssignmentActive(assignment, now),
      );

      if (
        productionAssignments.some(
          (assignment) => assignment.scope.kind === 'global',
        )
      )
        return null;

      const directLocationIds = productionAssignments.flatMap((assignment) =>
        assignment.scope.kind === 'location' ? [assignment.scope.id] : [],
      );
      const businessIds = [
        ...new Set(
          productionAssignments.flatMap((assignment) =>
            assignment.scope.kind === 'business' ? [assignment.scope.id] : [],
          ),
        ),
      ];
      const inheritedLocationIds =
        businessIds.length === 0
          ? []
          : await input.locationAncestry.listLocationIdsForBusinesses(
              businessIds,
            );

      return [
        ...new Set([...directLocationIds, ...inheritedLocationIds]),
      ].sort();
    },
  };
};
