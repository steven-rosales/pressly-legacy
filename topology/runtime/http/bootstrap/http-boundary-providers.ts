import {
  sessionAgeMinutes,
  type Principal,
} from '@pressly/access-system/authentication';
import {
  authorize,
  isDenied,
  type Action,
  type AuthEnvironment,
  type AuthResource,
  type PolicyRule,
} from '@pressly/access-system/authorization';
import type { AccessSystem, LoadedSession } from '@pressly/access-system';
import {
  isHttpStatusCode,
  makeAppError,
  type ErrorKind,
  type HttpStatusCode,
} from '@pressly/errors/app-error';
import {
  authError,
  configError,
  externalServiceError,
  invariantViolationError,
  permissionError,
} from '@pressly/errors/factories';
import type { ControlAccess } from '@pressly/experience-control';
import type { HttpBoundaryHostOperation } from '@pressly/http/host-boundary';
import type { AppError } from '@pressly/errors/app-error';
import type { CentsWebhookVerifier } from '@pressly/ingress-system/sources/cents';
import type { SecurityEventSink } from '@pressly/logging';
import type { Clock } from '@pressly/time';
import type { ApiRuntime } from '../runtime/types.ts';
import type { ApiTargetAuthenticationProviders } from './target-authentication-providers.ts';
import type { ApiTargetOwners } from './target-owners.ts';
import type {
  ApiHttpBoundaryAuthorizationProvider,
  ApiBoundaryRequest,
  ApiBoundaryRequestHandler,
  ApiBoundaryResponse,
  ApiHttpBoundaryContextProvider,
  ApiHttpBoundaryExpectedFailureProvider,
  ApiHttpBoundaryMiddlewareProvider,
  RateLimitStore,
} from './boundary-provider-types.ts';

export type EventStreamBoundaryOperation = Readonly<{
  operationId: string;
  observability: string;
  method: 'GET';
  path: string;
  authentication: 'none' | 'required';
  authorization: Readonly<{
    capability: string;
    timing: 'after-input' | 'before-input';
  }> | null;
}>;

type BoundaryOperation =
  | EventStreamBoundaryOperation
  | HttpBoundaryHostOperation;

type RateLimiterInput = Readonly<{
  name: string;
  limit: number;
  windowMs: number;
  store: RateLimitStore;
  logger: ApiRuntime['logger'];
  securityEvents: ApiRuntime['securityEvents'];
}>;

export type ApiHttpBoundaryMechanisms<
  Request extends ApiBoundaryRequest = ApiBoundaryRequest,
  Response extends ApiBoundaryResponse = ApiBoundaryResponse,
> = Readonly<{
  continueRequest: ApiBoundaryRequestHandler<Request, Response>;
  invokeMiddleware: (
    handler: ApiBoundaryRequestHandler<Request, Response>,
    request: Request,
    response: Response,
  ) => Promise<void>;
  jsonDocument: ApiHttpBoundaryMiddlewareProvider<Request, Response>;
  jsonDocument64kb: ApiHttpBoundaryMiddlewareProvider<Request, Response>;
  rawDocument256kb: ApiHttpBoundaryMiddlewareProvider<Request, Response>;
  makeIpRateLimiter: (
    input: RateLimiterInput,
  ) => ApiBoundaryRequestHandler<Request, Response>;
  makeIdentityRateLimiter: (
    input: RateLimiterInput,
  ) => ApiBoundaryRequestHandler<Request, Response>;
  makeRawBodyAuthentication: (input: {
    verify: CentsWebhookVerifier;
    unavailable: (cause?: unknown) => unknown;
    rejected: (kind: string) => unknown;
    accepted?: (locals: Record<string, unknown>) => void;
  }) => ApiBoundaryRequestHandler<Request, Response>;
  observeError: (
    runtime: ApiRuntime,
    input: {
      appError: AppError;
      request: Request;
      requestId?: string;
    },
  ) => unknown;
}>;

export type ApiAccessPolicyAuthorization<
  Request extends ApiBoundaryRequest = ApiBoundaryRequest,
  Response extends ApiBoundaryResponse = ApiBoundaryResponse,
> = (
  input: Readonly<{
    operation: BoundaryOperation;
    request: Request;
    response: Response;
    capability: string;
    scope: string;
  }>,
) => Promise<void>;

export type ApiHttpBoundaryProviders<
  Request extends ApiBoundaryRequest = ApiBoundaryRequest,
  Response extends ApiBoundaryResponse = ApiBoundaryResponse,
> = Readonly<{
  providers: Readonly<{
    requestContext: (
      operation: HttpBoundaryHostOperation,
    ) => ApiBoundaryRequestHandler<Request, Response>;
    middleware: Readonly<
      Record<string, ApiHttpBoundaryMiddlewareProvider<Request, Response>>
    >;
    context: Readonly<
      Record<string, ApiHttpBoundaryContextProvider<Request, Response>>
    >;
    authorization: Readonly<
      Record<string, ApiHttpBoundaryAuthorizationProvider<Request, Response>>
    >;
    expectedFailure: Readonly<
      Record<string, ApiHttpBoundaryExpectedFailureProvider<Request>>
    >;
  }>;
  authorizeAccessPolicy: ApiAccessPolicyAuthorization<Request, Response>;
}>;

type AuthorizationDependencies = Readonly<{
  access: AccessSystem;
  clock: Clock;
  securityEvents: SecurityEventSink;
}>;

const readAuthentication = (response: ApiBoundaryResponse): LoadedSession => {
  const authentication = response.locals['auth'] as LoadedSession | undefined;
  if (authentication !== undefined) return authentication;
  throw authError({
    code: 'missing_auth_context',
    message: 'Auth middleware did not run before authorization.',
    safeMessage: 'Authentication is required.',
  });
};

export const readApiAuthenticatedPrincipal = (
  response: ApiBoundaryResponse,
): Principal => {
  const authentication = response.locals['auth'] as
    | Partial<LoadedSession>
    | undefined;
  if (authentication?.principal !== undefined) return authentication.principal;
  throw authError({
    code: 'missing_auth_principal',
    message: 'Authenticated principal is missing from request locals.',
    safeMessage: 'Authentication is required.',
  });
};

const environmentFrom = (
  request: ApiBoundaryRequest,
  principal: Principal,
  now: Date,
): AuthEnvironment => {
  const userAgent = request.header('user-agent');
  return {
    now,
    ...(request.ip === undefined ? {} : { ipAddress: request.ip }),
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(principal.sessionIssuedAt === undefined
      ? {}
      : {
          sessionAgeMinutes: sessionAgeMinutes(
            { issuedAt: principal.sessionIssuedAt },
            now,
          ),
        }),
  };
};

const authorizeResource = <Resource extends AuthResource>(input: {
  action: Action;
  policies: readonly PolicyRule<Resource>[];
  resource: Resource;
  request: ApiBoundaryRequest;
  response: ApiBoundaryResponse;
  clock: Clock;
  securityEvents: SecurityEventSink;
}): void => {
  const authentication = readAuthentication(input.response);
  const environment = environmentFrom(
    input.request,
    authentication.principal,
    input.clock.now(),
  );
  const decision = authorize({
    principal: authentication.principal,
    principalAttributes: authentication.principalAttributes,
    action: input.action,
    resource: input.resource,
    environment,
    policies: input.policies,
  });

  if (isDenied(decision)) {
    const requestId = input.response.locals['requestId'] as string | undefined;
    input.securityEvents.emit({
      name: 'authorization.denied',
      occurredAt: environment.now.toISOString(),
      outcome: 'denied',
      ...(requestId === undefined ? {} : { requestId }),
      principalId: authentication.principal.identityId,
      ...(authentication.principal.sessionId === undefined
        ? {}
        : { sessionId: authentication.principal.sessionId }),
      action: input.action,
      resourceType: input.resource.kind,
      ...(input.resource.id === undefined
        ? {}
        : { resourceId: input.resource.id }),
      reason: decision.reason,
    });
    throw permissionError({
      code: decision.reason,
      message: decision.safeMessage,
      safeMessage: decision.safeMessage,
      details: {
        ...(decision.details ?? {}),
        action: input.action,
        resource: input.resource.kind,
        scope: input.resource.scope,
        policyId: decision.policyId,
      },
    });
  }

  input.response.locals['authorization'] = {
    action: input.action,
    resource: input.resource,
    decision,
  };
};

const invalidAuthorizationScope = (
  operation: BoundaryOperation,
  scope: string,
): never => {
  throw configError({
    code: 'api_http_boundary_authorization_scope_invalid',
    message: `Operation "${operation.operationId}" supplied unsupported authorization scope "${scope}".`,
    details: { operationId: operation.operationId, scope },
  });
};

const scopedIdentityId = (
  operation: BoundaryOperation,
  scope: string,
): string => {
  const prefix = 'auth.identity:';
  return scope.startsWith(prefix) && scope.length > prefix.length
    ? scope.slice(prefix.length)
    : invalidAuthorizationScope(operation, scope);
};

const scopedPricingService = (
  operation: BoundaryOperation,
  scope: string,
): string => {
  const prefix = 'pricing:';
  const suffix = ':global';
  return scope.startsWith(prefix) &&
    scope.endsWith(suffix) &&
    scope.length > prefix.length + suffix.length
    ? scope.slice(prefix.length, -suffix.length)
    : invalidAuthorizationScope(operation, scope);
};

const locationAncestry = async (
  access: AccessSystem,
  operation: BoundaryOperation,
  locationId: string,
) => {
  if (locationId.trim() === '')
    invalidAuthorizationScope(operation, locationId);
  const resolved =
    await access.cells.resolveLocationAncestry.execute(locationId);
  if (resolved.kind === 'success') return resolved.value;
  throw invariantViolationError({
    code: 'api_location_ancestry_unexpected_failure',
    message: `Location ancestry returned an undeclared failure for operation "${operation.operationId}".`,
    safeMessage: 'The request location could not be resolved.',
    details: { operationId: operation.operationId, locationId },
  });
};

export const makeApiAccessPolicyAuthorization =
  <Request extends ApiBoundaryRequest, Response extends ApiBoundaryResponse>(
    dependencies: AuthorizationDependencies,
  ): ApiAccessPolicyAuthorization<Request, Response> =>
  async (input): Promise<void> => {
    const shared = {
      request: input.request,
      response: input.response,
      clock: dependencies.clock,
      securityEvents: dependencies.securityEvents,
    };

    if (
      input.capability === 'auth:session:read' ||
      input.capability === 'auth:session:revoke'
    ) {
      authorizeResource({
        ...shared,
        action: input.capability,
        policies: dependencies.access.policies.authSessions,
        resource: dependencies.access.resources.authIdentity(
          scopedIdentityId(input.operation, input.scope),
        ),
      });
      return;
    }

    if (
      input.capability === 'auth:mfa:enroll' ||
      input.capability === 'auth:mfa:manage'
    ) {
      authorizeResource({
        ...shared,
        action: input.capability,
        policies: dependencies.access.policies.mfa,
        resource: dependencies.access.resources.authIdentity(
          scopedIdentityId(input.operation, input.scope),
        ),
      });
      return;
    }

    if (
      input.capability === 'pricing:plan' ||
      input.capability === 'pricing:publish'
    ) {
      authorizeResource({
        ...shared,
        action: input.capability,
        policies: dependencies.access.policies.pricing,
        resource: dependencies.access.resources.pricingCatalog({
          serviceSlug: scopedPricingService(input.operation, input.scope),
        }),
      });
      return;
    }

    if (input.capability === 'orders:manage') {
      const ancestry = await locationAncestry(
        dependencies.access,
        input.operation,
        input.scope,
      );
      authorizeResource({
        ...shared,
        action: 'order-management:order:write',
        policies: dependencies.access.policies.orderManagement,
        resource: dependencies.access.resources.orderManagementLocation(
          ancestry.locationId,
          ancestry.businessId,
        ),
      });
      return;
    }

    if (input.capability === 'production:resources') {
      authorizeResource({
        ...shared,
        action: input.capability,
        policies: dependencies.access.policies.production,
        resource: dependencies.access.resources.productionOperations(),
      });
      return;
    }

    if (input.capability.startsWith('production:')) {
      const ancestry = await locationAncestry(
        dependencies.access,
        input.operation,
        input.scope,
      );
      authorizeResource({
        ...shared,
        action: input.capability as Action,
        policies: dependencies.access.policies.production,
        resource: dependencies.access.resources.productionLocation(
          ancestry.locationId,
          ancestry.businessId,
        ),
      });
      return;
    }

    throw configError({
      code: 'api_http_boundary_authorization_capability_unknown',
      message: `Operation "${input.operation.operationId}" requested unsupported capability "${input.capability}".`,
      details: {
        operationId: input.operation.operationId,
        capability: input.capability,
      },
    });
  };

const controlAccess = (response: ApiBoundaryResponse): ControlAccess => {
  const access = response.locals['controlAccess'] as ControlAccess | undefined;
  if (access !== undefined) return access;
  throw authError({
    code: 'control_access_context_missing',
    message: 'Control authentication did not establish an access context.',
    safeMessage: 'Authentication is required.',
  });
};

const controlAuthorization: ApiHttpBoundaryAuthorizationProvider = ({
  response,
  capability,
}) => {
  const access = controlAccess(response);
  if (access.capabilities.includes(capability as never)) {
    response.locals['authorization'] = { capability, access };
    return;
  }
  throw permissionError({
    code: 'control_capability_denied',
    message: `Control capability ${capability} was denied.`,
    safeMessage: 'You do not have permission to perform this action.',
  });
};

const chain =
  <Request extends ApiBoundaryRequest, Response extends ApiBoundaryResponse>(
    invoke: ApiHttpBoundaryMechanisms<Request, Response>['invokeMiddleware'],
    ...handlers: readonly ApiBoundaryRequestHandler<Request, Response>[]
  ): ApiBoundaryRequestHandler<Request, Response> =>
  async (request, response, next): Promise<void> => {
    for (const handler of handlers) {
      await invoke(handler, request, response);
      if (response.writableEnded || response.destroyed) return;
    }
    next();
  };

const requestMetadata: ApiHttpBoundaryContextProvider = ({
  request,
  response,
}) =>
  Object.freeze({
    requestMetadata: Object.freeze({
      ...(request.ip === undefined ? {} : { ipAddress: request.ip }),
      ...(request.header('user-agent') === undefined
        ? {}
        : { userAgent: request.header('user-agent') }),
      ...((response.locals['requestId'] as string | undefined) === undefined
        ? {}
        : { requestId: response.locals['requestId'] as string }),
    }),
  });

const authenticatedPrincipal: ApiHttpBoundaryContextProvider = ({
  response,
}) => {
  const principal = readApiAuthenticatedPrincipal(response);
  if (principal.sessionId === undefined)
    throw invariantViolationError({
      code: 'authenticated_principal_session_missing',
      message: 'Authenticated principal context has no session identity.',
      safeMessage: 'Session could not be loaded.',
    });
  return Object.freeze({
    principal: Object.freeze({
      identityId: principal.identityId,
      sessionId: principal.sessionId,
      label: principal.email ?? principal.displayName ?? principal.identityId,
    }),
  });
};

const authenticatedActor: ApiHttpBoundaryContextProvider = ({ response }) =>
  Object.freeze({
    actorId: readApiAuthenticatedPrincipal(response).identityId,
  });

const controlRequestContext: ApiHttpBoundaryContextProvider = ({
  response,
}) => {
  const principal = readApiAuthenticatedPrincipal(response);
  if (principal.sessionId === undefined)
    throw invariantViolationError({
      code: 'control_actor_missing',
      message:
        'Control application request has no authenticated actor session.',
      safeMessage: 'Session could not be loaded.',
    });
  return Object.freeze({
    access: controlAccess(response),
    actor: Object.freeze({
      identityId: principal.identityId,
      sessionId: principal.sessionId,
    }),
    command: Object.freeze({
      origin: 'pressly_control' as const,
      principal: Object.freeze({
        kind: principal.kind,
        id: principal.identityId,
      }),
    }),
  });
};

const locationIdFrom = (request: ApiBoundaryRequest): string => {
  const locationId = request.params['locationId'];
  if (typeof locationId === 'string' && locationId.trim() !== '')
    return locationId;
  throw invariantViolationError({
    code: 'order_management_location_context_missing',
    message: 'Order-management request has no validated location context.',
    safeMessage: 'The request could not be completed.',
  });
};

const expectedFailureKind = (status: HttpStatusCode): ErrorKind => {
  if (status === 400 || status === 413 || status === 415 || status === 422)
    return 'ValidationError';
  if (status === 401) return 'AuthError';
  if (status === 403) return 'PermissionError';
  if (status === 404) return 'NotFoundError';
  if (status === 409) return 'ConflictError';
  if (status === 429) return 'RateLimitError';
  return 'UnexpectedError';
};

const record = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const expectedFailureObserver =
  <Request extends ApiBoundaryRequest, Response extends ApiBoundaryResponse>(
    runtime: ApiRuntime,
    observeError: ApiHttpBoundaryMechanisms<Request, Response>['observeError'],
  ): ApiHttpBoundaryExpectedFailureProvider<Request> =>
  (input) => {
    const status = isHttpStatusCode(input.status) ? input.status : 500;
    const failure = record(input.failure) ? input.failure : {};
    const code =
      typeof failure['code'] === 'string'
        ? failure['code']
        : 'http_cell_expected_failure';
    const message =
      typeof failure['message'] === 'string'
        ? failure['message']
        : `Operation "${input.operation.operationId}" returned an expected failure.`;
    const safeMessage =
      typeof failure['safeMessage'] === 'string'
        ? failure['safeMessage']
        : message;
    const traceId =
      typeof failure['traceId'] === 'string'
        ? failure['traceId']
        : (input.response.locals['requestId'] as string | undefined);
    observeError(runtime, {
      appError: makeAppError({
        kind: expectedFailureKind(status),
        status,
        code,
        message,
        safeMessage,
        details: input.failure,
        ...(traceId === undefined ? {} : { traceId }),
      }),
      request: input.request,
      ...(traceId === undefined ? {} : { requestId: traceId }),
    });
  };

export const makeApiHttpBoundaryProviders = <
  Request extends ApiBoundaryRequest,
  Response extends ApiBoundaryResponse,
>(input: {
  owners: ApiTargetOwners;
  authentication: ApiTargetAuthenticationProviders<Request, Response>;
  runtime: ApiRuntime;
  clock: Clock;
  rateLimitStore: RateLimitStore;
  centsWebhookVerifier: CentsWebhookVerifier;
  mechanisms: ApiHttpBoundaryMechanisms<Request, Response>;
}): ApiHttpBoundaryProviders<Request, Response> => {
  const rateInput = {
    store: input.rateLimitStore,
    logger: input.runtime.logger,
    securityEvents: input.runtime.securityEvents,
  };
  const authLogin = input.mechanisms.makeIpRateLimiter({
    name: 'auth_login',
    ...input.runtime.env.rateLimits.login,
    ...rateInput,
  });
  const processorAuthLogin = input.mechanisms.makeIpRateLimiter({
    name: 'processor_auth_login',
    ...input.runtime.env.rateLimits.login,
    ...rateInput,
  });
  const controlAuthLogin = input.mechanisms.makeIpRateLimiter({
    name: 'control_auth_login',
    ...input.runtime.env.rateLimits.login,
    ...rateInput,
  });
  const controlBoundary = input.mechanisms.makeIpRateLimiter({
    name: 'control_boundary',
    ...input.runtime.env.rateLimits.controlMutation,
    ...rateInput,
  });
  const controlInvitationAccept = input.mechanisms.makeIpRateLimiter({
    name: 'control_invitation_accept',
    ...input.runtime.env.rateLimits.invitationAccept,
    ...rateInput,
  });
  const controlIdentity = input.mechanisms.makeIdentityRateLimiter({
    name: 'control_identity',
    ...input.runtime.env.rateLimits.controlMutation,
    ...rateInput,
  });
  const authorizeAccessPolicy = makeApiAccessPolicyAuthorization({
    access: input.owners.systems.access,
    clock: input.clock,
    securityEvents: input.runtime.securityEvents,
  });
  const observeExpectedFailure = expectedFailureObserver(
    input.runtime,
    input.mechanisms.observeError,
  );

  const middleware = {
    ...input.authentication.middleware,
    auth_login: (() => authLogin) satisfies ApiHttpBoundaryMiddlewareProvider<
      Request,
      Response
    >,
    processor_auth_login: (() =>
      processorAuthLogin) satisfies ApiHttpBoundaryMiddlewareProvider<
      Request,
      Response
    >,
    'control-auth-login-rate-chain': (() =>
      chain(
        input.mechanisms.invokeMiddleware,
        controlAuthLogin,
        controlBoundary,
      )) satisfies ApiHttpBoundaryMiddlewareProvider<Request, Response>,
    'control-boundary': (() =>
      controlBoundary) satisfies ApiHttpBoundaryMiddlewareProvider<
      Request,
      Response
    >,
    'control-identity': (() =>
      controlIdentity) satisfies ApiHttpBoundaryMiddlewareProvider<
      Request,
      Response
    >,
    'control-invitation-accept-rate-chain': (() =>
      chain(
        input.mechanisms.invokeMiddleware,
        controlInvitationAccept,
        controlBoundary,
      )) satisfies ApiHttpBoundaryMiddlewareProvider<Request, Response>,
    'cents-webhook': (() =>
      input.mechanisms.makeRawBodyAuthentication({
        verify: input.centsWebhookVerifier,
        unavailable: (cause) =>
          externalServiceError({
            code: 'cents_webhook_verification_unavailable',
            message:
              'Cents webhook verification is not configured or could not run.',
            safeMessage: 'Vendor webhook receipt is not configured.',
            status: 503,
            ...(cause === undefined ? {} : { cause }),
          }),
        rejected: (kind) =>
          kind === 'verification_unavailable'
            ? externalServiceError({
                code: 'cents_webhook_verification_unavailable',
                message: 'Cents webhook verification is unavailable.',
                safeMessage: 'Vendor webhook receipt is not configured.',
                status: 503,
              })
            : authError({
                code: 'invalid_cents_webhook_authentication',
                message: 'Cents webhook authentication failed.',
                safeMessage: 'Vendor webhook authentication failed.',
              }),
        accepted: (locals) => {
          locals['webhookSource'] = 'cents';
        },
      })) satisfies ApiHttpBoundaryMiddlewareProvider<Request, Response>,
    'json-document': input.mechanisms.jsonDocument,
    'json-document-64kb': input.mechanisms.jsonDocument64kb,
    'raw-document-256kb': input.mechanisms.rawDocument256kb,
  };

  const context = {
    ...input.authentication.context,
    'allowed-production-location-ids': (async ({ response }) => {
      const resolved =
        await input.owners.systems.access.cells.resolveProductionVisibility.execute(
          {
            principalAttributes:
              readAuthentication(response).principalAttributes,
          },
        );
      if (resolved.kind === 'failure')
        throw invariantViolationError({
          code: 'api_production_visibility_unexpected_failure',
          message: 'Production visibility returned an undeclared failure.',
          safeMessage: 'Production locations could not be resolved.',
        });
      return Object.freeze({ allowedLocationIds: resolved.value });
    }) satisfies ApiHttpBoundaryContextProvider<Request, Response>,
    'authenticated-actor': authenticatedActor,
    'authenticated-principal': authenticatedPrincipal,
    'control-request-context': controlRequestContext,
    'order-management-business-id': (async ({ operation, request }) => {
      const ancestry = await locationAncestry(
        input.owners.systems.access,
        operation,
        locationIdFrom(request),
      );
      return Object.freeze({
        orderManagementBusinessId: ancestry.businessId,
      });
    }) satisfies ApiHttpBoundaryContextProvider<Request, Response>,
    'order-management-principal': (({ response }) => {
      const principal = readApiAuthenticatedPrincipal(response);
      return Object.freeze({
        orderManagementPrincipal: Object.freeze({
          identityId: principal.identityId,
          kind: principal.kind,
        }),
      });
    }) satisfies ApiHttpBoundaryContextProvider<Request, Response>,
    'pricing-change-author': (({ response }) => {
      const principal = readApiAuthenticatedPrincipal(response);
      return Object.freeze({
        pricingChangeAuthor: Object.freeze({
          id: principal.identityId,
          kind: principal.kind,
          displayName: principal.displayName,
        }),
      });
    }) satisfies ApiHttpBoundaryContextProvider<Request, Response>,
    'request-metadata': requestMetadata,
  };

  return Object.freeze({
    providers: Object.freeze({
      requestContext: () => input.mechanisms.continueRequest,
      middleware: Object.freeze(middleware),
      context: Object.freeze(context),
      authorization: Object.freeze({
        'access-policy': authorizeAccessPolicy,
        'control-capability': controlAuthorization,
      }),
      expectedFailure: Object.freeze({
        'central-api-error-observation': observeExpectedFailure,
        'cookie-auth-failure': observeExpectedFailure,
      }),
    }),
    authorizeAccessPolicy,
  });
};
