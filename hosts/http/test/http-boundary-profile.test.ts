import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  defineOperation,
  defineHttpBoundaryProfile,
  defineHttpCatalog,
  http,
  type HttpBoundaryProfile,
  type HttpRequest,
} from '@pressly/cells';
import { isAppError } from '@pressly/errors/app-error';
import {
  authError,
  unexpectedError,
  validationError,
} from '@pressly/errors/factories';
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import {
  mountHttpBoundaryCatalog,
  mountHttpCatalog,
  type HttpBoundaryHostDependencies,
} from '../src/http-host.ts';

type TestInput = Readonly<{ value: string }>;
type TestOutput = Readonly<{ value: string }>;
type TestFailure = Readonly<{ code: 'test-failure' }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const outputContract = defineBoundaryContract<TestOutput>({
  version: 1,
  decode: (value) =>
    isRecord(value) && typeof value['value'] === 'string'
      ? decode.valid({ value: value['value'] })
      : decode.invalid([{ path: [], message: 'Expected value.' }]),
  encode: (value) => value,
});

const failureContract = defineBoundaryContract<TestFailure>({
  version: 1,
  decode: (value) =>
    isRecord(value) && value['code'] === 'test-failure'
      ? decode.valid({ code: value['code'] })
      : decode.invalid([{ path: [], message: 'Expected failure.' }]),
  encode: (value) => value,
});

const makeCell = (
  input: Readonly<{
    id: string;
    path: string;
    events: string[];
    authentication: 'none' | 'required';
    authorization: 'after-input' | 'before-input' | null;
    body: boolean;
    ignoreBody?: boolean;
    contextRequirements?: readonly string[];
    presentedHeaders?: Readonly<Record<string, string | readonly string[]>>;
    rejectValidation?: boolean;
    stagedAfterInput?: boolean;
  }>,
) => {
  const inputContract = defineBoundaryContract<TestInput>({
    version: 1,
    decode: (value) => {
      input.events.push(`decode:${input.id}`);
      return isRecord(value) && typeof value['value'] === 'string'
        ? decode.valid({ value: value['value'] })
        : decode.invalid([{ path: [], message: 'Expected value.' }]);
    },
    encode: (value) => value,
  });
  const surface = (input.body ? http.post : http.get)<TestOutput, TestFailure>({
    path: input.path,
    ...(input.body ? { bodyLimit: 'candidate-command' } : {}),
    contextRequirements: input.contextRequirements ?? [],
    ...(input.authorization === 'before-input' || input.stagedAfterInput
      ? {
          decodeAuthorizationScope: () => {
            input.events.push(`decode-scope:${input.id}`);
            return decode.valid(`${input.id}-scope`);
          },
        }
      : {}),
    validateRequest: () => {
      input.events.push(`validate:${input.id}`);
      if (input.rejectValidation)
        throw validationError({
          code: 'candidate_input_invalid',
          message: 'Candidate input validation failed.',
          safeMessage: 'Invalid request input.',
        });
      return undefined;
    },
    toSerializedInput: (request: HttpRequest) => ({
      value:
        input.body && !input.ignoreBody && isRecord(request.body)
          ? request.body['value']
          : `${input.id}-value`,
    }),
    present: (outcome) => ({
      status: outcome.kind === 'success' ? 200 : 409,
      ...(input.presentedHeaders === undefined
        ? {}
        : { headers: input.presentedHeaders }),
      body: outcome.kind === 'success' ? outcome.value : outcome.failure,
    }),
  });
  const authorization =
    input.authorization === null
      ? {}
      : input.authorization === 'after-input'
        ? {
            authorization: {
              capability: `${input.id}.execute`,
              timing: 'after-input' as const,
              scope: (value: TestInput) => value.value,
            },
          }
        : {
            authorization: {
              capability: `${input.id}.execute`,
              timing: 'before-input' as const,
            },
          };

  return defineOperation<TestInput, TestOutput, TestFailure>({
    kind: 'command',
    id: input.id,
    authentication: input.authentication,
    contract: defineCellContract({
      input: inputContract,
      output: outputContract,
      failure: failureContract,
    }),
    ...authorization,
    surfaces: [surface],
    observability: { operation: input.id },
    execute: async (value) => {
      input.events.push(`execute:${input.id}`);
      return Object.freeze({ kind: 'success', value });
    },
  });
};

const makeObservedCell = (
  input: Readonly<{
    id: string;
    path: string;
    events: string[];
    outcome: 'failure' | 'success';
    presenterThrows?: boolean;
  }>,
) =>
  defineOperation<TestInput, TestOutput, TestFailure>({
    kind: 'command',
    id: input.id,
    contract: defineCellContract({
      input: defineBoundaryContract({
        version: 1,
        decode: () => decode.valid({ value: 'observed' }),
        encode: (value: TestInput) => value,
      }),
      output: outputContract,
      failure: failureContract,
    }),
    surfaces: [
      http.get({
        path: input.path,
        toSerializedInput: () => ({}),
        present: (outcome) => {
          input.events.push('present');
          if (input.presenterThrows)
            throw authError({
              code: 'presented_auth_failure',
              message: 'Presented authentication failure.',
              safeMessage: 'Authentication is required.',
            });
          return outcome.kind === 'success'
            ? { status: 200, body: { ok: true, data: outcome.value } }
            : {
                status: 401,
                headers: {
                  'Set-Cookie': [
                    'first=; Path=/; HttpOnly',
                    'second=; Path=/; SameSite=Strict',
                  ],
                },
                body: {
                  ok: false,
                  error: {
                    code: outcome.failure.code,
                    message: 'Authentication is required.',
                  },
                },
              };
        },
      }),
    ],
    observability: { operation: input.id },
    execute: async () => {
      input.events.push('execute');
      return input.outcome === 'success'
        ? ({ kind: 'success', value: { value: 'observed' } } as const)
        : ({ kind: 'failure', failure: { code: 'test-failure' } } as const);
    },
  });

const profile = (definition: HttpBoundaryProfile): HttpBoundaryProfile =>
  defineHttpBoundaryProfile(definition);

const publicNoAuth = profile({
  id: 'public-no-auth',
  authentication: null,
  requestBody: null,
  exactOrigin: null,
  csrf: null,
  requestRateLimit: 'ip-bucket-public',
  identityRateLimit: null,
  inputValidationPhase: 'before-authentication',
  noStore: false,
  contextProviders: [],
  authorization: null,
});

const bearerSession = profile({
  id: 'bearer-session',
  authentication: { provider: 'bearer-session', required: true },
  requestBody: {
    acceptedContentTypes: ['application/json'],
    parser: 'json-document',
    phase: 'before-authentication',
  },
  exactOrigin: null,
  csrf: null,
  requestRateLimit: 'ip-bucket-bearer',
  identityRateLimit: null,
  inputValidationPhase: 'before-authentication',
  noStore: false,
  contextProviders: [],
  authorization: null,
});

const processorCookie = profile({
  id: 'processor-cookie',
  authentication: { provider: 'session-cookie-a', required: true },
  requestBody: {
    acceptedContentTypes: ['application/json'],
    contentType: 'parse-if-matching',
    parser: 'json-document',
    phase: 'before-authentication',
  },
  exactOrigin: 'exact-origin-a',
  csrf: null,
  requestRateLimit: 'ip-bucket-a',
  identityRateLimit: 'identity-bucket-a',
  inputValidationPhase: 'after-authentication',
  noStore: true,
  contextProviders: ['request-actor-a'],
  authorization: 'capability-a',
});

const controlCookieCsrf = profile({
  id: 'control-cookie-csrf',
  authentication: { provider: 'session-cookie-b', required: true },
  requestBody: {
    acceptedContentTypes: ['application/json'],
    parser: 'json-document',
    phase: 'after-authorization',
  },
  exactOrigin: 'exact-origin-b',
  csrf: 'csrf-token-b',
  requestRateLimit: 'ip-bucket-b',
  identityRateLimit: 'identity-bucket-b',
  inputValidationPhase: 'after-authorization',
  noStore: true,
  contextProviders: ['request-actor-b', 'request-location-b'],
  authorization: 'capability-b',
});

const makeDependencies = (events: string[]): HttpBoundaryHostDependencies => ({
  requestContext:
    (operation): RequestHandler =>
    (_request, _response, next): void => {
      events.push(
        `request-context:${operation.operationId}:${operation.boundaryProfileId}`,
      );
      next();
    },
  middleware:
    (input): RequestHandler =>
    (request, response, next): void => {
      events.push(`${input.kind}:${input.provider}`);
      if (input.kind === 'request-body-parser') {
        express.json({ limit: '16kb' })(request, response, next);
        return;
      }
      next();
    },
  readCellContext: ({ providers }) => {
    events.push(`cell-context:${providers.join(',') || 'none'}`);
    return Object.freeze({});
  },
  authorize: ({ provider, capability, scope }): void => {
    events.push(`authorize:${provider}:${capability}:${scope}`);
  },
});

const errorBoundary: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
): void => {
  if (isAppError(error)) {
    response.status(error.status).send({ code: error.code });
    return;
  }
  const parserError = error as Readonly<{ status?: unknown; type?: unknown }>;
  if (typeof parserError.status === 'number') {
    response.status(parserError.status).send({
      code:
        typeof parserError.type === 'string'
          ? parserError.type
          : 'parser_failure',
    });
    return;
  }
  response.status(500).send({ code: 'unexpected_test_failure' });
};

const servers: Server[] = [];

const listen = async (application: Express): Promise<string> => {
  const server = createServer(application);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw unexpectedError({
      code: 'http_boundary_test_address_missing',
      message: 'The test server has no TCP address.',
    });
  return `http://127.0.0.1:${(address as AddressInfo).port}`;
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error === undefined) resolve();
            else reject(error);
          });
        }),
    ),
  );
});

const postJson = (baseUrl: string, path: string, value: string) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ value }),
  });

describe('topology-profiled HTTP catalog host', () => {
  it('executes all four candidate profiles in one deterministic total order', async () => {
    const events: string[] = [];
    const publicCell = makeCell({
      id: 'candidate.public.v1',
      path: '/candidate/public',
      events,
      authentication: 'none',
      authorization: null,
      body: false,
    });
    const bearerCell = makeCell({
      id: 'candidate.bearer.v1',
      path: '/candidate/bearer',
      events,
      authentication: 'required',
      authorization: null,
      body: true,
    });
    const processorCell = makeCell({
      id: 'candidate.processor.v1',
      path: '/candidate/processor',
      events,
      authentication: 'required',
      authorization: 'after-input',
      body: true,
      contextRequirements: ['request-actor'],
    });
    const controlCell = makeCell({
      id: 'candidate.control.v1',
      path: '/candidate/control',
      events,
      authentication: 'required',
      authorization: 'before-input',
      body: true,
      contextRequirements: ['request-actor', 'request-location'],
      presentedHeaders: { 'Cache-Control': 'public, max-age=600' },
    });
    const catalog = defineHttpCatalog(
      [publicCell, bearerCell, processorCell, controlCell],
      {
        [publicCell.id]: publicNoAuth,
        [bearerCell.id]: bearerSession,
        [processorCell.id]: processorCookie,
        [controlCell.id]: controlCookieCsrf,
      },
    );
    const application = express();
    const mounted = mountHttpBoundaryCatalog({
      router: application,
      catalog,
      dependencies: makeDependencies(events),
    });
    application.use(errorBoundary);
    const baseUrl = await listen(application);

    expect(mounted).toEqual({ routeCount: 4 });

    const publicResponse = await fetch(`${baseUrl}/candidate/public`);
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get('cache-control')).toBeNull();
    expect(events.splice(0)).toEqual([
      'request-context:candidate.public.v1:public-no-auth',
      'request-rate-limit:ip-bucket-public',
      'validate:candidate.public.v1',
      'cell-context:none',
      'decode:candidate.public.v1',
      'execute:candidate.public.v1',
    ]);

    const bearerResponse = await postJson(
      baseUrl,
      '/candidate/bearer',
      'bearer-value',
    );
    expect(bearerResponse.status).toBe(200);
    expect(events.splice(0)).toEqual([
      'request-context:candidate.bearer.v1:bearer-session',
      'request-rate-limit:ip-bucket-bearer',
      'request-body-parser:json-document',
      'validate:candidate.bearer.v1',
      'authentication:bearer-session',
      'cell-context:none',
      'decode:candidate.bearer.v1',
      'execute:candidate.bearer.v1',
    ]);

    const processorResponse = await postJson(
      baseUrl,
      '/candidate/processor',
      'processor-value',
    );
    expect(processorResponse.status).toBe(200);
    expect(processorResponse.headers.get('cache-control')).toBe('no-store');
    expect(events.splice(0)).toEqual([
      'request-context:candidate.processor.v1:processor-cookie',
      'request-rate-limit:ip-bucket-a',
      'request-body-parser:json-document',
      'exact-origin:exact-origin-a',
      'authentication:session-cookie-a',
      'identity-rate-limit:identity-bucket-a',
      'validate:candidate.processor.v1',
      'cell-context:request-actor-a',
      'decode:candidate.processor.v1',
      'authorize:capability-a:candidate.processor.v1.execute:processor-value',
      'execute:candidate.processor.v1',
    ]);

    const controlResponse = await postJson(
      baseUrl,
      '/candidate/control',
      'control-value',
    );
    expect(controlResponse.status).toBe(200);
    expect(controlResponse.headers.get('cache-control')).toBe('no-store');
    expect(events.splice(0)).toEqual([
      'request-context:candidate.control.v1:control-cookie-csrf',
      'request-rate-limit:ip-bucket-b',
      'exact-origin:exact-origin-b',
      'csrf:csrf-token-b',
      'authentication:session-cookie-b',
      'identity-rate-limit:identity-bucket-b',
      'decode-scope:candidate.control.v1',
      'authorize:capability-b:candidate.control.v1.execute:candidate.control.v1-scope',
      'request-body-parser:json-document',
      'validate:candidate.control.v1',
      'cell-context:request-actor-b,request-location-b',
      'decode:candidate.control.v1',
      'execute:candidate.control.v1',
    ]);
  });

  it('enforces declared content type at the declared phase and preserves no-store on rejection', async () => {
    const events: string[] = [];
    const cell = makeCell({
      id: 'candidate.content-type.v1',
      path: '/candidate/content-type',
      events,
      authentication: 'required',
      authorization: 'before-input',
      body: true,
    });
    const application = express();
    mountHttpBoundaryCatalog({
      router: application,
      catalog: defineHttpCatalog([cell], {
        [cell.id]: controlCookieCsrf,
      }),
      dependencies: makeDependencies(events),
    });
    application.use(errorBoundary);
    const baseUrl = await listen(application);

    const response = await fetch(`${baseUrl}/candidate/content-type`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'not-json',
    });

    expect(response.status).toBe(415);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      code: 'http_boundary_content_type_unsupported',
    });
    expect(events).toEqual([
      'request-context:candidate.content-type.v1:control-cookie-csrf',
      'request-rate-limit:ip-bucket-b',
      'exact-origin:exact-origin-b',
      'csrf:csrf-token-b',
      'authentication:session-cookie-b',
      'identity-rate-limit:identity-bucket-b',
      'decode-scope:candidate.content-type.v1',
      'authorize:capability-b:candidate.content-type.v1.execute:candidate.content-type.v1-scope',
    ]);
  });

  it('uses immutable profile-owned unsupported-content-type presentation', async () => {
    const events: string[] = [];
    const cell = makeCell({
      id: 'candidate.content-type-presentation.v1',
      path: '/candidate/content-type-presentation',
      events,
      authentication: 'required',
      authorization: 'before-input',
      body: true,
    });
    const boundaryProfile = profile({
      ...controlCookieCsrf,
      id: 'control-cookie-csrf-presented',
      requestBody: {
        ...controlCookieCsrf.requestBody!,
        unsupportedContentType: {
          code: 'unsupported_media_type',
          safeMessage: 'This endpoint requires a JSON request body.',
        },
      },
    });
    expect(
      Object.isFrozen(boundaryProfile.requestBody?.unsupportedContentType),
    ).toBe(true);
    const application = express();
    mountHttpBoundaryCatalog({
      router: application,
      catalog: defineHttpCatalog([cell], { [cell.id]: boundaryProfile }),
      dependencies: makeDependencies(events),
    });
    application.use(errorBoundary);

    const response = await fetch(
      `${await listen(application)}/candidate/content-type-presentation`,
      {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'not-json',
      },
    );
    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      code: 'unsupported_media_type',
    });
  });

  it('conditionally parses only matching content types while retaining malformed and bounded JSON failures', async () => {
    const events: string[] = [];
    const cell = makeCell({
      id: 'candidate.conditional-body.v1',
      path: '/candidate/conditional-body',
      events,
      authentication: 'none',
      authorization: null,
      body: true,
      ignoreBody: true,
    });
    const conditional = profile({
      ...publicNoAuth,
      id: 'conditional-body',
      requestRateLimit: null,
      requestBody: {
        acceptedContentTypes: ['application/json'],
        contentType: 'parse-if-matching',
        parser: 'json-document',
        phase: 'before-authentication',
      },
    });
    const application = express();
    mountHttpBoundaryCatalog({
      router: application,
      catalog: defineHttpCatalog([cell], { [cell.id]: conditional }),
      dependencies: makeDependencies(events),
    });
    application.use(errorBoundary);
    const url = `${await listen(application)}/candidate/conditional-body`;

    for (const request of [
      { headers: {}, body: undefined },
      { headers: { 'content-type': 'text/plain' }, body: 'not-json' },
    ]) {
      const response = await fetch(url, {
        method: 'POST',
        headers: request.headers,
        ...(request.body === undefined ? {} : { body: request.body }),
      });
      expect(response.status).toBe(200);
      expect(events.splice(0)).toEqual([
        'request-context:candidate.conditional-body.v1:conditional-body',
        'validate:candidate.conditional-body.v1',
        'cell-context:none',
        'decode:candidate.conditional-body.v1',
        'execute:candidate.conditional-body.v1',
      ]);
    }

    const parsed = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ignored: true }),
    });
    expect(parsed.status).toBe(200);
    expect(events.splice(0)).toEqual([
      'request-context:candidate.conditional-body.v1:conditional-body',
      'request-body-parser:json-document',
      'validate:candidate.conditional-body.v1',
      'cell-context:none',
      'decode:candidate.conditional-body.v1',
      'execute:candidate.conditional-body.v1',
    ]);

    const malformed = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      code: 'entity.parse.failed',
    });
    expect(events.splice(0)).toEqual([
      'request-context:candidate.conditional-body.v1:conditional-body',
      'request-body-parser:json-document',
    ]);

    const oversized = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(20_000) }),
    });
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toEqual({
      code: 'entity.too.large',
    });
    expect(events.splice(0)).toEqual([
      'request-context:candidate.conditional-body.v1:conditional-body',
      'request-body-parser:json-document',
    ]);
  });

  it('preserves every Set-Cookie value instead of collapsing response headers', async () => {
    const events: string[] = [];
    const cell = makeCell({
      id: 'candidate.multi-header.v1',
      path: '/candidate/multi-header',
      events,
      authentication: 'none',
      authorization: null,
      body: false,
      presentedHeaders: {
        'Set-Cookie': [
          'first=one; Path=/; HttpOnly',
          'second=two; Path=/; SameSite=Lax',
        ],
        'X-Candidate': 'preserved',
      },
    });
    const application = express();
    mountHttpBoundaryCatalog({
      router: application,
      catalog: defineHttpCatalog([cell], { [cell.id]: publicNoAuth }),
      dependencies: makeDependencies(events),
    });
    application.use(errorBoundary);
    const response = await fetch(
      `${await listen(application)}/candidate/multi-header`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([
      'first=one; Path=/; HttpOnly',
      'second=two; Path=/; SameSite=Lax',
    ]);
    expect(response.headers.get('x-candidate')).toBe('preserved');
  });

  it('observes presented expected failures once before sending their exact response', async () => {
    const events: string[] = [];
    const failureCell = makeObservedCell({
      id: 'candidate.observed-failure.v1',
      path: '/candidate/observed-failure',
      events,
      outcome: 'failure',
    });
    const successCell = makeObservedCell({
      id: 'candidate.observed-success.v1',
      path: '/candidate/observed-success',
      events,
      outcome: 'success',
    });
    const observedProfile = profile({
      ...publicNoAuth,
      id: 'observed-failure',
      requestRateLimit: null,
      expectedFailureObservation: 'cookie-auth-failure',
    });
    const observations: unknown[] = [];
    const application = express();
    mountHttpBoundaryCatalog({
      router: application,
      catalog: defineHttpCatalog([failureCell, successCell], {
        [failureCell.id]: observedProfile,
        [successCell.id]: observedProfile,
      }),
      dependencies: {
        ...makeDependencies(events),
        requestContext: (operation) => (_request, response, next) => {
          events.push(
            `request-context:${operation.operationId}:${operation.boundaryProfileId}`,
          );
          response.locals['requestId'] = 'request-1';
          next();
        },
        observeExpectedFailure: (observation) => {
          events.push(`observe:${observation.provider}`);
          observations.push(observation);
        },
      },
    });
    application.use(errorBoundary);
    const baseUrl = await listen(application);

    const failureResponse = await fetch(
      `${baseUrl}/candidate/observed-failure`,
    );
    expect(failureResponse.status).toBe(401);
    expect(failureResponse.headers.getSetCookie()).toEqual([
      'first=; Path=/; HttpOnly',
      'second=; Path=/; SameSite=Strict',
    ]);
    await expect(failureResponse.json()).resolves.toEqual({
      ok: false,
      error: {
        code: 'test-failure',
        message: 'Authentication is required.',
      },
    });
    expect(events.splice(0)).toEqual([
      'request-context:candidate.observed-failure.v1:observed-failure',
      'cell-context:none',
      'execute',
      'present',
      'observe:cookie-auth-failure',
    ]);
    expect(observations).toEqual([
      expect.objectContaining({
        operation: expect.objectContaining({
          operationId: 'candidate.observed-failure.v1',
        }),
        provider: 'cookie-auth-failure',
        response: {
          headersSent: false,
          locals: { requestId: 'request-1' },
        },
        failure: { code: 'test-failure' },
        status: 401,
      }),
    ]);

    const successResponse = await fetch(
      `${baseUrl}/candidate/observed-success`,
    );
    expect(successResponse.status).toBe(200);
    expect(observations).toHaveLength(1);
    expect(events.splice(0)).toEqual([
      'request-context:candidate.observed-success.v1:observed-failure',
      'cell-context:none',
      'execute',
      'present',
    ]);
  });

  it('isolates observation faults and never double-observes thrown presentations', async () => {
    const observedEvents: string[] = [];
    const observedCell = makeObservedCell({
      id: 'candidate.observer-fault.v1',
      path: '/candidate/observer-fault',
      events: observedEvents,
      outcome: 'failure',
    });
    const observedProfile = profile({
      ...publicNoAuth,
      id: 'observer-fault',
      requestRateLimit: null,
      expectedFailureObservation: 'cookie-auth-failure',
    });
    const observedApplication = express();
    mountHttpBoundaryCatalog({
      router: observedApplication,
      catalog: defineHttpCatalog([observedCell], {
        [observedCell.id]: observedProfile,
      }),
      dependencies: {
        ...makeDependencies(observedEvents),
        observeExpectedFailure: () => {
          observedEvents.push('observe');
          throw unexpectedError({
            code: 'secondary_observation_failed',
            message: 'Secondary observation failed.',
          });
        },
      },
    });
    observedApplication.use(errorBoundary);
    const observedResponse = await fetch(
      `${await listen(observedApplication)}/candidate/observer-fault`,
    );
    expect(observedResponse.status).toBe(401);
    expect(observedResponse.headers.getSetCookie()).toHaveLength(2);
    expect(observedEvents).toContain('observe');

    const thrownEvents: string[] = [];
    const thrownCell = makeObservedCell({
      id: 'candidate.presenter-throws.v1',
      path: '/candidate/presenter-throws',
      events: thrownEvents,
      outcome: 'failure',
      presenterThrows: true,
    });
    let observations = 0;
    let errors = 0;
    const thrownApplication = express();
    mountHttpBoundaryCatalog({
      router: thrownApplication,
      catalog: defineHttpCatalog([thrownCell], {
        [thrownCell.id]: observedProfile,
      }),
      dependencies: {
        ...makeDependencies(thrownEvents),
        observeExpectedFailure: () => {
          observations += 1;
        },
      },
    });
    thrownApplication.use(((error, request, response, next) => {
      errors += 1;
      errorBoundary(error, request, response, next);
    }) satisfies ErrorRequestHandler);
    const thrownResponse = await fetch(
      `${await listen(thrownApplication)}/candidate/presenter-throws`,
    );
    expect(thrownResponse.status).toBe(401);
    await expect(thrownResponse.json()).resolves.toEqual({
      code: 'presented_auth_failure',
    });
    expect(observations).toBe(0);
    expect(errors).toBe(1);
  });

  it('rejects an observation profile without its process-edge observer', () => {
    const events: string[] = [];
    const cell = makeObservedCell({
      id: 'candidate.observer-missing.v1',
      path: '/candidate/observer-missing',
      events,
      outcome: 'failure',
    });
    const observedProfile = profile({
      ...publicNoAuth,
      id: 'observer-missing',
      expectedFailureObservation: 'cookie-auth-failure',
    });
    expect(() =>
      mountHttpBoundaryCatalog({
        router: express(),
        catalog: defineHttpCatalog([cell], { [cell.id]: observedProfile }),
        dependencies: makeDependencies(events),
      }),
    ).toThrowError(/without a host observer/u);
  });

  it('retains staged after-input scope authorization after the declared validation phase', async () => {
    const events: string[] = [];
    const cell = makeCell({
      id: 'candidate.staged-after-input.v1',
      path: '/candidate/staged-after-input',
      events,
      authentication: 'required',
      authorization: 'after-input',
      body: true,
      stagedAfterInput: true,
    });
    const application = express();
    mountHttpBoundaryCatalog({
      router: application,
      catalog: defineHttpCatalog([cell], { [cell.id]: processorCookie }),
      dependencies: makeDependencies(events),
    });
    application.use(errorBoundary);
    const response = await postJson(
      await listen(application),
      '/candidate/staged-after-input',
      'staged-value',
    );

    expect(response.status).toBe(200);
    expect(events).toEqual([
      'request-context:candidate.staged-after-input.v1:processor-cookie',
      'request-rate-limit:ip-bucket-a',
      'request-body-parser:json-document',
      'exact-origin:exact-origin-a',
      'authentication:session-cookie-a',
      'identity-rate-limit:identity-bucket-a',
      'validate:candidate.staged-after-input.v1',
      'decode-scope:candidate.staged-after-input.v1',
      'authorize:capability-a:candidate.staged-after-input.v1.execute:candidate.staged-after-input.v1-scope',
      'cell-context:request-actor-a',
      'decode:candidate.staged-after-input.v1',
      'execute:candidate.staged-after-input.v1',
    ]);
  });

  it('rejects invalid input before bearer authentication when the profile declares that phase', async () => {
    const events: string[] = [];
    const cell = makeCell({
      id: 'candidate.validation-first.v1',
      path: '/candidate/validation-first',
      events,
      authentication: 'required',
      authorization: null,
      body: true,
      rejectValidation: true,
    });
    const baseDependencies = makeDependencies(events);
    const application = express();
    mountHttpBoundaryCatalog({
      router: application,
      catalog: defineHttpCatalog([cell], { [cell.id]: bearerSession }),
      dependencies: {
        ...baseDependencies,
        middleware: (input): RequestHandler => {
          if (input.kind !== 'authentication')
            return baseDependencies.middleware(input);
          return (_request, _response, _next): void => {
            events.push(`authentication:${input.provider}`);
            throw authError({
              code: 'candidate_authentication_required',
              message: 'Candidate authentication is required.',
            });
          };
        },
      },
    });
    application.use(errorBoundary);
    const response = await postJson(
      await listen(application),
      '/candidate/validation-first',
      'invalid',
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'candidate_input_invalid',
    });
    expect(events).toEqual([
      'request-context:candidate.validation-first.v1:bearer-session',
      'request-rate-limit:ip-bucket-bearer',
      'request-body-parser:json-document',
      'validate:candidate.validation-first.v1',
    ]);
  });

  it('refuses an unprofiled catalog and incompatible profile semantics', () => {
    const events: string[] = [];
    const cell = makeCell({
      id: 'candidate.fail-closed.v1',
      path: '/candidate/fail-closed',
      events,
      authentication: 'required',
      authorization: null,
      body: true,
    });
    const application = express();

    expect(() =>
      mountHttpBoundaryCatalog({
        router: application,
        catalog: defineHttpCatalog([cell]),
        dependencies: makeDependencies(events),
      }),
    ).toThrowError(/no compiled HTTP boundary profile/u);

    expect(() =>
      mountHttpBoundaryCatalog({
        router: application,
        catalog: defineHttpCatalog([cell], {
          [cell.id]: publicNoAuth,
        }),
        dependencies: makeDependencies(events),
      }),
    ).toThrowError(/disagree about required authentication/u);

    expect(() =>
      mountHttpCatalog({
        router: application,
        catalog: defineHttpCatalog([cell], {
          [cell.id]: bearerSession,
        }),
        dependencies: {
          requestContext: () => (_request, _response, next) => next(),
          authentication: () => (_request, _response, next) => next(),
          body: () => (_request, _response, next) => next(),
          readCellContext: () => Object.freeze({}),
          authorize: () => undefined,
        },
      }),
    ).toThrowError(/must use the profiled catalog host/u);

    const parserAfterValidation = profile({
      ...bearerSession,
      id: 'parser-after-validation',
      requestBody: {
        ...bearerSession.requestBody!,
        phase: 'after-authentication',
      },
    });
    expect(() =>
      mountHttpBoundaryCatalog({
        router: application,
        catalog: defineHttpCatalog([cell], {
          [cell.id]: parserAfterValidation,
        }),
        dependencies: makeDependencies(events),
      }),
    ).toThrowError(/before its declared request parser/u);

    const invalidValidationPhase = profile({
      ...bearerSession,
      id: 'invalid-validation-phase',
      inputValidationPhase: 'invalid' as never,
    });
    expect(() =>
      mountHttpBoundaryCatalog({
        router: application,
        catalog: defineHttpCatalog([cell], {
          [cell.id]: invalidValidationPhase,
        }),
        dependencies: makeDependencies(events),
      }),
    ).toThrowError(/invalid input validation phase/u);

    const invalidContentTypePolicy = profile({
      ...bearerSession,
      id: 'invalid-content-type-policy',
      requestBody: {
        ...bearerSession.requestBody!,
        contentType: 'sometimes' as never,
      },
    });
    expect(() =>
      mountHttpBoundaryCatalog({
        router: application,
        catalog: defineHttpCatalog([cell], {
          [cell.id]: invalidContentTypePolicy,
        }),
        dependencies: makeDependencies(events),
      }),
    ).toThrowError(/invalid content-type policy/u);

    const invalidObserver = profile({
      ...bearerSession,
      id: 'invalid-observer',
      expectedFailureObservation: 42 as never,
    });
    expect(() =>
      mountHttpBoundaryCatalog({
        router: application,
        catalog: defineHttpCatalog([cell], {
          [cell.id]: invalidObserver,
        }),
        dependencies: makeDependencies(events),
      }),
    ).toThrowError(/invalid expected-failure observation provider/u);
  });
});
