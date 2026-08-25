import { createServer, type Server } from 'node:http';
import express, { type Express, type RequestHandler } from 'express';
import type { IngressStateSystem } from '@pressly/ingress-system/testing/assembly';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  makeErrorHandler,
  makeRequestContext,
} from '@pressly/http-host/runtime';
import { makeWebhookIngestionRoutes } from '../support/dead-event-test-routes.ts';

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

type DeadLetterCells = Readonly<{
  listDeadEvents: Pick<
    IngressStateSystem['cells']['listDeadEvents'],
    'execute'
  >;
  replayDeadEvent: Pick<
    IngressStateSystem['cells']['replayDeadEvent'],
    'execute'
  >;
}>;

const makeApp = (input: {
  cells: DeadLetterCells;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Express => {
  const app = express();
  const ignore = () => undefined;
  const logger = {
    child: () => logger,
    debug: ignore,
    info: ignore,
    warn: ignore,
    error: ignore,
    fatal: ignore,
  };
  app.use(makeRequestContext());
  app.use(express.json({ limit: '64kb' }));
  app.use(makeWebhookIngestionRoutes(input));
  app.use(
    makeErrorHandler({
      logger,
      securityEvents: { emit: ignore },
      observability: {
        errors: { capture: ignore, shutdown: async () => undefined },
        counters: { increment: ignore },
      },
    } as never),
  );
  return app;
};

const pass =
  (calls: string[], name: string): RequestHandler =>
  (_request, _response, next) => {
    calls.push(name);
    next();
  };

const eventId = '00000000-0000-4000-8000-000000000101';

describe('webhook ingestion dead-letter routes', () => {
  it('preserves authentication, authorization, private projection, cursor and envelope', async () => {
    const calls: string[] = [];
    const listDeadEvents = vi.fn(async () => {
      calls.push('list');
      return {
        kind: 'success' as const,
        value: {
          items: [
            {
              eventId,
              source: 'cents',
              eventType: 'order_updated',
              subjectType: 'order' as const,
              subjectId: 'external-order-1',
              sourceLocationId: 'store-1',
              sourceOccurredAt: new Date('2026-08-22T14:00:00.000Z'),
              attempts: 8,
              lastErrorCode: 'source_location_unmapped',
              receivedAt: new Date('2026-08-22T14:01:00.000Z'),
            },
          ],
          nextEventId: eventId,
          asOf: new Date('2026-08-22T15:00:00.000Z'),
        },
      };
    });
    const app = makeApp({
      cells: {
        listDeadEvents: { execute: listDeadEvents },
        replayDeadEvent: {
          execute: vi.fn(async () => ({
            kind: 'success' as const,
            value: { eventId, outcome: 'queued' as const },
          })),
        },
      },
      authenticate: pass(calls, 'authenticate'),
      authorize: pass(calls, 'authorize'),
    });

    const response = await fetch(
      `${await start(app)}/webhook-ingestion/dead-letters?source=cents&limit=1`,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(calls).toEqual(['authenticate', 'authorize', 'list']);
    expect(listDeadEvents).toHaveBeenCalledWith({ source: 'cents', limit: 1 });
    expect(body).toEqual({
      ok: true,
      data: {
        items: [
          expect.objectContaining({
            eventId,
            sourceOccurredAt: '2026-08-22T14:00:00.000Z',
            receivedAt: '2026-08-22T14:01:00.000Z',
          }),
        ],
        nextCursor: expect.any(String),
        asOf: '2026-08-22T15:00:00.000Z',
      },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(`"nextCursor":"${eventId}"`);
    expect(serialized).not.toContain('"payload"');
    expect(serialized).not.toContain('"lastErrorMessage"');
  });

  it('replays through the target cell with the deployed success envelope', async () => {
    const calls: string[] = [];
    const replayDeadEvent = vi.fn(async () => {
      calls.push('replay');
      return {
        kind: 'success' as const,
        value: { eventId, outcome: 'already_queued' as const },
      };
    });
    const app = makeApp({
      cells: {
        listDeadEvents: {
          execute: vi.fn(async () => ({
            kind: 'success' as const,
            value: { items: [], nextEventId: null, asOf: new Date(0) },
          })),
        },
        replayDeadEvent: { execute: replayDeadEvent },
      },
      authenticate: pass(calls, 'authenticate'),
      authorize: pass(calls, 'authorize'),
    });

    const response = await fetch(
      `${await start(app)}/webhook-ingestion/dead-letters/${eventId}/replay`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'replay-dead-webhook-event' }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { eventId, outcome: 'already_queued' },
    });
    expect(calls).toEqual(['authenticate', 'authorize', 'replay']);
    expect(replayDeadEvent).toHaveBeenCalledWith({ eventId });
  });

  it('maps target replay conflicts at the HTTP edge', async () => {
    const calls: string[] = [];
    const app = makeApp({
      cells: {
        listDeadEvents: {
          execute: vi.fn(async () => ({
            kind: 'success' as const,
            value: { items: [], nextEventId: null, asOf: new Date(0) },
          })),
        },
        replayDeadEvent: {
          execute: vi.fn(async () => ({
            kind: 'failure' as const,
            failure: {
              kind: 'conflict' as const,
              code: 'webhook_event_not_replayable' as const,
              message: 'Only dead events can be replayed.',
              safeMessage: 'Only dead events can be replayed.',
            },
          })),
        },
      },
      authenticate: pass(calls, 'authenticate'),
      authorize: pass(calls, 'authorize'),
    });

    const response = await fetch(
      `${await start(app)}/webhook-ingestion/dead-letters/${eventId}/replay`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'replay-dead-webhook-event' }),
      },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'webhook_event_not_replayable' },
    });
    expect(calls).toEqual(['authenticate', 'authorize']);
  });

  it('authorizes replay route scope before validating the request body', async () => {
    const calls: string[] = [];
    const replayDeadEvent = vi.fn();
    const app = makeApp({
      cells: {
        listDeadEvents: {
          execute: vi.fn(async () => ({
            kind: 'success' as const,
            value: { items: [], nextEventId: null, asOf: new Date(0) },
          })),
        },
        replayDeadEvent: { execute: replayDeadEvent },
      },
      authenticate: pass(calls, 'authenticate'),
      authorize: pass(calls, 'authorize'),
    });

    const response = await fetch(
      `${await start(app)}/webhook-ingestion/dead-letters/${eventId}/replay`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'wrong' }),
      },
    );

    expect(response.status).toBe(400);
    expect(calls).toEqual(['authenticate', 'authorize']);
    expect(replayDeadEvent).not.toHaveBeenCalled();
  });
});
