import { createServer, type Server } from 'node:http';
import express, { type Express } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { makeAppError } from '@pressly/errors';
import { requireJsonContentType } from '@pressly/http/express';
import { makeErrorHandler } from '../../src/http/middleware/error.middleware.ts';
import { makeRequestContext } from '../../src/http/middleware/request-context.middleware.ts';
import { makeWebhookIngestionRoutes } from '../../src/http/webhook-ingestion/dead-letters/dead-letter.route.ts';

const logEntries: Array<Readonly<Record<string, unknown>> | undefined> = [];
const capturedErrors: unknown[] = [];
const counterEntries: unknown[] = [];
const securityEntries: unknown[] = [];
const logger = {
  child: () => logger,
  debug: () => undefined,
  info: (_message: string, fields?: Readonly<Record<string, unknown>>) =>
    logEntries.push(fields),
  warn: () => undefined,
  error: (_message: string, fields?: Readonly<Record<string, unknown>>) =>
    logEntries.push(fields),
  fatal: () => undefined,
};

const servers: Server[] = [];

const start = async (app: Express): Promise<string> => {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('Expected a TCP test server.');
  return `http://127.0.0.1:${address.port}`;
};

afterEach(async () => {
  logEntries.length = 0;
  capturedErrors.length = 0;
  counterEntries.length = 0;
  securityEntries.length = 0;
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

const makeBoundaryApp = (): Express => {
  const app = express();
  app.use(makeRequestContext());
  app.post(
    '/',
    requireJsonContentType(),
    express.json({ limit: '16b' }),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  app.get('/boom', (_req, _res, next) => {
    next(
      makeAppError({
        kind: 'DatabaseError',
        code: 'database_unavailable',
        message: 'Database unavailable.',
        safeMessage: 'The service is unavailable.',
        status: 503,
        details: {
          databaseUrl: 'postgres://user:password@postgres:5432/pressly',
        },
      }),
    );
  });
  app.use(
    makeErrorHandler({
      logger,
      securityEvents: { emit: (event: unknown) => securityEntries.push(event) },
      observability: {
        errors: {
          capture: (error: unknown, context: unknown) =>
            capturedErrors.push({ error, context }),
          shutdown: async () => undefined,
        },
        counters: {
          increment: (
            name: string,
            labels?: Readonly<Record<string, string>>,
          ) => counterEntries.push({ name, labels }),
        },
      },
    } as never),
  );
  return app;
};

const makeHealthApp = (status: number): Express => {
  const app = express();
  app.use(makeRequestContext());
  app.get('/health/ready', (_req, res) => {
    res.status(status).json({ ok: status < 400 });
  });
  return app;
};

const makeThrowingObservationApp = (): Express => {
  const app = express();
  const fail = () => {
    throw new Error('observation sink unavailable');
  };

  app.use(makeRequestContext());
  app.get('/server', (_req, _res, next) =>
    next(
      makeAppError({
        kind: 'DatabaseError',
        code: 'database_unavailable',
        message: 'Database unavailable.',
        safeMessage: 'The service is unavailable.',
        status: 503,
      }),
    ),
  );
  app.get('/validation', (_req, _res, next) =>
    next(
      makeAppError({
        kind: 'ValidationError',
        code: 'invalid_request',
        message: 'Invalid request.',
        safeMessage: 'Invalid request.',
        status: 400,
      }),
    ),
  );
  app.use(
    makeErrorHandler({
      logger: {
        child: () => logger,
        debug: fail,
        info: fail,
        warn: fail,
        error: fail,
        fatal: fail,
      },
      securityEvents: { emit: fail },
      observability: {
        errors: { capture: fail, shutdown: async () => undefined },
        counters: { increment: fail },
      },
    } as never),
  );
  return app;
};

const makeResultFailureApp = (
  error: ReturnType<typeof makeAppError>,
): Express => {
  const app = express();
  const continueRequest: express.RequestHandler = (_request, _response, next) =>
    next();

  app.use(makeRequestContext());
  app.use(
    makeWebhookIngestionRoutes({
      application: {
        listDeadEvents: async () => ({ tag: 'err' as const, error }),
        replayDeadEvent: async () => ({ tag: 'err' as const, error }),
      },
      authenticate: continueRequest,
      authorize: continueRequest,
    }),
  );
  app.use(
    makeErrorHandler({
      logger,
      securityEvents: { emit: (event: unknown) => securityEntries.push(event) },
      observability: {
        errors: {
          capture: (captured: unknown, context: unknown) =>
            capturedErrors.push({ error: captured, context }),
          shutdown: async () => undefined,
        },
        counters: {
          increment: (
            name: string,
            labels?: Readonly<Record<string, string>>,
          ) => counterEntries.push({ name, labels }),
        },
      },
    } as never),
  );
  return app;
};

describe('API request boundary', () => {
  it('generates a request ID and ignores a caller-supplied ID', async () => {
    const response = await fetch(await start(makeBoundaryApp()), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': 'caller-controlled',
      },
      body: '{}',
    });

    const requestId = response.headers.get('x-request-id');
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestId).not.toBe('caller-controlled');
    expect(logEntries).toEqual([]);
  });

  it('rejects a non-JSON content type', async () => {
    const response = await fetch(await start(makeBoundaryApp()), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'unsupported_media_type' },
    });
    expect(capturedErrors).toHaveLength(0);
  });

  it('rejects oversized and malformed JSON with safe errors', async () => {
    const baseUrl = await start(makeBoundaryApp());
    const oversized = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'more-than-sixteen-bytes' }),
    });
    const malformed = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });

    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'request_body_too_large' },
    });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'malformed_json' },
    });
    expect(capturedErrors).toHaveLength(0);
    expect(counterEntries).toHaveLength(0);
  });

  it('reports server errors while returning bounded response details', async () => {
    const response = await fetch(`${await start(makeBoundaryApp())}/boom`);
    const requestId = response.headers.get('x-request-id');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'database_unavailable',
        traceId: requestId,
      },
    });

    expect(capturedErrors).toHaveLength(1);
    expect(counterEntries).toContainEqual({
      name: 'api.server_errors',
      labels: expect.objectContaining({
        reason: 'server_error',
        status: '503',
        route: '/boom',
      }),
    });
    expect(logEntries).toContainEqual(
      expect.objectContaining({
        kind: 'DatabaseError',
        code: 'database_unavailable',
        reason: 'server_error',
        route: '/boom',
      }),
    );
  });

  it('routes Result failures through the error boundary exactly once', async () => {
    const error = makeAppError({
      kind: 'DatabaseError',
      code: 'dead_letter_store_unavailable',
      message: 'Dead-letter store failed at postgres://private.internal.',
      safeMessage: 'Dead-letter events are temporarily unavailable.',
      status: 503,
      details: {
        databaseUrl: 'postgres://user:password@private.internal/pressly',
      },
      publicDetails: { retryAfterSeconds: 30 },
    });
    const response = await fetch(
      `${await start(makeResultFailureApp(error))}/webhook-ingestion/dead-letters`,
    );
    const requestId = response.headers.get('x-request-id');
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      error: {
        code: 'dead_letter_store_unavailable',
        message: 'Dead-letter events are temporarily unavailable.',
        traceId: requestId,
        details: { retryAfterSeconds: 30 },
      },
    });
    expect(JSON.stringify(body)).not.toContain('private.internal');
    expect(JSON.stringify(body)).not.toContain('password');
    expect(capturedErrors).toEqual([
      expect.objectContaining({
        error,
        context: expect.objectContaining({
          requestId,
          traceId: requestId,
          route: '/webhook-ingestion/dead-letters',
        }),
      }),
    ]);
    expect(logEntries).toHaveLength(1);
    expect(counterEntries).toEqual([
      {
        name: 'api.server_errors',
        labels: {
          reason: 'server_error',
          status: '503',
          route: '/webhook-ingestion/dead-letters',
        },
      },
    ]);
  });

  it('keeps observation failures from replacing authoritative API failures', async () => {
    const baseUrl = await start(makeThrowingObservationApp());
    const serverFailure = await fetch(`${baseUrl}/server`);
    const validationFailure = await fetch(`${baseUrl}/validation`);

    expect(serverFailure.status).toBe(503);
    await expect(serverFailure.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'database_unavailable' },
    });
    expect(validationFailure.status).toBe(400);
    await expect(validationFailure.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    });
  });

  it('does not log successful health checks', async () => {
    const response = await fetch(
      `${await start(makeHealthApp(200))}/health/ready`,
    );

    expect(response.status).toBe(200);
    expect(logEntries).toEqual([]);
  });

  it('does not duplicate failure logging from the request-finish path', async () => {
    const response = await fetch(
      `${await start(makeHealthApp(503))}/health/ready`,
    );

    expect(response.status).toBe(503);
    expect(logEntries).toEqual([]);
  });
});
