import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  defineOperation,
  defineHttpCatalog,
  http,
  type HttpRequest,
} from '@pressly/cells';
import { isAppError, type AppError } from '@pressly/errors/app-error';
import { authError, unexpectedError } from '@pressly/errors/factories';
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import {
  mountHttpCatalog,
  type HttpHostDependencies,
} from '../src/http-host.ts';

type TestInput = Readonly<{ actorId: string; scope: string; value: string }>;
type TestOutput = Readonly<{ accepted: string }>;
type TestFailure = Readonly<{
  code: 'rejected';
  attemptedValue: string;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const inputContract = (events: string[]) =>
  defineBoundaryContract<TestInput>({
    version: 1,
    decode: (value) => {
      events.push('decode');
      return isRecord(value) &&
        typeof value['actorId'] === 'string' &&
        typeof value['scope'] === 'string' &&
        typeof value['value'] === 'string'
        ? decode.valid({
            actorId: value['actorId'],
            scope: value['scope'],
            value: value['value'],
          })
        : decode.invalid([
            { path: [], message: 'actor, scope, and value required' },
          ]);
    },
    encode: (value) => value,
  });

const outputContract = defineBoundaryContract<TestOutput>({
  version: 1,
  decode: (value) =>
    isRecord(value) && typeof value['accepted'] === 'string'
      ? decode.valid({ accepted: value['accepted'] })
      : decode.invalid([{ path: [], message: 'accepted required' }]),
  encode: (value) => value,
});

const failureContract = defineBoundaryContract<TestFailure>({
  version: 1,
  decode: (value) =>
    isRecord(value) &&
    value['code'] === 'rejected' &&
    typeof value['attemptedValue'] === 'string'
      ? decode.valid({
          code: value['code'],
          attemptedValue: value['attemptedValue'],
        })
      : decode.invalid([{ path: [], message: 'failure required' }]),
  encode: (value) => value,
});

const serializedInput = (request: HttpRequest): unknown => ({
  actorId: isRecord(request.context) ? request.context['actorId'] : undefined,
  scope: request.params['scope'],
  value: isRecord(request.body) ? request.body['value'] : undefined,
});

const makeDependencies = (events: string[]): HttpHostDependencies => ({
  requestContext:
    (operation): RequestHandler =>
    (_request, response, next): void => {
      events.push(`context:${operation.observability}`);
      response.set('x-test-trace', operation.operationId);
      next();
    },
  authentication:
    ({ required }): RequestHandler =>
    (_request, _response, next): void => {
      events.push(`authenticate:${String(required)}`);
      next();
    },
  body:
    ({ limit }): RequestHandler =>
    (request, response, next): void => {
      events.push(`body:${limit ?? 'none'}`);
      express.json({ limit: '16kb' })(request, response, next);
    },
  readCellContext: () => {
    events.push('read-context');
    return Object.freeze({ actorId: 'authenticated-actor' });
  },
  authorize: ({ capability, scope }): void => {
    events.push(`authorize:${capability}:${scope}`);
  },
});

const errorBoundary: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  if (isAppError(error)) {
    response.status(error.status).send({ code: error.code });
    return;
  }

  response.status(500).send({ code: 'unexpected_test_failure' });
};

const captureAppErrors =
  (errors: AppError[]): ErrorRequestHandler =>
  (error, _request, response, _next): void => {
    if (isAppError(error)) {
      errors.push(error);
      response.status(error.status).send({ code: error.code });
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
      code: 'http_host_test_address_missing',
      message: 'The HTTP host test server has no TCP address.',
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

describe('generic HTTP catalog host', () => {
  it('authenticates before exposing staged scope validation', async () => {
    const events: string[] = [];
    let executions = 0;
    const cell = defineOperation<TestInput, TestOutput, TestFailure>({
      kind: 'command',
      id: 'example.authentication-first.v1',
      contract: defineCellContract({
        input: inputContract(events),
        output: outputContract,
        failure: failureContract,
      }),
      authorization: {
        capability: 'example.execute',
        timing: 'before-input',
      },
      surfaces: [
        http.post({
          path: '/examples/:scope',
          bodyLimit: 'small-command',
          invalidRequest: {
            authorizationScope: {
              code: 'invalid_params_type',
              message: 'Validation params failed.',
              safeMessage: 'Invalid request input.',
              status: 400,
              location: 'params',
            },
            input: {
              code: 'invalid_body_type',
              message: 'Validation body failed.',
              safeMessage: 'Invalid request input.',
              status: 400,
              location: 'body',
            },
          },
          decodeAuthorizationScope: () => {
            events.push('decode-scope');
            return decode.invalid([
              { path: ['scope'], message: 'scope rejected' },
            ]);
          },
          toSerializedInput: serializedInput,
          present: () => ({ status: 204 }),
        }),
      ],
      observability: { operation: 'example.authentication-first' },
      execute: async () => {
        executions += 1;
        return { kind: 'success', value: { accepted: 'unexpected' } };
      },
    });
    const baseDependencies = makeDependencies(events);
    const dependencies: HttpHostDependencies = {
      ...baseDependencies,
      authentication: (): RequestHandler => async (): Promise<void> => {
        events.push('authentication-denied');
        throw authError({
          code: 'test_authentication_required',
          message: 'Authentication is required for this test.',
        });
      },
    };
    const application = express();
    mountHttpCatalog({
      router: application,
      catalog: defineHttpCatalog([cell]),
      dependencies,
    });
    application.use(errorBoundary);
    const baseUrl = await listen(application);

    const response = await fetch(`${baseUrl}/examples/private-scope`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'must-not-be-parsed' }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: 'test_authentication_required',
    });
    expect(events).toEqual([
      'context:example.authentication-first',
      'authentication-denied',
    ]);
    expect(executions).toBe(0);
  });

  it('registers an exact public GET and still runs generic host hooks', async () => {
    const events: string[] = [];
    let executions = 0;
    const cell = defineOperation<TestInput, TestOutput, TestFailure>({
      kind: 'query',
      id: 'example.read.v1',
      contract: defineCellContract({
        input: inputContract(events),
        output: outputContract,
        failure: failureContract,
      }),
      surfaces: [
        http.get({
          path: '/examples/:scope',
          toSerializedInput: (request) => ({
            actorId: isRecord(request.context)
              ? request.context['actorId']
              : undefined,
            scope: request.params['scope'],
            value: 'read',
          }),
          present: (outcome) => {
            events.push('present');
            return outcome.kind === 'success'
              ? { status: 200, body: outcome.value }
              : { status: 404, body: outcome.failure };
          },
        }),
      ],
      observability: { operation: 'example.read' },
      execute: async (input) => {
        executions += 1;
        events.push('execute');
        return { kind: 'success', value: { accepted: input.scope } };
      },
    });
    const application = express();
    mountHttpCatalog({
      router: application,
      catalog: defineHttpCatalog([cell]),
      dependencies: makeDependencies(events),
    });
    application.use(errorBoundary);
    const baseUrl = await listen(application);

    const response = await fetch(`${baseUrl}/examples/public-scope`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accepted: 'public-scope',
    });
    expect(executions).toBe(1);
    expect(events).toEqual([
      'context:example.read',
      'authenticate:false',
      'body:none',
      'read-context',
      'decode',
      'execute',
      'present',
    ]);
    expect(
      (
        await fetch(`${baseUrl}/examples/public-scope`, {
          method: 'POST',
        })
      ).status,
    ).toBe(404);
  });

  it('requires authentication without authorization and resolves declared context after pure validation', async () => {
    const events: string[] = [];
    let executions = 0;
    const cell = defineOperation<TestInput, TestOutput, TestFailure>({
      kind: 'query',
      id: 'example.authenticated-context.v1',
      authentication: 'required',
      contract: defineCellContract({
        input: inputContract(events),
        output: outputContract,
        failure: failureContract,
      }),
      surfaces: [
        http.get({
          path: '/authenticated/:scope',
          contextRequirements: ['allowed-example-scopes'],
          validateRequest: () => {
            events.push('validate-request');
            return undefined;
          },
          toSerializedInput: (request) => {
            events.push('serialize');
            return {
              actorId: isRecord(request.context)
                ? request.context['actorId']
                : undefined,
              scope: request.params['scope'],
              value: 'read',
            };
          },
          present: (outcome) =>
            outcome.kind === 'success'
              ? { status: 200, body: outcome.value }
              : { status: 404, body: outcome.failure },
        }),
      ],
      observability: { operation: 'example.authenticated-context' },
      execute: async (command) => {
        events.push('execute');
        executions += 1;
        return { kind: 'success', value: { accepted: command.scope } };
      },
    });
    const baseDependencies = makeDependencies(events);
    const dependencies: HttpHostDependencies = {
      ...baseDependencies,
      readCellContext: async (operation) => {
        events.push(
          `resolve-context:${operation.contextRequirements.join(',')}`,
        );
        await Promise.resolve();
        return { actorId: 'authenticated-actor' };
      },
    };
    const application = express();
    mountHttpCatalog({
      router: application,
      catalog: defineHttpCatalog([cell]),
      dependencies,
    });
    application.use(errorBoundary);

    const response = await fetch(
      `${await listen(application)}/authenticated/location-a`,
    );
    expect(response.status).toBe(200);
    expect(executions).toBe(1);
    expect(events).toEqual([
      'context:example.authenticated-context',
      'authenticate:true',
      'body:none',
      'validate-request',
      'resolve-context:allowed-example-scopes',
      'serialize',
      'decode',
      'execute',
    ]);
  });

  it('stops when asynchronous context resolution ends the response', async () => {
    const events: string[] = [];
    const cell = defineOperation<TestInput, TestOutput, TestFailure>({
      kind: 'query',
      id: 'example.context-terminal.v1',
      authentication: 'required',
      contract: defineCellContract({
        input: inputContract(events),
        output: outputContract,
        failure: failureContract,
      }),
      surfaces: [
        http.get({
          path: '/context-terminal/:scope',
          validateRequest: () => {
            events.push('validate-request');
            return undefined;
          },
          toSerializedInput: serializedInput,
          present: () => ({ status: 200 }),
        }),
      ],
      observability: { operation: 'example.context-terminal' },
      execute: async () => {
        events.push('execute');
        return { kind: 'success', value: { accepted: 'unexpected' } };
      },
    });
    const baseDependencies = makeDependencies(events);
    const application = express();
    mountHttpCatalog({
      router: application,
      catalog: defineHttpCatalog([cell]),
      dependencies: {
        ...baseDependencies,
        readCellContext: async (_operation, _request, response) => {
          events.push('resolve-context-terminal');
          response.status(204).end();
          return {};
        },
      },
    });
    application.use(errorBoundary);

    const response = await fetch(
      `${await listen(application)}/context-terminal/location-a`,
    );
    expect(response.status).toBe(204);
    expect(events).toEqual([
      'context:example.context-terminal',
      'authenticate:true',
      'body:none',
      'validate-request',
      'resolve-context-terminal',
    ]);
  });

  it('authenticates and authorizes route scope before parsing the body', async () => {
    const events: string[] = [];
    const errors: AppError[] = [];
    let executions = 0;
    const cell = defineOperation<TestInput, TestOutput, TestFailure>({
      kind: 'command',
      id: 'example.before-input.v1',
      contract: defineCellContract({
        input: inputContract(events),
        output: outputContract,
        failure: failureContract,
      }),
      authorization: {
        capability: 'example.execute',
        timing: 'before-input',
      },
      surfaces: [
        http.post({
          path: '/examples/:scope',
          bodyLimit: 'small-command',
          decodeAuthorizationScope: (request) => {
            events.push('decode-scope');
            const scope = request.params['scope'];
            return scope === undefined || scope === 'invalid'
              ? decode.invalid([{ path: ['scope'], message: 'scope required' }])
              : decode.valid(scope);
          },
          toSerializedInput: (request) => {
            events.push('serialize');
            return serializedInput(request);
          },
          present: (outcome) => {
            events.push('present');
            return outcome.kind === 'success'
              ? {
                  status: 201,
                  headers: { 'x-outcome': 'accepted' },
                  body: outcome.value,
                }
              : { status: 409, body: outcome.failure };
          },
        }),
      ],
      observability: { operation: 'example.before-input' },
      execute: async (input) => {
        executions += 1;
        events.push('execute');
        return { kind: 'success', value: { accepted: input.value } };
      },
    });
    const application = express();
    const mounted = mountHttpCatalog({
      router: application,
      catalog: defineHttpCatalog([cell]),
      dependencies: makeDependencies(events),
    });
    application.use(captureAppErrors(errors));
    const baseUrl = await listen(application);

    const response = await fetch(`${baseUrl}/examples/location-a`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'accepted-value' }),
    });

    expect(mounted).toEqual({ routeCount: 1 });
    expect(response.status).toBe(201);
    expect(response.headers.get('x-test-trace')).toBe(
      'example.before-input.v1',
    );
    expect(response.headers.get('x-outcome')).toBe('accepted');
    await expect(response.json()).resolves.toEqual({
      accepted: 'accepted-value',
    });
    expect(executions).toBe(1);
    expect(events).toEqual([
      'context:example.before-input',
      'authenticate:true',
      'decode-scope',
      'authorize:example.execute:location-a',
      'body:small-command',
      'read-context',
      'serialize',
      'decode',
      'execute',
      'present',
    ]);

    const beforeInvalidScope = events.length;
    const invalidScope = await fetch(`${baseUrl}/examples/invalid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'must-not-be-parsed' }),
    });
    expect(invalidScope.status).toBe(400);
    await expect(invalidScope.json()).resolves.toEqual({
      code: 'http_cell_authorization_scope_invalid',
    });
    expect(errors[0]).toMatchObject({
      code: 'http_cell_authorization_scope_invalid',
      safeMessage: 'Invalid request scope.',
      status: 400,
      details: {
        operationId: 'example.before-input.v1',
        issues: [{ path: ['scope'], message: 'scope required' }],
      },
    });
    expect(errors[0]?.publicDetails).toBeUndefined();
    expect(events.slice(beforeInvalidScope)).toEqual([
      'context:example.before-input',
      'authenticate:true',
      'decode-scope',
    ]);
    expect(executions).toBe(1);

    expect((await fetch(`${baseUrl}/examples/location-a`)).status).toBe(404);
    expect(
      (
        await fetch(`${baseUrl}/not-the-declared-path`, {
          method: 'POST',
        })
      ).status,
    ).toBe(404);
  });

  it('presents declared scope and input decode failures through exact AppErrors', async () => {
    const events: string[] = [];
    const errors: AppError[] = [];
    let executions = 0;
    const contract = defineBoundaryContract<TestInput>({
      version: 1,
      decode: (value) => {
        events.push('decode');
        return isRecord(value) &&
          typeof value['actorId'] === 'string' &&
          typeof value['scope'] === 'string' &&
          typeof value['value'] === 'string'
          ? decode.valid({
              actorId: value['actorId'],
              scope: value['scope'],
              value: value['value'],
            })
          : decode.invalid([
              {
                path: ['body', 'value'],
                message: 'Expected a string value.',
              },
            ]);
      },
      encode: (value) => value,
    });
    const cell = defineOperation<TestInput, TestOutput, TestFailure>({
      kind: 'command',
      id: 'example.declared-invalid-request.v1',
      contract: defineCellContract({
        input: contract,
        output: outputContract,
        failure: failureContract,
      }),
      authorization: {
        capability: 'example.execute',
        timing: 'before-input',
      },
      surfaces: [
        http.post({
          path: '/declared/:scope',
          bodyLimit: 'small-command',
          invalidRequest: {
            authorizationScope: {
              code: 'invalid_params_type',
              message: 'Validation params failed.',
              safeMessage: 'Invalid request input.',
              status: 400,
              location: 'params',
            },
            input: {
              code: 'invalid_body_type',
              message: 'Validation body failed.',
              safeMessage: 'Invalid request input.',
              status: 400,
              location: 'body',
            },
          },
          decodeAuthorizationScope: (request) => {
            events.push('decode-scope');
            const scope = request.params['scope'];
            return scope === undefined || scope === 'invalid'
              ? decode.invalid([
                  {
                    path: ['params', 'scope'],
                    message: 'Expected a valid scope.',
                  },
                ])
              : decode.valid(scope);
          },
          toSerializedInput: (request) => {
            events.push('serialize');
            return serializedInput(request);
          },
          present: () => ({ status: 204 }),
        }),
      ],
      observability: { operation: 'example.declared-invalid-request' },
      execute: async () => {
        executions += 1;
        return { kind: 'success', value: { accepted: 'unexpected' } };
      },
    });
    const application = express();
    mountHttpCatalog({
      router: application,
      catalog: defineHttpCatalog([cell]),
      dependencies: makeDependencies(events),
    });
    application.use(captureAppErrors(errors));
    const baseUrl = await listen(application);

    const invalidScope = await fetch(`${baseUrl}/declared/invalid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'must-not-be-parsed' }),
    });
    expect(invalidScope.status).toBe(400);
    await expect(invalidScope.json()).resolves.toEqual({
      code: 'invalid_params_type',
    });
    expect(errors[0]).toMatchObject({
      kind: 'ValidationError',
      code: 'invalid_params_type',
      message: 'Validation params failed.',
      safeMessage: 'Invalid request input.',
      status: 400,
      publicDetails: {
        location: 'params',
        issues: [{ path: 'scope', message: 'Expected a valid scope.' }],
      },
    });
    expect(events).toEqual([
      'context:example.declared-invalid-request',
      'authenticate:true',
      'decode-scope',
    ]);

    const invalidInput = await fetch(`${baseUrl}/declared/location-a`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(invalidInput.status).toBe(400);
    await expect(invalidInput.json()).resolves.toEqual({
      code: 'invalid_body_type',
    });
    expect(errors[1]).toMatchObject({
      kind: 'ValidationError',
      code: 'invalid_body_type',
      message: 'Validation body failed.',
      safeMessage: 'Invalid request input.',
      status: 400,
      publicDetails: {
        location: 'body',
        issues: [{ path: 'value', message: 'Expected a string value.' }],
      },
    });
    expect(executions).toBe(0);
  });

  it('authorizes decoded input and preserves a typed expected failure', async () => {
    const events: string[] = [];
    const failure: TestFailure = {
      code: 'rejected',
      attemptedValue: 'blocked-value',
    };
    let executions = 0;
    const cell = defineOperation<TestInput, TestOutput, TestFailure>({
      kind: 'command',
      id: 'example.after-input.v1',
      contract: defineCellContract({
        input: inputContract(events),
        output: outputContract,
        failure: failureContract,
      }),
      authorization: {
        capability: 'example.execute',
        timing: 'after-input',
        scope: (input) => input.scope,
      },
      surfaces: [
        http.patch({
          path: '/examples/:scope',
          bodyLimit: 'small-command',
          validateRequest: () => {
            events.push('validate');
            return undefined;
          },
          decodeAuthorizationScope: (request) => {
            events.push('decode-scope');
            const scope = request.params['scope'];
            return typeof scope === 'string'
              ? decode.valid(scope)
              : decode.invalid([
                  { path: ['scope'], message: 'scope required' },
                ]);
          },
          toSerializedInput: serializedInput,
          present: (outcome) => {
            events.push('present');
            return outcome.kind === 'failure'
              ? { status: 409, body: outcome.failure }
              : { status: 200, body: outcome.value };
          },
        }),
      ],
      observability: { operation: 'example.after-input' },
      execute: async () => {
        executions += 1;
        events.push('execute');
        return { kind: 'failure', failure };
      },
    });
    const application = express();
    const dependencies = makeDependencies(events);
    mountHttpCatalog({
      router: application,
      catalog: defineHttpCatalog([cell]),
      dependencies: {
        ...dependencies,
        authorize: ({ capability, scope, request, response }): void => {
          events.push(`authorize:${capability}:${scope}`);
          if (request.header('x-test-terminal-authorization') === 'true')
            response.status(403).send({ code: 'authorization_ended_response' });
        },
      },
    });
    application.use(errorBoundary);
    const baseUrl = await listen(application);

    const response = await fetch(`${baseUrl}/examples/location-b`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'blocked-value' }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(failure);
    expect(executions).toBe(1);
    expect(events).toEqual([
      'context:example.after-input',
      'authenticate:true',
      'body:small-command',
      'validate',
      'decode-scope',
      'authorize:example.execute:location-b',
      'read-context',
      'decode',
      'execute',
      'present',
    ]);

    events.length = 0;
    const terminal = await fetch(`${baseUrl}/examples/location-b`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-terminal-authorization': 'true',
      },
      body: JSON.stringify({ value: 'blocked-value' }),
    });
    expect(terminal.status).toBe(403);
    await expect(terminal.json()).resolves.toEqual({
      code: 'authorization_ended_response',
    });
    expect(executions).toBe(1);
    expect(events).toEqual([
      'context:example.after-input',
      'authenticate:true',
      'body:small-command',
      'validate',
      'decode-scope',
      'authorize:example.execute:location-b',
    ]);
  });

  it('rejects invalid input without executing the cell', async () => {
    const events: string[] = [];
    const errors: AppError[] = [];
    let executions = 0;
    const cell = defineOperation<TestInput, TestOutput, TestFailure>({
      kind: 'command',
      id: 'example.invalid-input.v1',
      contract: defineCellContract({
        input: inputContract(events),
        output: outputContract,
        failure: failureContract,
      }),
      surfaces: [
        http.put({
          path: '/examples/:scope',
          bodyLimit: 'small-command',
          toSerializedInput: serializedInput,
          present: () => ({ status: 204 }),
        }),
      ],
      observability: { operation: 'example.invalid-input' },
      execute: async () => {
        executions += 1;
        return { kind: 'success', value: { accepted: 'unexpected' } };
      },
    });
    const application = express();
    mountHttpCatalog({
      router: application,
      catalog: defineHttpCatalog([cell]),
      dependencies: makeDependencies(events),
    });
    application.use(captureAppErrors(errors));
    const baseUrl = await listen(application);

    const response = await fetch(`${baseUrl}/examples/location-c`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'http_cell_input_invalid',
    });
    expect(errors[0]).toMatchObject({
      code: 'http_cell_input_invalid',
      safeMessage: 'Invalid request input.',
      status: 400,
      details: {
        operationId: 'example.invalid-input.v1',
        issues: [{ path: [], message: 'actor, scope, and value required' }],
      },
    });
    expect(errors[0]?.publicDetails).toBeUndefined();
    expect(executions).toBe(0);
  });

  it('returns the execution promise directly to the Express 5 error boundary', async () => {
    const events: string[] = [];
    let executions = 0;
    const cell = defineOperation<TestInput, TestOutput, TestFailure>({
      kind: 'command',
      id: 'example.rejected-promise.v1',
      contract: defineCellContract({
        input: inputContract(events),
        output: outputContract,
        failure: failureContract,
      }),
      surfaces: [
        http.delete({
          path: '/examples/:scope',
          toSerializedInput: (request) => ({
            actorId: isRecord(request.context)
              ? request.context['actorId']
              : undefined,
            scope: request.params['scope'],
            value: 'delete',
          }),
          present: () => ({ status: 204 }),
        }),
      ],
      observability: { operation: 'example.rejected-promise' },
      execute: async () => {
        executions += 1;
        throw unexpectedError({
          code: 'example_execution_failed',
          message: 'The example execution failed.',
        });
      },
    });
    const application = express();
    mountHttpCatalog({
      router: application,
      catalog: defineHttpCatalog([cell]),
      dependencies: makeDependencies(events),
    });
    application.use(errorBoundary);
    const baseUrl = await listen(application);

    const response = await fetch(`${baseUrl}/examples/location-d`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      code: 'example_execution_failed',
    });
    expect(executions).toBe(1);
    expect(events).toContain('body:none');
    expect(events).toContain('read-context');
  });
});
