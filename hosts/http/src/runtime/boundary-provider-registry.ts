import type { ExecutableHttpCatalog } from '@pressly/cells';
import { configError } from '@pressly/errors/factories';
import type {
  HttpBoundaryHostDependencies,
  HttpBoundaryHostOperation,
  HttpBoundaryMiddlewareInput,
  HttpExpectedFailureObservationInput,
} from '../public.ts';
import express, {
  type Request,
  type RequestHandler,
  type Response,
} from 'express';

export type ApiHttpBoundaryMiddlewareProvider = (
  input: HttpBoundaryMiddlewareInput,
) => RequestHandler;

export type ApiHttpBoundaryContextProvider = (input: {
  operation: HttpBoundaryHostOperation;
  request: Request;
  response: Response;
}) =>
  | Promise<Readonly<Record<string, unknown>>>
  | Readonly<Record<string, unknown>>;

export type ApiHttpBoundaryAuthorizationProvider = (
  input: Readonly<{
    operation: HttpBoundaryHostOperation;
    request: Request;
    response: Response;
    capability: string;
    scope: string;
  }>,
) => Promise<void> | void;

export type ApiHttpBoundaryExpectedFailureProvider = (
  input: Omit<HttpExpectedFailureObservationInput, 'provider'>,
) => Promise<void> | void;

export type ApiHttpBoundaryProviderRegistryDependencies = Readonly<{
  requestContext: (operation: HttpBoundaryHostOperation) => RequestHandler;
  middleware: Readonly<Record<string, ApiHttpBoundaryMiddlewareProvider>>;
  context: Readonly<Record<string, ApiHttpBoundaryContextProvider>>;
  authorization: Readonly<Record<string, ApiHttpBoundaryAuthorizationProvider>>;
  expectedFailure: Readonly<
    Record<string, ApiHttpBoundaryExpectedFailureProvider>
  >;
}>;

export type ApiHttpBoundaryProviderRegistry = Readonly<{
  requestContext: ApiHttpBoundaryProviderRegistryDependencies['requestContext'];
  middleware: Readonly<Record<string, ApiHttpBoundaryMiddlewareProvider>>;
  context: Readonly<Record<string, ApiHttpBoundaryContextProvider>>;
  authorization: Readonly<Record<string, ApiHttpBoundaryAuthorizationProvider>>;
  expectedFailure: Readonly<
    Record<string, ApiHttpBoundaryExpectedFailureProvider>
  >;
}>;

export const makeApiHttpBoundaryProviderRegistry = (
  dependencies: ApiHttpBoundaryProviderRegistryDependencies,
): ApiHttpBoundaryProviderRegistry =>
  Object.freeze({
    requestContext: dependencies.requestContext,
    middleware: Object.freeze({ ...dependencies.middleware }),
    context: Object.freeze({ ...dependencies.context }),
    authorization: Object.freeze({ ...dependencies.authorization }),
    expectedFailure: Object.freeze({ ...dependencies.expectedFailure }),
  });

const providerMissing = (
  kind: 'authorization' | 'context' | 'expected-failure' | 'middleware',
  token: string,
): never => {
  throw configError({
    code: 'api_http_boundary_provider_missing',
    message: `HTTP boundary ${kind} provider "${token}" is not registered.`,
    details: { kind, token },
  });
};

const registered = <Provider>(
  providers: Readonly<Record<string, Provider>>,
  token: string,
  kind: 'authorization' | 'context' | 'expected-failure' | 'middleware',
): Provider => providers[token] ?? providerMissing(kind, token);

const contextFrom = async (
  registry: ApiHttpBoundaryProviderRegistry,
  input: Parameters<HttpBoundaryHostDependencies['readCellContext']>[0],
): Promise<Readonly<Record<string, unknown>>> => {
  const context: Record<string, unknown> = {};
  for (const token of input.providers) {
    const fragment = await registered(
      registry.context,
      token,
      'context',
    )({
      operation: input.operation,
      request: input.request,
      response: input.response,
    });
    Object.assign(context, fragment);
  }
  return Object.freeze(context);
};

export const makeApiHttpBoundaryHostDependencies = (
  registry: ApiHttpBoundaryProviderRegistry,
): HttpBoundaryHostDependencies => ({
  requestContext: registry.requestContext,
  middleware: (input) =>
    registered(registry.middleware, input.provider, 'middleware')(input),
  readCellContext: (input) => contextFrom(registry, input),
  authorize: ({ provider, ...input }) =>
    registered(registry.authorization, provider, 'authorization')(input),
  observeExpectedFailure: ({ provider, ...input }) =>
    registered(registry.expectedFailure, provider, 'expected-failure')(input),
});

const parserProvider =
  (fallbackLimit?: string): ApiHttpBoundaryMiddlewareProvider =>
  (input) => {
    if (input.kind !== 'request-body-parser')
      return providerMissing('middleware', input.provider);
    return express.json({ limit: input.limit ?? fallbackLimit });
  };

export const apiJsonDocumentProvider = parserProvider();
export const apiJsonDocument64kbProvider = parserProvider('64kb');

export const apiRawDocument256kbProvider: ApiHttpBoundaryMiddlewareProvider = (
  input,
) => {
  if (input.kind !== 'request-body-parser')
    return providerMissing('middleware', input.provider);
  return express.raw({
    type: [...input.acceptedContentTypes],
    limit: input.limit ?? '256kb',
  });
};

const declaredTokens = (catalog: ExecutableHttpCatalog) => {
  const middleware = new Set<string>();
  const context = new Set<string>();
  const authorization = new Set<string>();
  const expectedFailure = new Set<string>();
  for (const entry of catalog.entries) {
    const profile =
      entry.boundaryProfile ??
      providerMissing('middleware', `<unprofiled:${entry.operationId}>`);
    if (profile.authentication !== null)
      middleware.add(profile.authentication.provider);
    if (profile.requestBody !== null)
      middleware.add(profile.requestBody.parser);
    if (profile.exactOrigin !== null) middleware.add(profile.exactOrigin);
    if (profile.csrf !== null) middleware.add(profile.csrf);
    if (profile.requestRateLimit !== null)
      middleware.add(profile.requestRateLimit);
    if (profile.identityRateLimit !== null)
      middleware.add(profile.identityRateLimit);
    for (const token of profile.contextProviders) context.add(token);
    if (profile.authorization !== null)
      authorization.add(profile.authorization);
    const observation = profile.expectedFailureObservation ?? null;
    if (observation !== null) expectedFailure.add(observation);
  }
  return { middleware, context, authorization, expectedFailure };
};

const assertTokensRegistered = (
  tokens: ReadonlySet<string>,
  providers: Readonly<Record<string, unknown>>,
  kind: 'authorization' | 'context' | 'expected-failure' | 'middleware',
): void => {
  for (const token of tokens)
    if (!Object.hasOwn(providers, token)) providerMissing(kind, token);
};

export const assertApiHttpBoundaryProviderCoverage = (
  catalog: ExecutableHttpCatalog,
  registry: ApiHttpBoundaryProviderRegistry,
): void => {
  const tokens = declaredTokens(catalog);
  assertTokensRegistered(tokens.middleware, registry.middleware, 'middleware');
  assertTokensRegistered(tokens.context, registry.context, 'context');
  assertTokensRegistered(
    tokens.authorization,
    registry.authorization,
    'authorization',
  );
  assertTokensRegistered(
    tokens.expectedFailure,
    registry.expectedFailure,
    'expected-failure',
  );
};
