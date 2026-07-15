import type { Request, RequestHandler, Response } from 'express';
import type { AccessControlAuthPort } from '../auth.port.ts';
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
  resources: RequestHandler;
  stage: RequestHandler;
  readActorId: (response: Response) => string;
  readAllowedLocationIds: (response: Response) => readonly string[] | null;
}>;

const readResource = (request: Request) => {
  const locationId = request.params['locationId'];

  if (typeof locationId !== 'string' || locationId.length === 0)
    throw Object.assign(new Error('Production location is required.'), {
      code: 'production_location_required',
    });

  return productionLocationResource(locationId);
};

export const makeProductionAccessControl = (input: {
  auth: AccessControlAuthPort;
}): ProductionAccessControl => {
  const policies = makeProductionPolicies();
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
    resources: input.auth.authorize({
      action: 'production:resources',
      policies,
      readResource: productionOperationsResource,
    }),
    stage: locationGuard('production:stage'),
    readActorId: (response) => input.auth.readPrincipal(response).identityId,
    readAllowedLocationIds: (response) => {
      const assignments =
        input.auth.readPrincipalAttributes?.(response).assignments ?? [];
      const productionAssignments = assignments.filter((assignment) =>
        ['owner', 'admin', 'operator'].includes(assignment.role),
      );

      if (
        productionAssignments.some(
          (assignment) => assignment.scope.kind === 'global',
        )
      )
        return null;

      return [
        ...new Set(
          productionAssignments.flatMap((assignment) =>
            assignment.scope.kind === 'location' ? [assignment.scope.id] : [],
          ),
        ),
      ].sort();
    },
  };
};
