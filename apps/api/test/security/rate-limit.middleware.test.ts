import { createServer, type Server } from 'node:http';
import express, { type Express } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import {
  makeIpRateLimiter,
  makeMemoryRateLimitStore,
} from '../../src/common/security/rate-limit.ts';

const logger = {
  child: () => logger,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  fatal: () => undefined,
} as const;
const securityEvents = { emit: () => undefined } as const;

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

describe('API rate limiting', () => {
  it('recovers when the fixed window expires', () => {
    let nowMs = 1_000;
    const store = makeMemoryRateLimitStore({
      clock: { nowMs: () => nowMs },
    });

    expect(store.consume('ip', 2, 10_000).allowed).toBe(true);
    expect(store.consume('ip', 2, 10_000).allowed).toBe(true);
    expect(store.consume('ip', 2, 10_000)).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 10,
    });

    nowMs = 11_000;
    expect(store.consume('ip', 2, 10_000)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
  });

  it('returns 429 with Retry-After after the IP limit is consumed', async () => {
    const app = express();
    const store = makeMemoryRateLimitStore();

    app.use(
      makeIpRateLimiter({
        name: 'test',
        limit: 1,
        windowMs: 10_000,
        store,
        logger,
        securityEvents,
      }),
    );
    app.get('/', (_req, res) => res.json({ ok: true }));
    app.use(
      (
        error: unknown,
        _req: unknown,
        res: express.Response,
        _next: unknown,
      ) => {
        const appError = error as {
          status: number;
          code: string;
          safeMessage: string;
        };
        res.status(appError.status).json({
          ok: false,
          error: { code: appError.code, message: appError.safeMessage },
        });
      },
    );

    const baseUrl = await start(app);
    expect((await fetch(baseUrl)).status).toBe(200);

    const response = await fetch(baseUrl);

    expect(response.status).toBe(429);
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: 'rate_limit_exceeded',
        message: 'Too many requests. Please try again later.',
      },
    });
  });
});

describe('Express proxy trust', () => {
  it('uses the address added by the nearest proxy instead of a spoofed value', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.get('/', (req, res) => res.json({ ip: req.ip }));

    const response = await fetch(await start(app), {
      headers: { 'X-Forwarded-For': '198.51.100.7, 203.0.113.9' },
    });

    await expect(response.json()).resolves.toEqual({ ip: '203.0.113.9' });
  });
});
