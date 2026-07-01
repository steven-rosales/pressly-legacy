import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Secret } from '@pressly/config';
import type {
  CounterLabels,
  CounterName,
  ErrorReportContext,
} from '@pressly/metrics';
import type {
  Logger,
  LogFields,
  LogLevel,
  SecurityEvent,
} from '@pressly/logging';
import { makeApiApp } from '../../src/app.ts';
import type { ApiRuntime } from '../../src/common/runtime/runtime.ts';

type LogEntry = Readonly<{
  level: LogLevel;
  message: string;
  fields?: LogFields | undefined;
}>;

type CounterEntry = Readonly<{
  name: CounterName;
  labels?: CounterLabels | undefined;
}>;

type CapturedError = Readonly<{
  error: unknown;
  context: ErrorReportContext;
}>;

const servers: Server[] = [];

const start = async (app: ReturnType<typeof makeApiApp>): Promise<string> => {
  const server = createServer(app);
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const address = server.address() as AddressInfo | null;
  if (address === null) throw new Error('Expected a TCP test server.');

  return `http://127.0.0.1:${address.port}`;
};

const secretValue = (value: string): Secret => value as Secret;

const makeLogger = (): {
  logger: Logger;
  entries: LogEntry[];
} => {
  const entries: LogEntry[] = [];
  const write =
    (level: LogLevel) =>
    (message: string, fields?: LogFields): void => {
      entries.push({ level, message, fields });
    };
  const logger: Logger = {
    child: () => logger,
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    fatal: write('fatal'),
  };

  return { logger, entries };
};

const makeRuntime = (
  input: {
    execute?: ReturnType<typeof vi.fn>;
  } = {},
): {
  runtime: ApiRuntime;
  execute: ReturnType<typeof vi.fn>;
  logs: LogEntry[];
  securityEvents: SecurityEvent[];
  counters: CounterEntry[];
  capturedErrors: CapturedError[];
} => {
  const { logger, entries: logs } = makeLogger();
  const execute = input.execute ?? vi.fn(async () => [{ ok: 1 }]);
  const securityEvents: SecurityEvent[] = [];
  const counters: CounterEntry[] = [];
  const capturedErrors: CapturedError[] = [];

  const runtime: ApiRuntime = {
    env: {
      nodeEnv: 'test',
      shutdownGracePeriodMs: 1_000,
      host: '127.0.0.1',
      port: 0,
      databaseUrl: 'postgres://pressly:pressly@localhost:5432/pressly_test',
      databaseMaxConnections: 1,
      corsOrigin: 'http://localhost:3000',
      rateLimits: {
        global: { limit: 1_000, windowMs: 60_000 },
        login: { limit: 1_000, windowMs: 60_000 },
      },
      auth: {
        secret: secretValue('test-auth-secret'),
        sessionTtlMinutes: 720,
        sessionIdleTimeoutMinutes: 60,
        loginWindowMinutes: 15,
        loginMaxFailures: 8,
        freshSessionMaxAgeMinutes: 15,
        mfaChallengeTtlMinutes: 5,
        mfaEncryptionKey: secretValue(Buffer.alloc(32, 1).toString('base64')),
        mfaIssuer: 'Pressly Test',
      },
      features: {
        metricsEnabled: false,
        jobsEnabled: false,
      },
      observability: {
        sentry: {
          enabled: false,
          dsn: undefined,
          release: undefined,
          traceSampleRate: 0,
        },
      },
    },
    logger,
    securityEvents: {
      emit: (event) => securityEvents.push(event),
    },
    observability: {
      errors: {
        capture: (error, context) => capturedErrors.push({ error, context }),
        shutdown: async () => undefined,
      },
      counters: {
        increment: (name, labels) => counters.push({ name, labels }),
      },
    },
    database: {
      db: { execute } as unknown as ApiRuntime['database']['db'],
      check: async () => undefined,
      close: async () => undefined,
    },
  };

  return { runtime, execute, logs, securityEvents, counters, capturedErrors };
};

afterEach(async () => {
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

describe('API app HTTP boundary', () => {
  it('serves liveness without trusting caller request IDs or touching the DB', async () => {
    const harness = makeRuntime();
    const response = await fetch(
      `${await start(makeApiApp(harness.runtime))}/health/live`,
      {
        headers: {
          'X-Request-Id': 'caller-controlled',
        },
      },
    );

    const requestId = response.headers.get('x-request-id');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { status: 'alive' },
    });
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestId).not.toBe('caller-controlled');
    expect(harness.execute).not.toHaveBeenCalled();
    expect(harness.logs).toEqual([]);
    expect(harness.capturedErrors).toEqual([]);
  });

  it('checks readiness through the injected database port', async () => {
    const harness = makeRuntime();
    const response = await fetch(
      `${await start(makeApiApp(harness.runtime))}/health/ready`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { status: 'ready' },
    });
    expect(harness.execute).toHaveBeenCalledTimes(1);
    expect(harness.capturedErrors).toEqual([]);
  });

  it('rejects non-JSON login requests before reaching persistence or Sentry', async () => {
    const harness = makeRuntime();
    const response = await fetch(
      `${await start(makeApiApp(harness.runtime))}/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'email=user@example.com',
      },
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'unsupported_media_type',
        message: 'This endpoint requires a JSON request body.',
      },
    });
    expect(harness.execute).not.toHaveBeenCalled();
    expect(harness.capturedErrors).toEqual([]);
    expect(harness.counters).toEqual([]);
    expect(harness.logs.filter((entry) => entry.level === 'error')).toEqual([]);
    expect(harness.securityEvents).toEqual([
      expect.objectContaining({
        name: 'request.validation_rejected',
        outcome: 'denied',
        resourceType: 'http.route',
        resourceId: '/auth/login',
        reason: 'unsupported_media_type',
      }),
    ]);
  });

  it('returns bounded 404 responses without reporting routine client failures', async () => {
    const harness = makeRuntime();
    const response = await fetch(
      `${await start(makeApiApp(harness.runtime))}/missing?authorization=Bearer%20secret`,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: 'route_not_found',
        message: 'The request route was not found.',
      },
    });
    expect(JSON.stringify(body)).not.toContain('Bearer');
    expect(harness.capturedErrors).toEqual([]);
    expect(harness.counters).toEqual([]);
    expect(harness.securityEvents).toEqual([]);
    expect(harness.logs.filter((entry) => entry.level === 'error')).toEqual([]);
  });

  it('rejects protected pricing writes before persistence when auth is missing', async () => {
    const harness = makeRuntime();
    const response = await fetch(
      `${await start(makeApiApp(harness.runtime))}/pricing/changes/plan`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceSlug: 'wash-fold',
          reason: 'Adjust delivery fee',
          items: [{ code: 'delivery_fee', priceCents: 495 }],
        }),
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'missing_bearer_token',
        message: 'Authentication is required.',
      },
    });
    expect(harness.execute).not.toHaveBeenCalled();
    expect(harness.capturedErrors).toEqual([]);
    expect(harness.counters).toEqual([]);
    expect(harness.logs.filter((entry) => entry.level === 'error')).toEqual([]);
  });

  it('keeps database readiness failures bounded at the HTTP boundary', async () => {
    const harness = makeRuntime({
      execute: vi.fn(async () => {
        throw new Error(
          'connection failed for postgres://user:password@db.internal/pressly',
        );
      }),
    });
    const response = await fetch(
      `${await start(makeApiApp(harness.runtime))}/health/ready`,
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: 'database_not_ready',
        message: 'Service is not ready.',
      },
    });
    expect(JSON.stringify(body)).not.toContain('password');
    expect(
      harness.logs.some((entry) => JSON.stringify(entry).includes('password')),
    ).toBe(false);
  });
});
