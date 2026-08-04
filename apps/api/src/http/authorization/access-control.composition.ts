import type { Principal } from '@pressly/auth/authentication';
import type {
  Action,
  AuthResource,
  PolicyRule,
  PrincipalAttributes,
} from '@pressly/auth/authorization';
import type { PricingChangeRequest } from '@pressly/contracts/pricing';
import { validationError } from '@pressly/errors/factories';
import type { AuthorizationModule } from '@pressly/authorization';
import type { Request, RequestHandler, Response } from 'express';

export type ApiAuthorize = <Resource extends AuthResource>(
  input: Readonly<{
    action: Action;
    policies: readonly PolicyRule<Resource>[];
    readResource: (
      request: Request,
      response: Response,
    ) => Resource | Promise<Resource>;
  }>,
) => RequestHandler;

export type ApiAuthenticationBoundary = Readonly<{
  authenticate: RequestHandler;
  authorize: ApiAuthorize;
  readPrincipal: (response: Response) => Principal;
  readPrincipalAttributes?: (response: Response) => PrincipalAttributes;
}>;

export type ApiAccessControl = Readonly<{
  pricing: Readonly<{
    authenticate: RequestHandler;
    planPricingChange: RequestHandler;
    publishPricingChange: RequestHandler;
    readAuthor: (response: Response) => Readonly<{
      id: string;
      kind: 'human' | 'service';
      displayName: string;
    }>;
  }>;
  authSessions: Readonly<{
    authenticate: RequestHandler;
    readSessions: RequestHandler;
    revokeSessions: RequestHandler;
    readPrincipalIdentityId: (response: Response) => string;
  }>;
  mfa: Readonly<{
    authenticate: RequestHandler;
    enroll: RequestHandler;
    manage: RequestHandler;
  }>;
  orderManagement: Readonly<{
    writeUsers: RequestHandler;
    writeOrders: RequestHandler;
  }>;
  production: Readonly<{
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
}>;

const requiredLocationId = (
  request: Request,
  code: 'order_location_required' | 'production_location_required',
): string => {
  const locationId = request.params['locationId'];
  if (typeof locationId === 'string' && locationId.length > 0)
    return locationId;

  const subject = code === 'order_location_required' ? 'Order' : 'Production';
  throw validationError({
    code,
    message: `${subject} location is required.`,
    safeMessage: `${subject} location is required.`,
  });
};

export const makeApiAccessControl = (deps: {
  authorization: AuthorizationModule;
  auth: ApiAuthenticationBoundary;
}): ApiAccessControl => {
  const readOrderLocationResource = async (request: Request) => {
    const locationId = requiredLocationId(request, 'order_location_required');
    const ancestry =
      await deps.authorization.resolveLocationAncestry(locationId);

    return deps.authorization.resources.orderManagementLocation(
      ancestry.locationId,
      ancestry.businessId,
    );
  };

  const readProductionLocationResource = async (request: Request) => {
    const locationId = requiredLocationId(
      request,
      'production_location_required',
    );
    const ancestry =
      await deps.authorization.resolveLocationAncestry(locationId);

    return deps.authorization.resources.productionLocation(
      ancestry.locationId,
      ancestry.businessId,
    );
  };

  const productionGuard = (action: Action): RequestHandler =>
    deps.auth.authorize({
      action,
      policies: deps.authorization.policies.production,
      readResource: readProductionLocationResource,
    });

  return Object.freeze({
    pricing: Object.freeze({
      authenticate: deps.auth.authenticate,
      planPricingChange: deps.auth.authorize({
        action: 'pricing:plan',
        policies: deps.authorization.policies.pricing,
        readResource: (request) =>
          deps.authorization.resources.pricingCatalog(
            request.body as PricingChangeRequest,
          ),
      }),
      publishPricingChange: deps.auth.authorize({
        action: 'pricing:publish',
        policies: deps.authorization.policies.pricing,
        readResource: (request) =>
          deps.authorization.resources.pricingCatalog(
            request.body as PricingChangeRequest,
          ),
      }),
      readAuthor: (response: Response) => {
        const principal = deps.auth.readPrincipal(response);
        return {
          id: principal.identityId,
          kind: principal.kind,
          displayName: principal.displayName,
        };
      },
    }),
    authSessions: Object.freeze({
      authenticate: deps.auth.authenticate,
      readSessions: deps.auth.authorize({
        action: 'auth:session:read',
        policies: deps.authorization.policies.authSessions,
        readResource: (request) => {
          const identityId = request.params['identityId'];
          return deps.authorization.resources.authIdentity(
            Array.isArray(identityId)
              ? (identityId[0] ?? '')
              : (identityId ?? ''),
          );
        },
      }),
      revokeSessions: deps.auth.authorize({
        action: 'auth:session:revoke',
        policies: deps.authorization.policies.authSessions,
        readResource: (request) => {
          const identityId = request.params['identityId'];
          return deps.authorization.resources.authIdentity(
            Array.isArray(identityId)
              ? (identityId[0] ?? '')
              : (identityId ?? ''),
          );
        },
      }),
      readPrincipalIdentityId: (response: Response) =>
        deps.auth.readPrincipal(response).identityId,
    }),
    mfa: Object.freeze({
      authenticate: deps.auth.authenticate,
      enroll: deps.auth.authorize({
        action: 'auth:mfa:enroll',
        policies: deps.authorization.policies.mfa,
        readResource: (_request, response) =>
          deps.authorization.resources.authIdentity(
            deps.auth.readPrincipal(response).identityId,
          ),
      }),
      manage: deps.auth.authorize({
        action: 'auth:mfa:manage',
        policies: deps.authorization.policies.mfa,
        readResource: (_request, response) =>
          deps.authorization.resources.authIdentity(
            deps.auth.readPrincipal(response).identityId,
          ),
      }),
    }),
    orderManagement: Object.freeze({
      writeUsers: deps.auth.authorize({
        action: 'order-management:user:write',
        policies: deps.authorization.policies.orderManagement,
        readResource: deps.authorization.resources.orderManagementUsers,
      }),
      writeOrders: deps.auth.authorize({
        action: 'order-management:order:write',
        policies: deps.authorization.policies.orderManagement,
        readResource: readOrderLocationResource,
      }),
    }),
    production: Object.freeze({
      authenticate: deps.auth.authenticate,
      read: productionGuard('production:read'),
      schedule: productionGuard('production:schedule'),
      accept: productionGuard('production:accept'),
      start: productionGuard('production:start'),
      queue: productionGuard('production:queue'),
      override: productionGuard('production:override'),
      priority: productionGuard('production:priority'),
      intake: productionGuard('production:intake'),
      admission: productionGuard('production:admission'),
      resources: deps.auth.authorize({
        action: 'production:resources',
        policies: deps.authorization.policies.production,
        readResource: deps.authorization.resources.productionOperations,
      }),
      stage: productionGuard('production:stage'),
      readActorId: (response: Response) =>
        deps.auth.readPrincipal(response).identityId,
      readAllowedLocationIds: (response: Response) =>
        deps.authorization.resolveProductionVisibility({
          principalAttributes: deps.auth.readPrincipalAttributes?.(
            response,
          ) ?? {
            assignments: [],
            identityActive: false,
          },
        }),
    }),
  });
};
