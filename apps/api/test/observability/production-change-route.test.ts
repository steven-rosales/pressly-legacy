import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type RequestHandler } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ProductionChange,
  ProductionChangeFeed,
} from '../../src/common/live/production-change-feed.ts';
import { makeProductionChangeRoutes } from '../../src/routes/production-change.routes.ts';

const servers: Server[] = [];

const start = async (app: express.Express): Promise<string> => {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
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

describe('production change SSE route', () => {
  it('authenticates, closes the initial race, and emits only bounded labels', async () => {
    const current = deferred<number | null>();
    const subscribed = deferred<void>();
    const unsubscribed = deferred<void>();
    let listener: ((change: ProductionChange) => void) | undefined;
    const feed: ProductionChangeFeed = {
      start: async () => undefined,
      currentRevision: () => current.promise,
      subscribe: (_locationId, nextListener) => {
        listener = nextListener;
        subscribed.resolve();
        return () => unsubscribed.resolve();
      },
      close: async () => undefined,
    };
    const authenticate = vi.fn<RequestHandler>((_request, response, next) => {
      response.locals['auth'] = {
        principal: { sessionExpiresAt: new Date(Date.now() + 60_000) },
      };
      next();
    });
    const authorize = vi.fn<RequestHandler>((_request, _response, next) =>
      next(),
    );
    const increment = vi.fn();
    const observe = vi.fn();
    const app = express();
    app.use(
      makeProductionChangeRoutes({
        feed,
        authenticate,
        authorize,
        counters: { increment },
        measurements: { observe },
        heartbeatIntervalMs: 60_000,
        reauthorizeIntervalMs: 60_000,
      }),
    );

    const responsePromise = fetch(
      `${await start(app)}/production/locations/east/events`,
    );
    await subscribed.promise;
    listener?.({ kind: 'revision', revision: 7 });
    listener?.({ kind: 'revision', revision: 9 });
    listener?.({ kind: 'revision', revision: 8 });
    current.resolve(8);

    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    const reader = response.body!.getReader();
    const body = await readUntil(reader, (value) =>
      value.includes('event: change'),
    );
    expect(body).toContain('event: ready\ndata: {"revision":8}');
    expect(body).toContain('event: change\ndata: {"revision":9}');
    expect(body.match(/event: change/g)).toHaveLength(1);
    expect(authenticate).toHaveBeenCalledOnce();
    expect(authorize).toHaveBeenCalledOnce();
    expect(increment).toHaveBeenCalledWith('api.sse_connections', {
      outcome: 'opened',
    });
    expect(
      increment.mock.calls.every(([, labels]) =>
        Object.values(labels ?? {}).every((value) => value !== 'east'),
      ),
    ).toBe(true);

    listener?.({ kind: 'shutdown' });
    await expect(reader.read()).resolves.toMatchObject({ done: true });
    await unsubscribed.promise;
    expect(observe).toHaveBeenLastCalledWith('api.sse_active_connections', 0);
  });

  it('does not subscribe an unauthenticated request', async () => {
    const feed: ProductionChangeFeed = {
      start: async () => undefined,
      currentRevision: vi.fn(async () => 0),
      subscribe: vi.fn(() => () => undefined),
      close: async () => undefined,
    };
    const app = express();
    app.use(
      makeProductionChangeRoutes({
        feed,
        authenticate: (_request, response) => response.sendStatus(401),
        authorize: (_request, _response, next) => next(),
        counters: { increment: vi.fn() },
        measurements: { observe: vi.fn() },
      }),
    );

    const response = await fetch(
      `${await start(app)}/production/locations/east/events`,
    );
    expect(response.status).toBe(401);
    expect(feed.subscribe).not.toHaveBeenCalled();
    expect(feed.currentRevision).not.toHaveBeenCalled();
  });

  it('unsubscribes when the initial revision lookup fails', async () => {
    const unsubscribe = vi.fn();
    const feed: ProductionChangeFeed = {
      start: async () => undefined,
      currentRevision: async () => {
        throw new Error('database unavailable');
      },
      subscribe: () => unsubscribe,
      close: async () => undefined,
    };
    const app = express();
    app.use(
      makeProductionChangeRoutes({
        feed,
        authenticate: (_request, _response, next) => next(),
        authorize: (_request, _response, next) => next(),
        counters: { increment: vi.fn() },
        measurements: { observe: vi.fn() },
      }),
    );
    app.use(((_error, _request, response, _next) => {
      response.sendStatus(500);
    }) as express.ErrorRequestHandler);

    const response = await fetch(
      `${await start(app)}/production/locations/east/events`,
    );
    expect(response.status).toBe(500);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
