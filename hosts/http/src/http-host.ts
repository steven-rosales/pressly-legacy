import type {
  ContractIssue,
  ExecutableHttpCatalog,
  HttpBoundaryProfile,
  HttpInvalidRequestDescriptor,
  HttpMethod,
  HttpRequest,
  HttpRequestHead,
  HttpRequestInput,
  HttpRequestValidationLocation,
  HttpResponse,
  HttpResponseHeaderValue,
} from '@pressly/cells';
import {
  configError,
  invariantViolationError,
  validationError,
} from '@pressly/errors/factories';
import type { Request, RequestHandler, Response, Router } from 'express';
import { setHttpResponseHeaders } from './response-headers.ts';

type HttpCatalogEntry = ExecutableHttpCatalog['entries'][number];

export type HttpHostOperation = Readonly<{
  operationId: string;
  observability: string;
  method: HttpMethod;
  path: string;
  bodyLimit: string | null;
  authentication: 'none' | 'required';
  contextRequirements: readonly string[];
  authorization: Readonly<{
    capability: string;
    timing: 'after-input' | 'before-input';
  }> | null;
}>;

export type HttpBoundaryHostOperation = HttpHostOperation &
  Readonly<{
    boundaryProfileId: string;
  }>;

type HttpBoundaryMiddlewareBase = Readonly<{
  operation: HttpBoundaryHostOperation;
  provider: string;
}>;

export type HttpBoundaryMiddlewareInput =
  | (HttpBoundaryMiddlewareBase &
      Readonly<{
        kind: 'authentication';
        required: boolean;
      }>)
  | (HttpBoundaryMiddlewareBase &
      Readonly<{
        kind:
          | 'csrf'
          | 'exact-origin'
          | 'identity-rate-limit'
          | 'request-rate-limit';
      }>)
  | (HttpBoundaryMiddlewareBase &
      Readonly<{
        kind: 'request-body-parser';
        acceptedContentTypes: readonly string[];
        contentType: 'parse-if-matching' | 'required';
        limit: string | null;
      }>);

export type HttpExpectedFailureObservationInput = Readonly<{
  operation: HttpBoundaryHostOperation;
  provider: string;
  request: Request;
  response: Readonly<{
    headersSent: boolean;
    locals: Readonly<Record<string, unknown>>;
  }>;
  failure: unknown;
  status: number;
}>;

export type HttpBoundaryHostDependencies = Readonly<{
  requestContext: (operation: HttpBoundaryHostOperation) => RequestHandler;
  middleware: (input: HttpBoundaryMiddlewareInput) => RequestHandler;
  readCellContext: (
    input: Readonly<{
      operation: HttpBoundaryHostOperation;
      providers: readonly string[];
      request: Request;
      response: Response;
    }>,
  ) => Promise<unknown> | unknown;
  authorize: (
    input: Readonly<{
      operation: HttpBoundaryHostOperation;
      provider: string;
      request: Request;
      response: Response;
      capability: string;
      scope: string;
    }>,
  ) => Promise<void> | void;
  /** Observation is secondary and must never write the HTTP response. */
  observeExpectedFailure?: (
    input: HttpExpectedFailureObservationInput,
  ) => Promise<void> | void;
  observeResponse?: (input: {
    operation: HttpBoundaryHostOperation;
    status: number;
  }) => Promise<void> | void;
}>;

export type HttpHostDependencies = Readonly<{
  requestContext: (operation: HttpHostOperation) => RequestHandler;
  authentication: (
    input: Readonly<{
      operation: HttpHostOperation;
      required: boolean;
    }>,
  ) => RequestHandler;
  body: (
    input: Readonly<{
      operation: HttpHostOperation;
      limit: string | null;
    }>,
  ) => RequestHandler;
  readCellContext: (
    operation: HttpHostOperation,
    request: Request,
    response: Response,
  ) => Promise<unknown> | unknown;
  authorize: (
    input: Readonly<{
      operation: HttpHostOperation;
      request: Request;
      response: Response;
      capability: string;
      scope: string;
    }>,
  ) => Promise<void> | void;
}>;

export type HttpCatalogRouter = Pick<
  Router,
  'delete' | 'get' | 'patch' | 'post' | 'put'
>;

const operationFrom = (entry: HttpCatalogEntry): HttpHostOperation => ({
  operationId: entry.operationId,
  observability: entry.cell.observability.operation,
  method: entry.surface.method,
  path: entry.surface.path,
  bodyLimit: entry.surface.bodyLimit,
  authentication: entry.cell.authentication,
  contextRequirements: entry.surface.contextRequirements,
  authorization:
    entry.authorization === null
      ? null
      : {
          capability: entry.authorization.capability,
          timing: entry.authorization.timing,
        },
});

const boundaryOperationFrom = (
  entry: HttpCatalogEntry,
  profile: HttpBoundaryProfile,
): HttpBoundaryHostOperation =>
  Object.freeze({
    ...operationFrom(entry),
    boundaryProfileId: profile.id,
  });

const requestHeaders = (
  request: Request,
): Readonly<Record<string, string | undefined>> =>
  Object.fromEntries(
    Object.entries(request.headers).map(
      ([name, value]): [string, string | undefined] => [
        name,
        value === undefined
          ? undefined
          : Array.isArray(value)
            ? value.join(', ')
            : String(value),
      ],
    ),
  );

const requestHead = (request: Request): HttpRequestHead => ({
  params: Object.fromEntries(
    Object.entries(request.params).map(
      ([name, value]): [string, string | undefined] => [
        name,
        typeof value === 'string' ? value : undefined,
      ],
    ),
  ),
  query: request.query,
  headers: requestHeaders(request),
});

const httpRequestInput = (request: Request): HttpRequestInput => ({
  ...requestHead(request),
  body: request.body as unknown,
});

const httpRequest = (
  request: HttpRequestInput,
  context: unknown,
): HttpRequest => ({
  ...request,
  context,
});

const publicValidationIssues = (
  location: HttpRequestValidationLocation,
  issues: readonly ContractIssue[],
) =>
  issues.map((issue) => ({
    path: (issue.path[0] === location ? issue.path.slice(1) : issue.path)
      .map(String)
      .join('.'),
    message: issue.message,
  }));

const declaredInvalidRequest = (
  descriptor: HttpInvalidRequestDescriptor,
  issues: readonly ContractIssue[],
) =>
  validationError({
    code: descriptor.code,
    message: descriptor.message,
    ...(descriptor.safeMessage === undefined
      ? {}
      : { safeMessage: descriptor.safeMessage }),
    ...(descriptor.status === undefined ? {} : { status: descriptor.status }),
    publicDetails: {
      location: descriptor.location,
      issues: publicValidationIssues(descriptor.location, issues),
    },
  });

const invalidContractInput = (
  entry: HttpCatalogEntry,
  issues: readonly ContractIssue[],
) => {
  const descriptor = entry.surface.invalidRequest.input;
  return descriptor === null
    ? validationError({
        code: 'http_cell_input_invalid',
        message: `Input decoding failed for operation "${entry.operationId}".`,
        safeMessage: 'Invalid request input.',
        details: { operationId: entry.operationId, issues },
      })
    : declaredInvalidRequest(descriptor, issues);
};

const invalidAuthorizationScope = (
  entry: HttpCatalogEntry,
  issues: readonly ContractIssue[],
) => {
  const descriptor = entry.surface.invalidRequest.authorizationScope;
  return descriptor === null
    ? validationError({
        code: 'http_cell_authorization_scope_invalid',
        message: `Authorization scope decoding failed for operation "${entry.operationId}".`,
        safeMessage: 'Invalid request scope.',
        details: { operationId: entry.operationId, issues },
      })
    : declaredInvalidRequest(descriptor, issues);
};

const missingAuthorizationScope = (entry: HttpCatalogEntry) =>
  invariantViolationError({
    code: 'http_cell_authorization_scope_missing',
    message: `Operation "${entry.operationId}" reached authorization without its decoded scope.`,
    details: { operationId: entry.operationId },
  });

const invalidHttpResponse = (entry: HttpCatalogEntry, response: HttpResponse) =>
  invariantViolationError({
    code: 'http_cell_response_invalid',
    message: `Operation "${entry.operationId}" presented invalid HTTP status "${String(response.status)}".`,
    details: { operationId: entry.operationId, response },
  });

const assertHttpResponse = (
  entry: HttpCatalogEntry,
  response: HttpResponse,
): void => {
  if (
    !Number.isInteger(response.status) ||
    response.status < 100 ||
    response.status > 599
  )
    throw invalidHttpResponse(entry, response);
};

const unsupportedContentType = (
  entry: HttpCatalogEntry,
  actual: string | undefined,
  accepted: readonly string[],
  presentation: Readonly<{ code: string; safeMessage: string }> | undefined,
) =>
  validationError({
    code: presentation?.code ?? 'http_boundary_content_type_unsupported',
    message: `Operation "${entry.operationId}" received unsupported content type "${actual ?? '<missing>'}".`,
    safeMessage:
      presentation?.safeMessage ?? 'Unsupported request content type.',
    status: 415,
    details: {
      operationId: entry.operationId,
      actual: actual ?? null,
      accepted,
    },
  });

const sendResponse = (
  entry: HttpCatalogEntry,
  response: Response,
  presented: HttpResponse,
  enforcedHeaders: Readonly<
    Record<string, HttpResponseHeaderValue>
  > = Object.freeze({}),
): void => {
  assertHttpResponse(entry, presented);

  response.status(presented.status);
  if (presented.headers !== undefined)
    setHttpResponseHeaders(response, presented.headers);
  setHttpResponseHeaders(response, enforcedHeaders);

  if (presented.body === undefined) {
    response.end();
    return;
  }

  response.send(presented.body);
};

const authorizationHandler =
  (
    entry: HttpCatalogEntry,
    operation: HttpHostOperation,
    dependencies: Pick<HttpHostDependencies, 'authorize'>,
    scopes: WeakMap<Request, string>,
  ): RequestHandler =>
  async (request, response, next): Promise<void> => {
    const authorization = entry.authorization;
    if (authorization === null || authorization.timing !== 'before-input') {
      next();
      return;
    }

    const scope = scopes.get(request);
    if (scope === undefined) throw missingAuthorizationScope(entry);

    await dependencies.authorize({
      operation,
      request,
      response,
      capability: authorization.capability,
      scope,
    });
    if (response.writableEnded || response.destroyed) return;
    next();
  };

const authorizationScopeHandler =
  (entry: HttpCatalogEntry, scopes: WeakMap<Request, string>): RequestHandler =>
  (request, _response, next): void => {
    const authorization = entry.authorization;
    if (authorization === null || authorization.timing !== 'before-input') {
      next();
      return;
    }

    const decoded = authorization.decodeScope(requestHead(request));
    if (decoded.kind === 'invalid')
      throw invalidAuthorizationScope(entry, decoded.issues);

    scopes.set(request, decoded.value);
    next();
  };

const afterInputAuthorizationHandler =
  (
    entry: HttpCatalogEntry,
    operation: HttpHostOperation,
    dependencies: Pick<HttpHostDependencies, 'authorize'>,
    validatedRequests: WeakSet<Request>,
  ): RequestHandler =>
  async (request, response, next): Promise<void> => {
    const authorization = entry.authorization;
    if (
      authorization === null ||
      authorization.timing !== 'after-input' ||
      authorization.decodeScope === null
    ) {
      next();
      return;
    }

    if (!validatedRequests.has(request)) {
      entry.validateRequest(httpRequestInput(request));
      validatedRequests.add(request);
    }
    const decoded = authorization.decodeScope(requestHead(request));
    if (decoded.kind === 'invalid')
      throw invalidAuthorizationScope(entry, decoded.issues);

    await dependencies.authorize({
      operation,
      request,
      response,
      capability: authorization.capability,
      scope: decoded.value,
    });
    if (response.writableEnded || response.destroyed) return;
    next();
  };

const executionHandler =
  (
    entry: HttpCatalogEntry,
    operation: HttpHostOperation,
    dependencies: Pick<HttpHostDependencies, 'authorize' | 'readCellContext'>,
    validatedRequests: WeakSet<Request>,
    enforcedHeaders: Readonly<
      Record<string, HttpResponseHeaderValue>
    > = Object.freeze({}),
    expectedFailureObservation: Readonly<{
      operation: HttpBoundaryHostOperation;
      provider: string;
      observe: NonNullable<
        HttpBoundaryHostDependencies['observeExpectedFailure']
      >;
    }> | null = null,
  ): RequestHandler =>
  async (request, response): Promise<void> => {
    const requestInput = httpRequestInput(request);
    if (!validatedRequests.has(request)) entry.validateRequest(requestInput);
    const context = await dependencies.readCellContext(
      operation,
      request,
      response,
    );
    if (response.writableEnded || response.destroyed) return;

    const decoded = entry.decodeRequest(httpRequest(requestInput, context));

    if (decoded.kind === 'invalid')
      throw invalidContractInput(entry, decoded.issues);

    const authorization = entry.authorization;
    if (
      authorization?.timing === 'after-input' &&
      authorization.decodeScope === null
    )
      await dependencies.authorize({
        operation,
        request,
        response,
        capability: authorization.capability,
        scope: authorization.resolveScope(decoded.value),
      });
    if (response.writableEnded || response.destroyed) return;

    const outcome = await entry.execute(decoded.value);
    const presented = entry.present(outcome);
    assertHttpResponse(entry, presented);
    if (outcome.kind === 'failure' && expectedFailureObservation !== null) {
      try {
        await expectedFailureObservation.observe({
          operation: expectedFailureObservation.operation,
          provider: expectedFailureObservation.provider,
          request,
          response: Object.freeze({
            headersSent: response.headersSent,
            locals: Object.freeze({ ...response.locals }),
          }),
          failure: outcome.failure,
          status: presented.status,
        });
      } catch {
        // Observation is isolated so it cannot replace or duplicate the wire response.
      }
    }
    sendResponse(entry, response, presented, enforcedHeaders);
  };

const inputValidationHandler =
  (
    entry: HttpCatalogEntry,
    validatedRequests: WeakSet<Request>,
  ): RequestHandler =>
  (request, _response, next): void => {
    if (!validatedRequests.has(request)) {
      entry.validateRequest(httpRequestInput(request));
      validatedRequests.add(request);
    }
    next();
  };

const noStoreHandler: RequestHandler = (_request, response, next): void => {
  response.set('Cache-Control', 'no-store');
  next();
};

const contentTypeHandler =
  (
    entry: HttpCatalogEntry,
    acceptedContentTypes: readonly string[],
    presentation: Readonly<{ code: string; safeMessage: string }> | undefined,
  ): RequestHandler =>
  (request, _response, next): void => {
    const actual = request.get('content-type')?.toLowerCase();
    if (!requestContentTypeMatches(request, acceptedContentTypes))
      throw unsupportedContentType(
        entry,
        actual,
        acceptedContentTypes,
        presentation,
      );
    next();
  };

const requestContentTypeMatches = (
  request: Request,
  acceptedContentTypes: readonly string[],
): boolean => {
  const actual = request.get('content-type')?.toLowerCase();
  const actualMediaType = actual?.split(';', 1)[0]?.trim();
  return acceptedContentTypes.some(
    (accepted) =>
      accepted.split(';', 1)[0]?.trim().toLowerCase() === actualMediaType,
  );
};

const boundaryPhaseOrder = {
  'before-authentication': 0,
  'after-authentication': 1,
  'after-authorization': 2,
} as const;

const boundaryProfileFrom = (entry: HttpCatalogEntry): HttpBoundaryProfile => {
  const profile = entry.boundaryProfile;
  if (profile === undefined)
    throw configError({
      code: 'http_boundary_profile_missing',
      message: `Operation "${entry.operationId}" has no compiled HTTP boundary profile.`,
    });

  if (!Object.hasOwn(boundaryPhaseOrder, profile.inputValidationPhase))
    throw configError({
      code: 'http_boundary_input_validation_phase_invalid',
      message: `HTTP boundary profile "${profile.id}" has an invalid input validation phase.`,
    });

  if (
    profile.requestRateLimit !== null &&
    typeof profile.requestRateLimit !== 'string'
  )
    throw configError({
      code: 'http_boundary_request_rate_limit_invalid',
      message: `HTTP boundary profile "${profile.id}" has an invalid request rate-limit provider.`,
    });

  const authenticationRequired = profile.authentication?.required === true;
  if (authenticationRequired !== (entry.cell.authentication === 'required'))
    throw configError({
      code: 'http_boundary_authentication_incompatible',
      message: `Operation "${entry.operationId}" and HTTP boundary profile "${profile.id}" disagree about required authentication.`,
    });

  if ((entry.authorization === null) !== (profile.authorization === null))
    throw configError({
      code: 'http_boundary_authorization_incompatible',
      message: `Operation "${entry.operationId}" and HTTP boundary profile "${profile.id}" disagree about authorization.`,
    });

  if (
    profile.requestBody?.phase === 'after-authorization' &&
    entry.authorization?.timing !== 'before-input'
  )
    throw configError({
      code: 'http_boundary_parser_phase_incompatible',
      message: `Operation "${entry.operationId}" cannot parse after authorization without before-input authorization.`,
    });

  if (
    profile.requestBody !== null &&
    boundaryPhaseOrder[profile.requestBody.phase] >
      boundaryPhaseOrder[profile.inputValidationPhase]
  )
    throw configError({
      code: 'http_boundary_input_validation_phase_incompatible',
      message: `Operation "${entry.operationId}" cannot validate input before its declared request parser has run.`,
    });

  if (
    profile.inputValidationPhase === 'after-authorization' &&
    entry.authorization?.timing !== 'before-input'
  )
    throw configError({
      code: 'http_boundary_input_validation_phase_incompatible',
      message: `Operation "${entry.operationId}" cannot validate after authorization without before-input authorization.`,
    });

  if (profile.csrf !== null && profile.exactOrigin === null)
    throw configError({
      code: 'http_boundary_csrf_origin_missing',
      message: `HTTP boundary profile "${profile.id}" requires exact-origin enforcement when CSRF enforcement is declared.`,
    });

  if (
    profile.identityRateLimit !== null &&
    profile.authentication?.required !== true
  )
    throw configError({
      code: 'http_boundary_identity_missing',
      message: `HTTP boundary profile "${profile.id}" requires authenticated identity before identity rate limiting.`,
    });

  if (
    profile.requestBody !== null &&
    profile.requestBody.acceptedContentTypes.length === 0
  )
    throw configError({
      code: 'http_boundary_content_types_missing',
      message: `HTTP boundary profile "${profile.id}" requires at least one accepted content type when a parser is declared.`,
    });

  if (
    profile.requestBody !== null &&
    profile.requestBody.contentType !== 'required' &&
    profile.requestBody.contentType !== 'parse-if-matching'
  )
    throw configError({
      code: 'http_boundary_content_type_policy_invalid',
      message: `HTTP boundary profile "${profile.id}" has an invalid content-type policy.`,
    });

  if (
    profile.expectedFailureObservation !== null &&
    typeof profile.expectedFailureObservation !== 'string'
  )
    throw configError({
      code: 'http_boundary_expected_failure_observation_invalid',
      message: `HTTP boundary profile "${profile.id}" has an invalid expected-failure observation provider.`,
    });

  if (
    entry.surface.contextRequirements.length > 0 &&
    profile.contextProviders.length === 0
  )
    throw configError({
      code: 'http_boundary_context_provider_missing',
      message: `Operation "${entry.operationId}" requires a declared HTTP boundary context provider.`,
    });

  return profile;
};

const boundaryMiddleware = (
  dependencies: HttpBoundaryHostDependencies,
  operation: HttpBoundaryHostOperation,
  kind: 'csrf' | 'exact-origin' | 'identity-rate-limit' | 'request-rate-limit',
  provider: string | null,
): RequestHandler[] =>
  provider === null
    ? []
    : [dependencies.middleware({ kind, operation, provider })];

const requestBodyHandlers = (
  entry: HttpCatalogEntry,
  operation: HttpBoundaryHostOperation,
  profile: HttpBoundaryProfile,
  dependencies: HttpBoundaryHostDependencies,
): readonly RequestHandler[] => {
  const requestBody = profile.requestBody;
  if (requestBody === null) return [];

  const contentType = requestBody.contentType ?? 'required';
  const parser = dependencies.middleware({
    kind: 'request-body-parser',
    operation,
    provider: requestBody.parser,
    acceptedContentTypes: requestBody.acceptedContentTypes,
    contentType,
    limit: entry.surface.bodyLimit,
  });

  if (contentType === 'parse-if-matching')
    return Object.freeze([
      (request, response, next): void => {
        if (
          !requestContentTypeMatches(request, requestBody.acceptedContentTypes)
        ) {
          next();
          return;
        }
        parser(request, response, next);
      },
    ]);

  return Object.freeze([
    contentTypeHandler(
      entry,
      requestBody.acceptedContentTypes,
      requestBody.unsupportedContentType,
    ),
    parser,
  ]);
};

const register = (
  router: HttpCatalogRouter,
  method: HttpMethod,
  path: string,
  handlers: readonly RequestHandler[],
): void => {
  if (method === 'DELETE') {
    router.delete(path, ...handlers);
    return;
  }
  if (method === 'GET') {
    router.get(path, ...handlers);
    return;
  }
  if (method === 'PATCH') {
    router.patch(path, ...handlers);
    return;
  }
  if (method === 'POST') {
    router.post(path, ...handlers);
    return;
  }
  if (method === 'PUT') {
    router.put(path, ...handlers);
    return;
  }

  throw configError({
    code: 'http_catalog_method_unsupported',
    message: `The HTTP catalog declared unsupported method "${String(method)}".`,
  });
};

export const mountHttpCatalog = (
  input: Readonly<{
    router: HttpCatalogRouter;
    catalog: ExecutableHttpCatalog;
    dependencies: HttpHostDependencies;
  }>,
): Readonly<{ routeCount: number }> => {
  const profiledEntry = input.catalog.entries.find(
    (entry) => entry.boundaryProfile !== undefined,
  );
  if (profiledEntry !== undefined)
    throw configError({
      code: 'http_boundary_profile_host_required',
      message: `Operation "${profiledEntry.operationId}" declares an HTTP boundary profile and must use the profiled catalog host.`,
    });

  for (const entry of input.catalog.entries) {
    const operation = operationFrom(entry);
    const scopes = new WeakMap<Request, string>();
    const validatedRequests = new WeakSet<Request>();
    const handlers: RequestHandler[] = [
      input.dependencies.requestContext(operation),
    ];

    handlers.push(
      input.dependencies.authentication({
        operation,
        required: operation.authentication === 'required',
      }),
    );

    if (entry.authorization?.timing === 'before-input')
      handlers.push(authorizationScopeHandler(entry, scopes));

    if (entry.authorization?.timing === 'before-input')
      handlers.push(
        authorizationHandler(entry, operation, input.dependencies, scopes),
      );

    handlers.push(
      input.dependencies.body({
        operation,
        limit: entry.surface.bodyLimit,
      }),
    );

    if (
      entry.authorization?.timing === 'after-input' &&
      entry.authorization.decodeScope !== null
    )
      handlers.push(
        afterInputAuthorizationHandler(
          entry,
          operation,
          input.dependencies,
          validatedRequests,
        ),
      );

    handlers.push(
      executionHandler(entry, operation, input.dependencies, validatedRequests),
    );

    register(input.router, entry.surface.method, entry.surface.path, handlers);
  }

  return Object.freeze({ routeCount: input.catalog.entries.length });
};

/**
 * Opt-in mount for topology-compiled boundary profiles.
 *
 * Provider names remain opaque: the process edge resolves every declared
 * mechanism while this host owns the deterministic middleware order.
 */
export const mountHttpBoundaryCatalog = (
  input: Readonly<{
    router: HttpCatalogRouter;
    catalog: ExecutableHttpCatalog;
    dependencies: HttpBoundaryHostDependencies;
  }>,
): Readonly<{ routeCount: number }> => {
  const entries = input.catalog.entries.map((entry) =>
    Object.freeze({ entry, profile: boundaryProfileFrom(entry) }),
  );

  for (const { profile } of entries)
    if (
      (profile.expectedFailureObservation ?? null) !== null &&
      input.dependencies.observeExpectedFailure === undefined
    )
      throw configError({
        code: 'http_boundary_expected_failure_observer_missing',
        message: `HTTP boundary profile "${profile.id}" declares expected-failure observation without a host observer.`,
      });

  for (const { entry, profile } of entries) {
    const expectedFailureObservation =
      profile.expectedFailureObservation ?? null;
    const observeExpectedFailure = input.dependencies.observeExpectedFailure;
    const operation = boundaryOperationFrom(entry, profile);
    const scopes = new WeakMap<Request, string>();
    const validatedRequests = new WeakSet<Request>();
    const handlers: RequestHandler[] = [
      input.dependencies.requestContext(operation),
    ];

    if (input.dependencies.observeResponse !== undefined)
      handlers.push((_request, response, next) => {
        response.once('finish', () => {
          try {
            void input.dependencies.observeResponse?.({
              operation,
              status: response.statusCode,
            });
          } catch {
            // Observation is secondary and cannot change the response.
          }
        });
        next();
      });

    if (profile.noStore) handlers.push(noStoreHandler);

    handlers.push(
      ...boundaryMiddleware(
        input.dependencies,
        operation,
        'request-rate-limit',
        profile.requestRateLimit,
      ),
    );

    const bodyHandlers = requestBodyHandlers(
      entry,
      operation,
      profile,
      input.dependencies,
    );
    if (profile.requestBody?.phase === 'before-authentication')
      handlers.push(...bodyHandlers);
    if (profile.inputValidationPhase === 'before-authentication')
      handlers.push(inputValidationHandler(entry, validatedRequests));

    handlers.push(
      ...boundaryMiddleware(
        input.dependencies,
        operation,
        'exact-origin',
        profile.exactOrigin,
      ),
      ...boundaryMiddleware(
        input.dependencies,
        operation,
        'csrf',
        profile.csrf,
      ),
    );

    if (profile.authentication !== null)
      handlers.push(
        input.dependencies.middleware({
          kind: 'authentication',
          operation,
          provider: profile.authentication.provider,
          required: profile.authentication.required,
        }),
      );

    handlers.push(
      ...boundaryMiddleware(
        input.dependencies,
        operation,
        'identity-rate-limit',
        profile.identityRateLimit,
      ),
    );

    if (profile.requestBody?.phase === 'after-authentication')
      handlers.push(...bodyHandlers);
    if (profile.inputValidationPhase === 'after-authentication')
      handlers.push(inputValidationHandler(entry, validatedRequests));

    const authorizationProvider = profile.authorization;
    const authorizationDependencies: Pick<HttpHostDependencies, 'authorize'> = {
      authorize: async (authorization): Promise<void> => {
        if (authorizationProvider === null)
          throw configError({
            code: 'http_boundary_authorization_provider_missing',
            message: `Operation "${entry.operationId}" reached authorization without a boundary provider.`,
          });
        await input.dependencies.authorize({
          ...authorization,
          operation,
          provider: authorizationProvider,
        });
      },
    };

    if (entry.authorization?.timing === 'before-input') {
      handlers.push(authorizationScopeHandler(entry, scopes));
      handlers.push(
        authorizationHandler(
          entry,
          operation,
          authorizationDependencies,
          scopes,
        ),
      );
    }

    if (profile.requestBody?.phase === 'after-authorization')
      handlers.push(...bodyHandlers);
    if (profile.inputValidationPhase === 'after-authorization')
      handlers.push(inputValidationHandler(entry, validatedRequests));

    if (
      entry.authorization?.timing === 'after-input' &&
      entry.authorization.decodeScope !== null
    )
      handlers.push(
        afterInputAuthorizationHandler(
          entry,
          operation,
          authorizationDependencies,
          validatedRequests,
        ),
      );

    handlers.push(
      executionHandler(
        entry,
        operation,
        {
          ...authorizationDependencies,
          readCellContext: (_baseOperation, request, response) =>
            input.dependencies.readCellContext({
              operation,
              providers: profile.contextProviders,
              request,
              response,
            }),
        },
        validatedRequests,
        profile.noStore
          ? Object.freeze({ 'Cache-Control': 'no-store' })
          : Object.freeze({}),
        expectedFailureObservation === null ||
          observeExpectedFailure === undefined
          ? null
          : {
              operation,
              provider: expectedFailureObservation,
              observe: observeExpectedFailure,
            },
      ),
    );

    register(input.router, entry.surface.method, entry.surface.path, handlers);
  }

  return Object.freeze({ routeCount: input.catalog.entries.length });
};
