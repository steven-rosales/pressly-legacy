import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  decode,
  defineBoundaryContract,
  defineEventStreamCatalog,
  defineSubscriptionCell,
  defineSubscriptionContract,
  eventStream,
  type SubscriptionObserver,
  type SubscriptionSession,
} from '@pressly/cells';
import { isAppError } from '@pressly/errors/app-error';
import { unexpectedError } from '@pressly/errors/factories';
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mountEventStreamCatalog,
  type EventStreamHostDependencies,
  type EventStreamHostMetrics,
} from '../src/event-stream-host.ts';

type TestInput = Readonly<{ locationId: string }>;
type TestReady = Readonly<{ revision: number }>;
type TestEvent =
  | Readonly<{ kind: 'change'; revision: number }>
  | Readonly<{ kind: 'resync' }>;
type TestFailure = Readonly<{ kind: 'missing' }>;

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
      code: 'event_stream_host_test_address_missing',
      message: 'The event-stream host test server has no address.',
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

const makeMetrics = () => ({
  connection: vi.fn<(outcome: 'closed' | 'opened') => void>(),
  activeConnections: vi.fn<(count: number) => void>(),
  event: vi.fn<(type: string) => void>(),
  failure: vi.fn<EventStreamHostMetrics['failure']>(),
});

const contract = defineSubscriptionContract<
  TestInput,
  TestReady,
  TestEvent,
  TestFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (value) =>
      typeof value === 'object' &&
      value !== null &&
      typeof Reflect.get(value, 'locationId') === 'string'
        ? decode.valid({ locationId: String(Reflect.get(value, 'locationId')) })
        : decode.invalid([
            { path: ['locationId'], message: 'location required' },
          ]),
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

const makeSession = (input: { revision?: number; close?: () => void }) => {
  let observer: SubscriptionObserver<TestEvent> | null = null;
  const detach = vi.fn(() => {
    observer = null;
  });
  const close = vi.fn(() => input.close?.());
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
    fail: () => observer?.error('source failed'),
    detach,
    close,
  };
};

const makeCatalog = (
  open: () => Promise<
    | Readonly<{
        kind: 'success';
        value: SubscriptionSession<TestReady, TestEvent>;
      }>
    | Readonly<{ kind: 'failure'; failure: TestFailure }>
  >,
  events: string[] = [],
  options: Readonly<{
    presentEvent?: (event: TestEvent) => Readonly<{
      event: string;
      id?: string;
      data: unknown;
    }>;
  }> = {},
) =>
  defineEventStreamCatalog([
    defineSubscriptionCell({
      id: 'example.subscribe.v1',
      contract,
      authorization: {
        capability: 'example:read',
        timing: 'before-input',
      },
      surfaces: [
        eventStream.get<TestReady, TestEvent, TestFailure>({
          path: '/examples/:locationId/events',
          retryMs: 3_000,
          eventTypes: ['ready', 'change', 'resync'],
          decodeAuthorizationScope: (head) => {
            events.push('decode-scope');
            const locationId = head.params['locationId'];
            return locationId === undefined ||
              locationId.length === 0 ||
              locationId === 'invalid'
              ? decode.invalid([
                  {
                    path: ['params', 'locationId'],
                    message: 'location required',
                  },
                ])
              : decode.valid(locationId);
          },
          toSerializedInput: (request) => {
            events.push('serialize');
            return { locationId: request.params['locationId'] };
          },
          presentReady: (ready) => ({
            event: 'ready',
            id: String(ready.revision),
            data: ready,
          }),
          presentEvent:
            options.presentEvent ??
            ((event) =>
              event.kind === 'change'
                ? {
                    event: 'change',
                    id: String(event.revision),
                    data: { revision: event.revision },
                  }
                : { event: 'resync', data: { reason: 'reconnect' } }),
          presentFailure: () => ({ status: 404, body: { code: 'missing' } }),
        }),
      ],
      observability: { operation: 'example.subscribe' },
      open: async () => {
        events.push('open');
        return open();
      },
    }),
  ]);

const makeDependencies = (
  metrics: EventStreamHostMetrics,
  events: string[] = [],
  overrides: Partial<EventStreamHostDependencies> = {},
): EventStreamHostDependencies => ({
  requestContext:
    (): RequestHandler =>
    (_request, _response, next): void => {
      events.push('context');
      next();
    },
  authentication:
    (): RequestHandler =>
    (_request, _response, next): void => {
      events.push('authenticate');
      next();
    },
  readCellContext: () => {
    events.push('read-context');
    return {};
  },
  authorize: ({ capability, scope }) => {
    events.push(`authorize:${capability}:${scope}`);
  },
  sessionExpiresAt: () => Date.now() + 60_000,
  metrics,
  heartbeatIntervalMs: 60_000,
  reauthorizeIntervalMs: 60_000,
  ...overrides,
});

const errorBoundary: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  response.status(isAppError(error) ? error.status : 500).send({
    code: isAppError(error) ? error.code : 'unexpected_test_failure',
  });
};

describe('generic event-stream catalog host', () => {
  it('authenticates, authorizes, emits exact SSE frames, and cleans up shutdown', async () => {
    const events: string[] = [];
    const metrics = makeMetrics();
    const stream = makeSession({});
    const application = express();
    mountEventStreamCatalog({
      router: application,
      catalog: makeCatalog(
        async () => ({
          kind: 'success',
          value: stream.session,
        }),
        events,
      ),
      dependencies: makeDependencies(metrics, events),
    });
    application.use(errorBoundary);

    const response = await fetch(
      `${await listen(application)}/examples/east/events`,
    );
    expect(response.status).toBe(200);
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
    expect(ready).toContain('retry: 3000\n\nid: 8\nevent: ready');
    expect(ready).toContain('data: {"revision":8}\n\n');

    stream.next({ kind: 'change', revision: 9 });
    stream.next({ kind: 'resync' });
    const changes = await readUntil(reader, (value) =>
      value.includes('event: resync'),
    );
    expect(changes).toContain('id: 9\nevent: change');
    expect(changes).toContain('event: resync\ndata: {"reason":"reconnect"}');

    stream.complete();
    await expect(reader.read()).resolves.toMatchObject({ done: true });
    await tick();
    expect(events).toEqual([
      'context',
      'authenticate',
      'decode-scope',
      'authorize:example:read:east',
      'read-context',
      'serialize',
      'open',
    ]);
    expect(stream.detach).toHaveBeenCalledOnce();
    expect(stream.close).toHaveBeenCalledOnce();
    expect(metrics.connection).toHaveBeenNthCalledWith(1, 'opened');
    expect(metrics.connection).toHaveBeenNthCalledWith(2, 'closed');
    expect(metrics.activeConnections.mock.calls).toEqual([[1], [0]]);
    expect(metrics.event.mock.calls).toEqual([
      ['ready'],
      ['change'],
      ['resync'],
    ]);
    expect(metrics.failure).not.toHaveBeenCalled();
  });

  it('does not decode, authorize, or open an unauthenticated stream', async () => {
    const events: string[] = [];
    const metrics = makeMetrics();
    const open = vi.fn();
    const application = express();
    mountEventStreamCatalog({
      router: application,
      catalog: makeCatalog(open, events),
      dependencies: makeDependencies(metrics, events, {
        authentication: () => (_request, response) => {
          events.push('denied');
          response.sendStatus(401);
        },
      }),
    });

    const response = await fetch(
      `${await listen(application)}/examples/east/events`,
    );
    expect(response.status).toBe(401);
    expect(events).toEqual(['context', 'denied']);
    expect(open).not.toHaveBeenCalled();
  });

  it('validates params only after authentication and before authorization', async () => {
    const events: string[] = [];
    const metrics = makeMetrics();
    const open = vi.fn();
    const application = express();
    mountEventStreamCatalog({
      router: application,
      catalog: makeCatalog(open, events),
      dependencies: makeDependencies(metrics, events),
    });
    application.use(errorBoundary);

    const response = await fetch(
      `${await listen(application)}/examples/invalid/events`,
    );
    expect(response.status).toBe(400);
    expect(events).toEqual(['context', 'authenticate', 'decode-scope']);
    expect(open).not.toHaveBeenCalled();
  });

  it('does not open when authorization deliberately ends the response', async () => {
    const events: string[] = [];
    const metrics = makeMetrics();
    const open = vi.fn();
    const application = express();
    mountEventStreamCatalog({
      router: application,
      catalog: makeCatalog(open, events),
      dependencies: makeDependencies(metrics, events, {
        authorize: ({ response }) => {
          events.push('authorize-ended');
          response.sendStatus(403);
        },
      }),
    });

    const response = await fetch(
      `${await listen(application)}/examples/east/events`,
    );
    expect(response.status).toBe(403);
    expect(events).toEqual([
      'context',
      'authenticate',
      'decode-scope',
      'authorize-ended',
    ]);
    expect(open).not.toHaveBeenCalled();
    expect(metrics.connection).not.toHaveBeenCalled();
  });

  it('writes heartbeats and closes at the earlier session deadline', async () => {
    const metrics = makeMetrics();
    const stream = makeSession({});
    const application = express();
    mountEventStreamCatalog({
      router: application,
      catalog: makeCatalog(async () => ({
        kind: 'success',
        value: stream.session,
      })),
      dependencies: makeDependencies(metrics, [], {
        heartbeatIntervalMs: 5,
        reauthorizeIntervalMs: 1_000,
        now: () => 1_000,
        sessionExpiresAt: () => 1_025,
      }),
    });

    const response = await fetch(
      `${await listen(application)}/examples/east/events`,
    );
    const reader = response.body!.getReader();
    const body = await readUntil(reader, (value) =>
      value.includes(': heartbeat\n\n'),
    );
    expect(body).toContain(': heartbeat\n\n');
    await readUntil(reader, () => false);
    await expect(reader.read()).resolves.toMatchObject({ done: true });
    await tick();
    expect(stream.close).toHaveBeenCalledOnce();
    expect(metrics.activeConnections).toHaveBeenLastCalledWith(0);
  });

  it('stages synchronous race-closing events behind ready', async () => {
    const metrics = makeMetrics();
    const detach = vi.fn();
    const close = vi.fn();
    const session: SubscriptionSession<TestReady, TestEvent> = {
      ready: { revision: 8 },
      subscribe: (observer) => {
        observer.next({ kind: 'change', revision: 9 });
        return detach;
      },
      close,
    };
    const application = express();
    mountEventStreamCatalog({
      router: application,
      catalog: makeCatalog(async () => ({ kind: 'success', value: session })),
      dependencies: makeDependencies(metrics),
    });

    const controller = new AbortController();
    const response = await fetch(
      `${await listen(application)}/examples/east/events`,
      { signal: controller.signal },
    );
    const reader = response.body!.getReader();
    const body = await readUntil(reader, (value) =>
      value.includes('event: change'),
    );
    expect(body.indexOf('event: ready')).toBeLessThan(
      body.indexOf('event: change'),
    );

    controller.abort();
    await tick();
    await tick();
    expect(detach).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('emits no SSE headers or ready frame when the source closed during open', async () => {
    const metrics = makeMetrics();
    const detach = vi.fn();
    const close = vi.fn();
    const session: SubscriptionSession<TestReady, TestEvent> = {
      ready: { revision: 8 },
      subscribe: (observer) => {
        observer.close();
        return detach;
      },
      close,
    };
    const application = express();
    mountEventStreamCatalog({
      router: application,
      catalog: makeCatalog(async () => ({ kind: 'success', value: session })),
      dependencies: makeDependencies(metrics),
    });

    const response = await fetch(
      `${await listen(application)}/examples/east/events`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBeNull();
    await expect(response.text()).resolves.toBe('');
    expect(metrics.connection).not.toHaveBeenCalled();
    expect(metrics.event).not.toHaveBeenCalled();
    expect(detach).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes and unsubscribes on request abort and source error', async () => {
    const abortMetrics = makeMetrics();
    const abortStream = makeSession({});
    const abortApplication = express();
    mountEventStreamCatalog({
      router: abortApplication,
      catalog: makeCatalog(async () => ({
        kind: 'success',
        value: abortStream.session,
      })),
      dependencies: makeDependencies(abortMetrics),
    });
    const controller = new AbortController();
    const response = await fetch(
      `${await listen(abortApplication)}/examples/east/events`,
      { signal: controller.signal },
    );
    await readUntil(response.body!.getReader(), (value) =>
      value.includes('event: ready'),
    );
    controller.abort();
    await tick();
    await tick();
    expect(abortStream.close).toHaveBeenCalledOnce();
    expect(abortMetrics.activeConnections).toHaveBeenLastCalledWith(0);

    const errorMetrics = makeMetrics();
    const errorStream = makeSession({});
    const errorApplication = express();
    mountEventStreamCatalog({
      router: errorApplication,
      catalog: makeCatalog(async () => ({
        kind: 'success',
        value: errorStream.session,
      })),
      dependencies: makeDependencies(errorMetrics),
    });
    const errorResponse = await fetch(
      `${await listen(errorApplication)}/examples/east/events`,
    );
    const errorReader = errorResponse.body!.getReader();
    await readUntil(errorReader, (value) => value.includes('event: ready'));
    errorStream.fail();
    await expect(errorReader.read()).resolves.toMatchObject({ done: true });
    expect(errorMetrics.failure).toHaveBeenCalledWith('source_error');
    expect(errorStream.close).toHaveBeenCalledOnce();
  });

  it('cleans up an unexpected open failure and an invalid event frame', async () => {
    const openMetrics = makeMetrics();
    const application = express();
    mountEventStreamCatalog({
      router: application,
      catalog: makeCatalog(async () => {
        throw unexpectedError({
          code: 'event_stream_test_open_failed',
          message: 'Open failure test fixture.',
        });
      }),
      dependencies: makeDependencies(openMetrics),
    });
    application.use(errorBoundary);
    const response = await fetch(
      `${await listen(application)}/examples/east/events`,
    );
    expect(response.status).toBe(500);
    expect(openMetrics.connection).not.toHaveBeenCalled();

    const missingMetrics = makeMetrics();
    const missingApplication = express();
    mountEventStreamCatalog({
      router: missingApplication,
      catalog: makeCatalog(async () => ({
        kind: 'failure',
        failure: { kind: 'missing' },
      })),
      dependencies: makeDependencies(missingMetrics),
    });
    const missingResponse = await fetch(
      `${await listen(missingApplication)}/examples/east/events`,
    );
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ code: 'missing' });
    expect(missingMetrics.connection).not.toHaveBeenCalled();

    const frameMetrics = makeMetrics();
    const frameStream = makeSession({});
    const frameApplication = express();
    mountEventStreamCatalog({
      router: frameApplication,
      catalog: makeCatalog(
        async () => ({ kind: 'success', value: frameStream.session }),
        [],
        {
          presentEvent: () => ({ event: 'unbounded', data: {} }),
        },
      ),
      dependencies: makeDependencies(frameMetrics),
    });
    const frameResponse = await fetch(
      `${await listen(frameApplication)}/examples/east/events`,
    );
    const frameReader = frameResponse.body!.getReader();
    await readUntil(frameReader, (value) => value.includes('event: ready'));
    frameStream.next({ kind: 'change', revision: 9 });
    await expect(frameReader.read()).resolves.toMatchObject({ done: true });
    expect(frameMetrics.failure).toHaveBeenCalledWith('invalid_frame');
    expect(frameStream.close).toHaveBeenCalledOnce();
  });

  it('preserves the deployed write(false) behavior and still cleans up', async () => {
    const metrics = makeMetrics();
    const stream = makeSession({});
    const application = express();
    mountEventStreamCatalog({
      router: application,
      catalog: makeCatalog(async () => ({
        kind: 'success',
        value: stream.session,
      })),
      dependencies: makeDependencies(metrics, [], {
        requestContext: () => (_request, response, next) => {
          const originalWrite = response.write.bind(response);
          response.write = ((chunk: unknown) => {
            originalWrite(chunk as string);
            return false;
          }) as typeof response.write;
          next();
        },
      }),
    });

    const response = await fetch(
      `${await listen(application)}/examples/east/events`,
    );
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const ready = await readUntil(reader, (value) =>
      value.includes('event: ready'),
    );
    expect(ready).toContain('event: ready');
    expect(stream.close).not.toHaveBeenCalled();
    stream.complete();
    await expect(reader.read()).resolves.toMatchObject({ done: true });
    await tick();
    expect(metrics.failure).not.toHaveBeenCalled();
    expect(stream.close).toHaveBeenCalledOnce();
    expect(metrics.activeConnections).toHaveBeenLastCalledWith(0);
  });
});
