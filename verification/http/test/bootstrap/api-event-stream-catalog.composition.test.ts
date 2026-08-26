import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  decode,
  defineBoundaryContract,
  defineEventStreamCatalog,
  defineOperation,
  defineSubscriptionContract,
  eventStream,
  type SubscriptionObserver,
  type SubscriptionSession,
} from '@pressly/cells';
import { isAppError, type AppError } from '@pressly/errors/app-error';
import { permissionError, unexpectedError } from '@pressly/errors/factories';
import type { EventStreamHostDependencies } from '@pressly/http-host';
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  makeApiEventStreamCatalogRouter,
  makeApiRequestMetrics,
  makeRequestContext,
} from '@pressly/http-host/runtime';

type TestInput = Readonly<{ actorId: string; locationId: string }>;
type TestReady = Readonly<{ revision: number }>;
type TestEvent =
  | Readonly<{ kind: 'change'; revision: number }>
  | Readonly<{ kind: 'resync' }>;
type TestFailure = Readonly<{ kind: 'missing' }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
      code: 'api_event_stream_catalog_test_address_missing',
      message: 'The API event-stream catalog test server has no TCP address.',
    });

  return `http://127.0.0.1:${(address as AddressInfo).port}`;
};

const readUntil = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (value: string) => boolean,
): Promise<string> => {
  const decoder = new TextDecoder();
  let value = '';
  while (!predicate(value)) {
    const next = await reader.read();
    if (next.done) break;
    value += decoder.decode(next.value, { stream: true });
  }
  return value;
};

const readToEnd = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> => {
  while (!(await reader.read()).done) {
    // Drain until the host closes the stream.
  }
};

const tick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
});

const contract = (events: string[]) =>
  defineSubscriptionContract<TestInput, TestReady, TestEvent, TestFailure>({
    input: defineBoundaryContract({
      version: 1,
      decode: (value) => {
        events.push('decode');
        return isRecord(value) &&
          typeof value['actorId'] === 'string' &&
          typeof value['locationId'] === 'string'
          ? decode.valid({
              actorId: value['actorId'],
              locationId: value['locationId'],
            })
          : decode.invalid([
              { path: ['locationId'], message: 'Location is required.' },
            ]);
      },
      encode: (value) => value,
    }),
    output: defineBoundaryContract<TestReady>({
      version: 1,
      decode: () => decode.invalid([]),
      encode: (value) => value,
    }),
    event: defineBoundaryContract<TestEvent>({
      version: 1,
      decode: () => decode.invalid([]),
      encode: (value) => value,
    }),
    failure: defineBoundaryContract<TestFailure>({
      version: 1,
      decode: () => decode.invalid([]),
      encode: (value) => value,
    }),
  });

type TestOpen = () => Promise<
  | Readonly<{
      kind: 'success';
      value: SubscriptionSession<TestReady, TestEvent>;
    }>
  | Readonly<{ kind: 'failure'; failure: TestFailure }>
>;

const makeCatalog = (input: {
  events: string[];
  open: TestOpen;
  presentEvent?: (event: TestEvent) => Readonly<{
    event: string;
    data: unknown;
    id?: string;
  }>;
}) =>
  defineEventStreamCatalog([
    defineOperation({
      kind: 'subscription',
      id: 'example.subscribe.v1',
      contract: contract(input.events),
      authorization: {
        capability: 'example:read',
        timing: 'before-input',
      },
      surfaces: [
        eventStream.get<TestReady, TestEvent, TestFailure>({
          path: '/examples/:locationId/events',
          retryMs: 3_000,
          eventTypes: ['ready', 'change', 'resync'],
          invalidRequest: {
            authorizationScope: {
              code: 'invalid_params_type',
              message: 'Validation params failed.',
              safeMessage: 'Invalid request input.',
              status: 400,
              location: 'params',
            },
          },
          decodeAuthorizationScope: (head) => {
            input.events.push('decode-scope');
            const locationId = head.params['locationId'];
            return locationId === undefined || locationId === 'invalid'
              ? decode.invalid([
                  {
                    path: ['params', 'locationId'],
                    message: 'Location is required.',
                  },
                ])
              : decode.valid(locationId);
          },
          toSerializedInput: (request) => {
            input.events.push('serialize');
            return {
              actorId: isRecord(request.context)
                ? request.context['actorId']
                : undefined,
              locationId: request.params['locationId'],
            };
          },
          presentReady: (ready) => ({
            event: 'ready',
            id: String(ready.revision),
            data: ready,
          }),
          presentEvent:
            input.presentEvent ??
            ((event) =>
              event.kind === 'change'
                ? {
                    event: 'change',
                    id: String(event.revision),
                    data: { revision: event.revision },
                  }
                : { event: 'resync', data: { reason: 'reconnect' } }),
          presentFailure: () => ({
            status: 404,
            body: { code: 'missing' },
          }),
        }),
      ],
      observability: { operation: 'example.subscribe' },
      open: async (value) => {
        input.events.push(`open:${value.actorId}:${value.locationId}`);
        return input.open();
      },
    }),
  ]);

const makeSession = (
  input: {
    revision?: number;
    close?: () => Promise<void> | void;
  } = {},
) => {
  let observer: SubscriptionObserver<TestEvent> | null = null;
  const detach = vi.fn(() => {
    observer = null;
  });
  const close = vi.fn(async () => input.close?.());
  const session: SubscriptionSession<TestReady, TestEvent> = {
    ready: { revision: input.revision ?? 8 },
    subscribe: (next) => {
      observer = next;
      return detach;
    },
    close,
  };

  return {
    session,
    next: (event: TestEvent) => observer?.next(event),
    complete: () => observer?.close(),
    fail: (error: unknown) => observer?.error(error),
    detach,
    close,
  };
};

const captureErrors =
  (errors: unknown[]): ErrorRequestHandler =>
  (error, _request, response, _next): void => {
    errors.push(error);
    response.status(isAppError(error) ? error.status : 500).send({
      code: isAppError(error) ? error.code : 'unexpected_test_failure',
    });
  };

const makeHarness = (input: {
  catalog: ReturnType<typeof makeCatalog>;
  authenticate: RequestHandler;
  authorize: EventStreamHostDependencies['authorize'];
  heartbeatIntervalMs?: number;
  reauthorizeIntervalMs?: number;
  now?: () => number;
  beforeCatalog?: RequestHandler;
}) => {
  const errors: unknown[] = [];
  const counters = { increment: vi.fn() };
  const measurements = { observe: vi.fn() };
  const application = express();
  application.use(makeRequestContext());
  application.use(makeApiRequestMetrics({ counters, measurements }));
  if (input.beforeCatalog !== undefined) application.use(input.beforeCatalog);
  application.use(
    makeApiEventStreamCatalogRouter({
      catalog: input.catalog,
      authenticate: input.authenticate,
      authorize: input.authorize,
      readActorId: (response) => {
        const actorId: unknown = response.locals['actorId'];
        if (typeof actorId !== 'string')
          throw unexpectedError({
            code: 'api_event_stream_catalog_test_actor_missing',
            message: 'The API event-stream catalog test actor is missing.',
          });
        return actorId;
      },
      counters,
      measurements,
      ...(input.heartbeatIntervalMs === undefined
        ? {}
        : { heartbeatIntervalMs: input.heartbeatIntervalMs }),
      ...(input.reauthorizeIntervalMs === undefined
        ? {}
        : { reauthorizeIntervalMs: input.reauthorizeIntervalMs }),
      ...(input.now === undefined ? {} : { now: input.now }),
    }),
  );
  application.use(captureErrors(errors));

  return { application, counters, errors, measurements } as const;
};

const successfulAuthentication =
  (
    events: string[],
    sessionExpiresAt: Date | string = new Date(Date.now() + 60_000),
  ): RequestHandler =>
  (_request, response, next): void => {
    events.push('authenticate');
    expect(response.locals['requestId']).toEqual(expect.any(String));
    response.locals['actorId'] = 'processor-actor';
    response.locals['auth'] = { principal: { sessionExpiresAt } };
    next();
  };

const successfulAuthorization = (events: string[]) =>
  vi.fn<EventStreamHostDependencies['authorize']>(({ capability }) => {
    events.push(`select:${capability}`);
    events.push('authorize');
  });

const sseCounterCalls = (increment: ReturnType<typeof vi.fn>) =>
  increment.mock.calls.filter(([name]) => String(name).startsWith('api.sse_'));

describe('selected API event-stream catalog composition', () => {
  it('preserves API context, staged Processor authorization, exact SSE wire, and cleanup', async () => {
    const events: string[] = [];
    const stream = makeSession({ revision: 8 });
    const authorize = successfulAuthorization(events);
    const harness = makeHarness({
      catalog: makeCatalog({
        events,
        open: async () => ({ kind: 'success', value: stream.session }),
      }),
      authenticate: successfulAuthentication(events),
      authorize,
      heartbeatIntervalMs: 60_000,
      reauthorizeIntervalMs: 60_000,
    });

    const response = await fetch(
      `${await listen(harness.application)}/examples/east/events`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toBe(
      'no-store, no-cache, private, no-transform',
    );
    expect(response.headers.get('connection')).toContain('keep-alive');
    expect(response.headers.get('x-accel-buffering')).toBe('no');

    const reader = response.body!.getReader();
    const ready = await readUntil(reader, (value) =>
      value.includes('event: ready'),
    );
    expect(ready).toContain(
      'retry: 3000\n\nid: 8\nevent: ready\ndata: {"revision":8}\n\n',
    );

    stream.next({ kind: 'change', revision: 9 });
    stream.next({ kind: 'resync' });
    const changes = await readUntil(reader, (value) =>
      value.includes('event: resync'),
    );
    expect(changes).toContain('id: 9\nevent: change\ndata: {"revision":9}\n\n');
    expect(changes).toContain(
      'event: resync\ndata: {"reason":"reconnect"}\n\n',
    );

    stream.complete();
    await expect(reader.read()).resolves.toMatchObject({ done: true });
    await tick();

    expect(events).toEqual([
      'authenticate',
      'decode-scope',
      'select:example:read',
      'authorize',
      'serialize',
      'decode',
      'open:processor-actor:east',
    ]);
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({ capability: 'example:read', scope: 'east' }),
    );
    expect(stream.detach).toHaveBeenCalledOnce();
    expect(stream.close).toHaveBeenCalledOnce();
    expect(sseCounterCalls(harness.counters.increment)).toEqual([
      ['api.sse_connections', { outcome: 'opened' }],
      ['api.sse_events', { type: 'ready' }],
      ['api.sse_events', { type: 'change' }],
      ['api.sse_events', { type: 'resync' }],
      ['api.sse_connections', { outcome: 'closed' }],
    ]);
    expect(
      harness.measurements.observe.mock.calls.filter(
        ([name]) => name === 'api.sse_active_connections',
      ),
    ).toEqual([
      ['api.sse_active_connections', 1],
      ['api.sse_active_connections', 0],
    ]);
    expect(harness.counters.increment).toHaveBeenCalledWith(
      'api.http_requests',
      {
        method: 'GET',
        route: '/examples/:locationId/events',
        status: '2xx',
        outcome: 'completed',
      },
    );
    expect(harness.errors).toEqual([]);
  });

  it('keeps auth, params, and authorization ordered and delegates rejection to the outer error boundary', async () => {
    const invalidEvents: string[] = [];
    const invalidOpen = vi.fn<TestOpen>();
    const invalidAuthorize = successfulAuthorization(invalidEvents);
    const invalidHarness = makeHarness({
      catalog: makeCatalog({
        events: invalidEvents,
        open: invalidOpen,
      }),
      authenticate: successfulAuthentication(invalidEvents),
      authorize: invalidAuthorize,
    });

    const invalidResponse = await fetch(
      `${await listen(invalidHarness.application)}/examples/invalid/events`,
    );
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.headers.get('x-request-id')).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    await expect(invalidResponse.json()).resolves.toEqual({
      code: 'invalid_params_type',
    });
    expect(invalidEvents).toEqual(['authenticate', 'decode-scope']);
    expect(invalidAuthorize).not.toHaveBeenCalled();
    expect(invalidOpen).not.toHaveBeenCalled();

    const deniedEvents: string[] = [];
    const deniedOpen = vi.fn<TestOpen>();
    const denial: AppError = permissionError({
      code: 'production_read_forbidden',
      message: 'Production read access was denied.',
    });
    const deniedHarness = makeHarness({
      catalog: makeCatalog({ events: deniedEvents, open: deniedOpen }),
      authenticate: successfulAuthentication(deniedEvents),
      authorize: ({ capability }) => {
        deniedEvents.push(`select:${capability}`);
        deniedEvents.push('authorize');
        throw denial;
      },
    });

    const deniedResponse = await fetch(
      `${await listen(deniedHarness.application)}/examples/east/events`,
    );
    expect(deniedResponse.status).toBe(403);
    expect(deniedResponse.headers.get('x-request-id')).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    await expect(deniedResponse.json()).resolves.toEqual({
      code: 'production_read_forbidden',
    });
    expect(deniedHarness.errors).toEqual([denial]);
    expect(deniedEvents).toEqual([
      'authenticate',
      'decode-scope',
      'select:example:read',
      'authorize',
    ]);
    expect(deniedOpen).not.toHaveBeenCalled();
  });

  it('honors string session expiry and configured heartbeats', async () => {
    const events: string[] = [];
    const now = 1_000;
    const stream = makeSession();
    const harness = makeHarness({
      catalog: makeCatalog({
        events,
        open: async () => ({ kind: 'success', value: stream.session }),
      }),
      authenticate: successfulAuthentication(
        events,
        new Date(now + 80).toISOString(),
      ),
      authorize: successfulAuthorization(events),
      heartbeatIntervalMs: 5,
      reauthorizeIntervalMs: 60_000,
      now: () => now,
    });

    const response = await fetch(
      `${await listen(harness.application)}/examples/east/events`,
    );
    const reader = response.body!.getReader();
    const body = await readUntil(reader, (value) =>
      value.includes(': heartbeat\n\n'),
    );
    expect(body).toContain(': heartbeat\n\n');
    await readToEnd(reader);
    await tick();
    expect(stream.detach).toHaveBeenCalledOnce();
    expect(stream.close).toHaveBeenCalledOnce();
    expect(sseCounterCalls(harness.counters.increment)).toContainEqual([
      'api.sse_connections',
      { outcome: 'closed' },
    ]);
  });

  it('does not open a cell after authorization deliberately ends the response', async () => {
    const events: string[] = [];
    const open = vi.fn<TestOpen>();
    const harness = makeHarness({
      catalog: makeCatalog({ events, open }),
      authenticate: successfulAuthentication(events),
      authorize: ({ capability, response }) => {
        events.push(`select:${capability}`);
        events.push('authorize-terminal');
        response.status(403).send({ code: 'authorization_ended_response' });
      },
    });

    const response = await fetch(
      `${await listen(harness.application)}/examples/east/events`,
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: 'authorization_ended_response',
    });
    expect(events).toEqual([
      'authenticate',
      'decode-scope',
      'select:example:read',
      'authorize-terminal',
    ]);
    expect(open).not.toHaveBeenCalled();
    expect(harness.errors).toEqual([]);
  });

  it('maps every bounded host failure reason without unbounded labels', async () => {
    const observed: unknown[][] = [];

    const run = async (input: {
      stream: ReturnType<typeof makeSession>;
      presentEvent?: Parameters<typeof makeCatalog>[0]['presentEvent'];
      beforeCatalog?: RequestHandler;
      fail: (
        stream: ReturnType<typeof makeSession>,
        reader: ReadableStreamDefaultReader<Uint8Array>,
      ) => Promise<void> | void;
    }): Promise<void> => {
      const events: string[] = [];
      const harness = makeHarness({
        catalog: makeCatalog({
          events,
          open: async () => ({
            kind: 'success',
            value: input.stream.session,
          }),
          ...(input.presentEvent === undefined
            ? {}
            : { presentEvent: input.presentEvent }),
        }),
        authenticate: successfulAuthentication(events),
        authorize: successfulAuthorization(events),
        heartbeatIntervalMs: 60_000,
        reauthorizeIntervalMs: 60_000,
        ...(input.beforeCatalog === undefined
          ? {}
          : { beforeCatalog: input.beforeCatalog }),
      });
      const response = await fetch(
        `${await listen(harness.application)}/examples/east/events`,
      );
      const reader = response.body!.getReader();
      await readUntil(reader, (value) => value.includes('event: ready'));
      await input.fail(input.stream, reader);
      await readToEnd(reader);
      await tick();
      observed.push(
        ...sseCounterCalls(harness.counters.increment).filter(
          ([name]) => name === 'api.sse_failures',
        ),
      );
    };

    await run({
      stream: makeSession(),
      presentEvent: () => ({ event: 'invalid event', data: {} }),
      fail: (stream) => stream.next({ kind: 'change', revision: 9 }),
    });
    await run({
      stream: makeSession(),
      fail: (stream) => stream.fail('source failed'),
    });
    await run({
      stream: makeSession({
        close: async () => {
          throw new Error('session close failed');
        },
      }),
      fail: (stream) => stream.complete(),
    });

    const writeFailure = makeSession();
    let writes = 0;
    await run({
      stream: writeFailure,
      beforeCatalog: (_request, response, next): void => {
        const write = response.write.bind(response);
        response.write = ((...args: Parameters<typeof response.write>) => {
          writes += 1;
          if (writes === 2) throw new Error('socket write failed');
          return write(...args);
        }) as typeof response.write;
        next();
      },
      fail: () => undefined,
    });

    expect(observed).toEqual([
      ['api.sse_failures', { reason: 'invalid_frame' }],
      ['api.sse_failures', { reason: 'source_error' }],
      ['api.sse_failures', { reason: 'session_close' }],
      ['api.sse_failures', { reason: 'write_error' }],
    ]);
    expect(
      observed.every(([, labels]) =>
        Object.values(labels as Record<string, string>).every(
          (value) => value !== 'east' && value !== 'processor-actor',
        ),
      ),
    ).toBe(true);
  });
});
