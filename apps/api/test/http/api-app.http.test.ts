import { createHmac } from 'node:crypto';
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
import { makeApiApp } from '../../src/bootstrap/api.composition.ts';
import type { ApiRuntime } from '../../src/runtime/api-runtime.ts';
import {
  documentedCentsCustomerWebhook,
  documentedCentsMarketingWebhook,
  documentedCentsOrderWebhook,
  unsupportedCentsWebhook,
} from '../cents/cents-webhook.fixtures.ts';

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

const centsClock = new Date('2026-07-12T16:00:00.000Z');
const centsHmacKey = 'test-cents-hmac-key-with-at-least-32-bytes';

const signCentsBody = (
  rawBody: string,
  timestamp: string,
  key = centsHmacKey,
): string =>
  `v1=${createHmac('sha256', key)
    .update(timestamp, 'utf8')
    .update('.', 'utf8')
    .update(Buffer.from(rawBody))
    .digest('hex')}`;

const centsHeaders = (input: {
  rawBody: string;
  timestamp?: string;
  key?: string;
  signedBody?: string;
}) => {
  const timestamp =
    input.timestamp ?? String(Math.floor(centsClock.getTime() / 1_000));
  return {
    'Content-Type': 'application/json',
    'X-Cents-Timestamp': timestamp,
    'X-Cents-Signature': signCentsBody(
      input.signedBody ?? input.rawBody,
      timestamp,
      input.key,
    ),
  };
};

const makeCentsReceiptDatabase = (input: { fail?: boolean } = {}) => {
  const receipts: Record<string, unknown>[] = [];
  const returning = vi.fn(async () => {
    if (input.fail) throw new Error('receipt database unavailable');
    return [{ id: '00000000-0000-4000-8000-000000000901' }];
  });
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn((receipt: Record<string, unknown>) => {
    receipts.push(receipt);
    return { onConflictDoNothing };
  });
  const insert = vi.fn(() => ({ values }));
  const execute = vi.fn(async () => [{ ok: 1 }]);

  return {
    db: { execute, insert } as unknown as ApiRuntime['database']['db'],
    execute,
    insert,
    receipts,
  };
};

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
    db?: ApiRuntime['database']['db'];
    centsWebhookAuthMode?: 'hmac' | 'unsigned';
    centsWebhookCurrentKey?: Secret;
    centsWebhookPreviousKey?: Secret;
    centsWebhookQuarantineKey?: Secret;
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
        controlMutation: { limit: 1_000, windowMs: 60_000 },
        invitationAccept: { limit: 1_000, windowMs: 60_000 },
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
      processor: {
        origin: 'http://localhost:4173',
        csrfSecret: secretValue(
          'test-processor-csrf-key-with-at-least-32-bytes',
        ),
      },
      control: {
        origin: 'http://localhost:4174',
        csrfSecret: secretValue('test-control-csrf-key-with-at-least-32-bytes'),
      },
      centsWebhook: {
        authMode: input.centsWebhookAuthMode ?? 'hmac',
        hmac: {
          currentKey: input.centsWebhookCurrentKey,
          previousKey: input.centsWebhookPreviousKey,
          clockWindowSeconds: 300,
        },
        quarantine: {
          encryptionKey: input.centsWebhookQuarantineKey,
          retentionMs: 30 * 24 * 60 * 60 * 1_000,
        },
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
      db: input.db ?? ({ execute } as unknown as ApiRuntime['database']['db']),
      check: async () => undefined,
      listen: async () => async () => undefined,
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
    expect(
      harness.counters.filter(({ name }) => name !== 'api.http_requests'),
    ).toEqual([]);
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
    expect(
      harness.counters.filter(({ name }) => name !== 'api.http_requests'),
    ).toEqual([]);
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
    expect(
      harness.counters.filter(({ name }) => name !== 'api.http_requests'),
    ).toEqual([]);
    expect(harness.logs.filter((entry) => entry.level === 'error')).toEqual([]);
  });

  it('fails closed when live Cents verification is not configured', async () => {
    const harness = makeRuntime();
    const rawBody = JSON.stringify(documentedCentsOrderWebhook);
    const response = await fetch(
      `${await start(makeApiApp(harness.runtime))}/webhooks/cents`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rawBody,
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'cents_webhook_verification_unavailable',
        message: 'Vendor webhook receipt is not configured.',
      },
    });
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it('accepts the documented Cents payload without signature headers only in explicit unsigned mode', async () => {
    const database = makeCentsReceiptDatabase();
    const harness = makeRuntime({
      db: database.db,
      centsWebhookAuthMode: 'unsigned',
    });
    const response = await fetch(
      `${await start(makeApiApp(harness.runtime))}/webhooks/cents`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(documentedCentsOrderWebhook),
      },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { duplicate: false, status: 'pending' },
    });
    expect(database.insert).toHaveBeenCalledOnce();
    expect(database.receipts[0]).toMatchObject({
      source: 'cents',
      eventType: 'order_updated',
      subjectId: '12345',
      sourceLocationId: '24',
    });
    expect(harness.logs).toContainEqual({
      level: 'warn',
      message: 'Cents webhook authentication is disabled by configuration.',
      fields: { route: '/webhooks/cents', authMode: 'unsigned' },
    });
  });

  it('classifies verifier failures as unavailable without exposing their cause', async () => {
    const harness = makeRuntime();
    const rawBody = JSON.stringify(documentedCentsOrderWebhook);
    const response = await fetch(
      `${await start(
        makeApiApp(harness.runtime, {
          centsWebhookVerifier: async () => {
            throw new Error('vendor verifier secret endpoint unavailable');
          },
        }),
      )}/webhooks/cents`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rawBody,
      },
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: 'cents_webhook_verification_unavailable',
        message: 'Vendor webhook receipt is not configured.',
      },
    });
    expect(JSON.stringify(body)).not.toContain('secret endpoint');
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it('protects LPMS operator routes before production persistence', async () => {
    const harness = makeRuntime();
    const response = await fetch(
      `${await start(makeApiApp(harness.runtime))}/production/locations/location-1/shifts`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startsAt: '2026-07-10T14:00:00.000Z',
          endsAt: '2026-07-10T20:00:00.000Z',
          timezone: 'America/New_York',
          effectiveFolderCount: 2,
          idempotencyKey: 'create-shift-command-1',
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
  });

  it('authenticates and normalizes a documented Cents order before durable ingestion', async () => {
    const database = makeCentsReceiptDatabase();
    const harness = makeRuntime({
      db: database.db,
      centsWebhookCurrentKey: secretValue(centsHmacKey),
    });
    const rawBody = JSON.stringify(documentedCentsOrderWebhook);
    const response = await fetch(
      `${await start(
        makeApiApp(harness.runtime, { clock: { now: () => centsClock } }),
      )}/webhooks/cents`,
      {
        method: 'POST',
        headers: centsHeaders({ rawBody }),
        body: rawBody,
      },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        eventId: '00000000-0000-4000-8000-000000000901',
        duplicate: false,
        status: 'pending',
      },
    });
    expect(database.insert).toHaveBeenCalledOnce();
    expect(database.receipts).toHaveLength(1);
    expect(database.receipts[0]).toMatchObject({
      source: 'cents',
      subjectType: 'order',
      eventType: 'order_updated',
      subjectId: '12345',
      sourceLocationId: '24',
      payload: {
        externalOrderId: '12345',
        orderCode: '00123',
        externalStoreId: '24',
        status: 'SUBMITTED',
        dueAt: '2026-07-12T21:00:00.000Z',
        sourceUpdatedAt: '2026-07-12T15:59:00.000Z',
        bagCount: null,
        totalAmountCents: 2999,
        balanceDueCents: 2499,
        services: [
          {
            externalServiceId: '43',
            totalPriceCents: 2999,
            unitPriceCents: 200,
          },
        ],
        customer: {
          externalUserId: '815',
          firstName: 'Private Fixture',
          phone: '+15550000001',
        },
      },
      status: 'pending',
    });
    const observable = JSON.stringify(harness.logs);
    expect(observable).not.toContain('private@example.invalid');
    expect(observable).not.toContain('+15550000001');
    expect(observable).not.toContain('Private Fixture');
  });

  it.each([
    {
      name: 'wrong key',
      headers: (rawBody: string) =>
        centsHeaders({
          rawBody,
          key: 'wrong-cents-hmac-key-with-at-least-32-bytes',
        }),
    },
    {
      name: 'missing signature',
      headers: (rawBody: string) => {
        const { 'X-Cents-Signature': _signature, ...headers } = centsHeaders({
          rawBody,
        });
        return headers;
      },
    },
    {
      name: 'stale timestamp',
      headers: (rawBody: string) =>
        centsHeaders({
          rawBody,
          timestamp: String(Math.floor(centsClock.getTime() / 1_000) - 301),
        }),
    },
    {
      name: 'future timestamp',
      headers: (rawBody: string) =>
        centsHeaders({
          rawBody,
          timestamp: String(Math.floor(centsClock.getTime() / 1_000) + 301),
        }),
    },
    {
      name: 'mutated body',
      headers: (rawBody: string) =>
        centsHeaders({
          rawBody,
          signedBody: JSON.stringify(documentedCentsOrderWebhook),
        }),
    },
  ])('rejects $name before any durable write', async ({ name, headers }) => {
    const database = makeCentsReceiptDatabase();
    const harness = makeRuntime({
      db: database.db,
      centsWebhookCurrentKey: secretValue(centsHmacKey),
    });
    const rawBody =
      name === 'mutated body'
        ? `${JSON.stringify(documentedCentsOrderWebhook)} `
        : JSON.stringify(documentedCentsOrderWebhook);
    const response = await fetch(
      `${await start(
        makeApiApp(harness.runtime, { clock: { now: () => centsClock } }),
      )}/webhooks/cents`,
      {
        method: 'POST',
        headers: headers(rawBody),
        body: rawBody,
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_cents_webhook_authentication' },
    });
    expect(database.insert).not.toHaveBeenCalled();
    expect(database.receipts).toEqual([]);
    expect(harness.securityEvents).toContainEqual(
      expect.objectContaining({
        name: 'vendor.webhook_authentication_failed',
        outcome: 'denied',
        resourceType: 'http.route',
        resourceId: '/webhooks/cents',
        reason: 'invalid_cents_webhook_authentication',
      }),
    );
  });

  it('rejects authenticated malformed JSON before normalization or persistence and redacts PII', async () => {
    const database = makeCentsReceiptDatabase();
    const harness = makeRuntime({
      db: database.db,
      centsWebhookCurrentKey: secretValue(centsHmacKey),
    });
    const rawBody = '{"customer":{"email":"private@example.invalid"}';
    const response = await fetch(
      `${await start(
        makeApiApp(harness.runtime, { clock: { now: () => centsClock } }),
      )}/webhooks/cents`,
      {
        method: 'POST',
        headers: centsHeaders({ rawBody }),
        body: rawBody,
      },
    );
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody).toMatchObject({
      ok: false,
      error: { code: 'invalid_cents_webhook_body' },
    });
    expect(database.insert).not.toHaveBeenCalled();
    expect(JSON.stringify(responseBody)).not.toContain(
      'private@example.invalid',
    );
    expect(JSON.stringify(harness.logs)).not.toContain(
      'private@example.invalid',
    );
    expect(JSON.stringify(harness.capturedErrors)).not.toContain(
      'private@example.invalid',
    );
  });

  it('rejects an authenticated malformed documented order without writing it', async () => {
    const database = makeCentsReceiptDatabase();
    const harness = makeRuntime({
      db: database.db,
      centsWebhookCurrentKey: secretValue(centsHmacKey),
    });
    const rawBody = JSON.stringify({
      action: 'order_updated',
      order: { status: 'SUBMITTED' },
      customer: { email: 'private@example.invalid' },
    });
    const response = await fetch(
      `${await start(
        makeApiApp(harness.runtime, { clock: { now: () => centsClock } }),
      )}/webhooks/cents`,
      {
        method: 'POST',
        headers: centsHeaders({ rawBody }),
        body: rawBody,
      },
    );
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody).toMatchObject({
      ok: false,
      error: { code: 'invalid_cents_order_payload' },
    });
    expect(database.insert).not.toHaveBeenCalled();
    expect(harness.counters).toContainEqual({
      name: 'api.webhook_rejections',
      labels: {
        source: 'cents',
        reason: 'invalid_cents_order_payload',
        status: '400',
      },
    });
    expect(JSON.stringify(responseBody)).not.toContain(
      'private@example.invalid',
    );
  });

  it.each([
    {
      name: 'documented customer event',
      payload: documentedCentsCustomerWebhook,
      classification: 'unknown',
      eventKind: 'customer_updated',
      processingStatus: 'ignored',
      subjectId: null,
    },
    {
      name: 'documented marketing event',
      payload: documentedCentsMarketingWebhook,
      classification: 'unknown',
      eventKind: 'customer_marketing_optin',
      processingStatus: 'ignored',
      subjectId: null,
    },
    {
      name: 'malformed ignored order',
      payload: {
        action: 'order_updated',
        order: {
          id: 'malformed-order',
          status: 'IN_PROGRESS',
          updatedAt: '2026-07-12T16:00:00.000Z',
        },
        customer: { email: 'private@example.invalid' },
        services: [{ malformed: true }],
      },
      classification: 'unknown',
      eventKind: 'order_updated',
      processingStatus: 'ignored',
      subjectId: null,
    },
    {
      name: 'unsupported future event',
      payload: unsupportedCentsWebhook,
      classification: 'unknown',
      eventKind: 'order_rescheduled_v2',
      processingStatus: 'ignored',
      subjectId: null,
    },
  ])(
    'stores an ignored receipt without processable payload for an authenticated $name',
    async ({
      payload,
      classification,
      eventKind,
      processingStatus,
      subjectId,
    }) => {
      const database = makeCentsReceiptDatabase();
      const harness = makeRuntime({
        db: database.db,
        centsWebhookCurrentKey: secretValue(centsHmacKey),
      });
      const rawBody = JSON.stringify(payload);
      const response = await fetch(
        `${await start(
          makeApiApp(harness.runtime, { clock: { now: () => centsClock } }),
        )}/webhooks/cents`,
        {
          method: 'POST',
          headers: centsHeaders({ rawBody }),
          body: rawBody,
        },
      );
      const responseBody = await response.json();

      expect(response.status).toBe(202);
      expect(responseBody).toMatchObject({
        ok: true,
        data: { status: processingStatus, duplicate: false },
      });
      expect(database.receipts).toHaveLength(1);
      expect(database.receipts[0]).toMatchObject({
        source: 'cents',
        subjectType: classification,
        eventType: eventKind,
        subjectId,
        sourceLocationId: null,
        status: processingStatus === 'ignored' ? 'processed' : 'pending',
      });
      expect(database.receipts[0]).toMatchObject({
        payload: null,
        payloadHash: null,
      });
      const observable = JSON.stringify({
        response: responseBody,
        logs: harness.logs,
      });
      expect(observable).not.toContain('private@example.invalid');
      expect(observable).not.toContain('+15550000001');
      expect(observable).not.toContain('must-not-survive');
      expect(observable).not.toContain('customerMetrics');
    },
  );

  it('returns unavailable without leaking the authenticated body when durable ingestion fails', async () => {
    const database = makeCentsReceiptDatabase({ fail: true });
    const harness = makeRuntime({
      db: database.db,
      centsWebhookCurrentKey: secretValue(centsHmacKey),
    });
    const rawBody = JSON.stringify(documentedCentsOrderWebhook);
    const response = await fetch(
      `${await start(
        makeApiApp(harness.runtime, { clock: { now: () => centsClock } }),
      )}/webhooks/cents`,
      {
        method: 'POST',
        headers: centsHeaders({ rawBody }),
        body: rawBody,
      },
    );
    const responseBody = await response.json();

    expect(response.status).toBe(503);
    expect(responseBody).toMatchObject({
      ok: false,
      error: { code: 'webhook_event_ingestion_failed' },
    });
    expect(JSON.stringify(responseBody)).not.toContain(
      'private@example.invalid',
    );
    expect(JSON.stringify(responseBody)).not.toContain('database unavailable');
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
