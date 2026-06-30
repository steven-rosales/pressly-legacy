import { createServer, type Server } from 'node:http';
import express, { type Express } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { requireJsonContentType } from '@pressly/http/express';
import { makeErrorHandler } from '../../src/common/http/error-handler.ts';
import { makeRequestContext } from '../../src/common/http/request-context.ts';

const logEntries: Array<Readonly<Record<string, unknown>> | undefined> = [];
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
  app.use(makeRequestContext(logger));
  app.post(
    '/',
    requireJsonContentType(),
    express.json({ limit: '16b' }),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  app.use(
    makeErrorHandler({
      logger,
      securityEvents: { emit: () => undefined },
    } as never),
  );
  return app;
};

const makeHealthApp = (status: number): Express => {
  const app = express();
  app.use(makeRequestContext(logger));
  app.get('/health/ready', (_req, res) => {
    res.status(status).json({ ok: status < 400 });
  });
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
    expect(logEntries.some((entry) => entry?.['requestId'] === requestId)).toBe(
      true,
    );
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
  });

  it('does not log successful health checks', async () => {
    const response = await fetch(
      `${await start(makeHealthApp(200))}/health/ready`,
    );

    expect(response.status).toBe(200);
    expect(logEntries).toEqual([]);
  });

  it('logs failed health checks with their original route', async () => {
    const response = await fetch(
      `${await start(makeHealthApp(503))}/health/ready`,
    );

    expect(response.status).toBe(503);
    expect(logEntries).toEqual([
      expect.objectContaining({ route: '/health/ready', status: 503 }),
    ]);
  });
});
