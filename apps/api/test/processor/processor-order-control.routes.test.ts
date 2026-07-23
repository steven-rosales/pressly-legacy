import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  ListProcessorOrderControlResult,
  ListProductionOrderControlResult,
} from '@pressly/contracts';
import express, { type RequestHandler } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeProcessorOrderControlRoutes } from '../../src/http/processor/order-control/order-control.route.ts';

const servers: Server[] = [];
const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

const start = async (app: express.Express): Promise<string> => {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
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

describe('Processor Order control route', () => {
  it('envelopes an authorized legacy-backed view without inventing canonical data', async () => {
    const base: ListProductionOrderControlResult = {
      items: [
        {
          order: {
            id: id(1),
            locationId: 'east',
            externalOrderId: 'fulfillment:legacy',
            dueAt: '2026-07-22T20:00:00.000Z',
            dueBucket: 'tomorrow',
            priority: false,
            status: 'release_pending',
            derivedWeightLbs: 20,
            bagCount: null,
            bagCountProvenance: null,
            intakeVersion: null,
            version: 1,
          },
          admission: {
            sourceState: 'unreleased',
            override: null,
            effectiveState: 'unreleased',
            allowedActions: ['release'],
          },
          attention: null,
          currentPlacement: null,
          nextRequiredStage: null,
          routeAttempts: [],
          canMoveQueued: false,
          canRouteException: false,
        },
      ],
      counts: { attention: 0, active: 0, all: 1 },
      nextCursor: 'next-page',
      asOf: '2026-07-21T16:00:00.000Z',
    };
    const composed: ListProcessorOrderControlResult = {
      ...base,
      items: [
        {
          ...base.items[0]!,
          canonical: {
            canonicalOrderId: id(2),
            canonicalFulfillmentId: id(3),
            displayNumber: null,
            customer: {
              resolution: 'legacy_unknown',
              userId: null,
              firstName: null,
              lastName: null,
              businessName: null,
              phone: null,
            },
            commercialState: 'open',
            admissionState: 'unreleased',
            source: { name: 'cents', status: 'SUBMITTED' },
            comparison: 'aligned',
          },
        },
      ],
    };
    const listProductionOrderControl = vi.fn(async () => ({
      tag: 'ok' as const,
      value: base,
    }));
    const compose = vi.fn(async () => composed);
    const authenticate = vi.fn<RequestHandler>((_request, _response, next) =>
      next(),
    );
    const authorize = vi.fn<RequestHandler>((_request, _response, next) =>
      next(),
    );
    const app = express();
    app.use(
      makeProcessorOrderControlRoutes({
        production: { listProductionOrderControl },
        readModel: { compose },
        authenticate,
        authorize,
      }),
    );

    const response = await fetch(
      `${await start(app)}/production/locations/east/order-control?view=all&limit=10&cursor=current-page`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        items: [
          {
            canonical: {
              displayNumber: null,
              customer: {
                resolution: 'legacy_unknown',
                firstName: null,
                phone: null,
              },
              admissionState: 'unreleased',
            },
          },
        ],
        nextCursor: 'next-page',
      },
    });
    expect(listProductionOrderControl).toHaveBeenCalledWith({
      locationId: 'east',
      view: 'all',
      limit: 10,
      cursor: 'current-page',
    });
    expect(compose).toHaveBeenCalledWith(base);
    expect(authenticate).toHaveBeenCalledOnce();
    expect(authorize).toHaveBeenCalledOnce();
  });
});
