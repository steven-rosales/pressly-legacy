import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  ProductionApplication,
  ProductionOrderBacklogPreview,
} from '@pressly/production';
import {
  makeOperationalOrderIdentityQueries,
  type OperationalOrderIdentityPort,
} from '@pressly/processor-experience';
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeProcessorOperationalOrderIdentityAdapter } from '../../src/http/processor/operational-order-identity/operational-order-identity.adapter.ts';
import { makeProcessorOperationalOrderRoutes } from '../../src/http/processor/operational-order-identity/operational-order-identity.route.ts';

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

const previewItem = (
  value: number,
  category:
    | 'ready_to_archive'
    | 'review_individually'
    | 'kept_for_safety'
    | 'already_historical',
  reason:
    | 'no_operator_owned_facts'
    | 'intake_recorded'
    | 'execution_committed'
    | 'resolved_without_production',
) => ({
  orderId: id(value),
  displayReference: `legacy:${value}`,
  dueAt: '2026-06-30T17:00:00.000Z',
  category,
  reasons: [reason],
  expectedVersion: 1,
  expectedResolutionState:
    category === 'already_historical'
      ? ('resolved_without_production' as const)
      : ('open' as const),
});

const preview: ProductionOrderBacklogPreview = {
  locationId: 'east',
  filter: 'all_due_before_cutoff',
  cutoff: '2026-07-01T03:59:59.999Z',
  reason: 'processor_not_in_use',
  maxOrders: 10,
  candidateCount: 4,
  hasMore: false,
  cursor: null,
  nextCursor: null,
  previewHash: 'a'.repeat(64),
  generatedAt: '2026-07-27T12:00:00.000Z',
  groups: {
    readyToArchive: [
      previewItem(1, 'ready_to_archive', 'no_operator_owned_facts'),
    ],
    reviewIndividually: [
      previewItem(2, 'review_individually', 'intake_recorded'),
    ],
    keptForSafety: [previewItem(3, 'kept_for_safety', 'execution_committed')],
    alreadyHistorical: [
      previewItem(4, 'already_historical', 'resolved_without_production'),
    ],
  },
};

type ProductionHistoryActivityPage = Extract<
  Awaited<
    ReturnType<ProductionApplication['productionHistory']['listActivity']>
  >,
  Readonly<{ tag: 'ok' }>
>['value'];

const activity: ProductionHistoryActivityPage = {
  items: [
    {
      id: id(10),
      eventType: 'production_order_resolved_without_production',
      entityType: 'production_order',
      entityId: id(1),
      actor: { id: id(11), kind: 'user', displayName: 'Manager' },
      expectedVersion: 2,
      productionRunId: null,
      resolutionAction: { action: 'restore', expectedVersion: 2 },
      summary: 'Order archived from active work.',
      details: {
        kind: 'order',
        productionRunId: null,
        sourceBatchId: null,
        targetBatchId: null,
        outcome: 'resolved_without_production',
        bagCount: null,
        priority: null,
        queueVersion: null,
        version: 2,
        resolutionState: 'resolved_without_production',
        resolutionReason: 'processor_not_in_use',
        routeReason: null,
        restartStage: null,
        releasedStages: [],
        assignedStages: [],
      },
      occurredAt: new Date('2026-07-27T12:00:00.000Z'),
    },
  ],
  nextCursor: null,
  asOf: new Date('2026-07-27T12:01:00.000Z'),
};

const makeApp = () => {
  const previewProductionOrderBacklog = vi.fn(async () => ({
    tag: 'ok' as const,
    value: preview,
  }));
  const resolve = vi.fn<OperationalOrderIdentityPort['resolve']>(
    async (references) =>
      new Map(
        references.map((reference) => [
          reference.referenceId,
          {
            identity: {
              displayNumber: `ORD-${reference.fallbackDisplayNumber}`,
              customerDisplayName: `Customer ${reference.fallbackDisplayNumber}`,
            },
            canonical: null,
          },
        ]),
      ),
  );
  const authenticate = vi.fn<RequestHandler>((_request, _response, next) =>
    next(),
  );
  const authorizeRead = vi.fn<RequestHandler>((_request, _response, next) =>
    next(),
  );
  const authorizeOverride = vi.fn<RequestHandler>((_request, _response, next) =>
    next(),
  );
  const listActivity = vi.fn<
    ProductionApplication['productionHistory']['listActivity']
  >(async () => ({ tag: 'ok', value: activity }));
  const app = express();
  app.use(express.json());
  app.use(
    makeProcessorOperationalOrderRoutes({
      production: {
        previewProductionOrderBacklog,
        loadProductionBoard: async () => {
          throw new Error('Not used by this route test.');
        },
        loadProductionWorkspace: async () => {
          throw new Error('Not used by this route test.');
        },
        loadRemainingDayForecast: async () => {
          throw new Error('Not used by this route test.');
        },
        productionHistory: {
          listActivity,
          loadRun: async () => {
            throw new Error('Not used by this route test.');
          },
        },
      },
      operationalOrderAdapter: makeProcessorOperationalOrderIdentityAdapter(
        makeOperationalOrderIdentityQueries({ resolve }),
      ),
      authenticate,
      authorizeRead,
      authorizeOverride,
    }),
  );
  const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _request,
    response,
    _next,
  ) => {
    const appError = error as { status?: number; code?: string };
    response
      .status(appError.status ?? 500)
      .json({ code: appError.code ?? 'unknown_error' });
  };
  app.use(errorHandler);

  return {
    app,
    previewProductionOrderBacklog,
    listActivity,
    resolve,
    authenticate,
    authorizeRead,
    authorizeOverride,
  };
};

describe('Processor operational order identity routes', () => {
  it('uses override authorization and composes every preview group through one identity batch', async () => {
    const harness = makeApp();
    const response = await fetch(
      `${await start(harness.app)}/production/locations/east/order-backlog/preview`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filter: 'all_due_before_cutoff',
          cutoff: '2026-07-01T03:59:59.999Z',
          reason: 'processor_not_in_use',
          maxOrders: 10,
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        groups: {
          readyToArchive: [
            {
              identity: {
                displayNumber: 'ORD-legacy:1',
                customerDisplayName: 'Customer legacy:1',
              },
            },
          ],
          reviewIndividually: [
            { identity: { customerDisplayName: 'Customer legacy:2' } },
          ],
          keptForSafety: [
            { identity: { customerDisplayName: 'Customer legacy:3' } },
          ],
          alreadyHistorical: [
            { identity: { customerDisplayName: 'Customer legacy:4' } },
          ],
        },
      },
    });
    expect(harness.previewProductionOrderBacklog).toHaveBeenCalledWith({
      locationId: 'east',
      filter: 'all_due_before_cutoff',
      cutoff: '2026-07-01T03:59:59.999Z',
      reason: 'processor_not_in_use',
      cursor: null,
      maxOrders: 10,
    });
    expect(harness.resolve).toHaveBeenCalledOnce();
    expect(harness.resolve.mock.calls[0]?.[0]).toHaveLength(4);
    expect(harness.authenticate).toHaveBeenCalledOnce();
    expect(harness.authorizeOverride).toHaveBeenCalledOnce();
    expect(harness.authorizeRead).not.toHaveBeenCalled();
  });

  it('rejects unrecognized preview fields before calling Production', async () => {
    const harness = makeApp();
    const response = await fetch(
      `${await start(harness.app)}/production/locations/east/order-backlog/preview`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filter: 'all_due_before_cutoff',
          cutoff: '2026-07-01T03:59:59.999Z',
          reason: 'processor_not_in_use',
          maxOrders: 10,
          clientClassification: 'ready_to_archive',
        }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'invalid_body_type',
    });
    expect(harness.previewProductionOrderBacklog).not.toHaveBeenCalled();
    expect(harness.authorizeOverride).not.toHaveBeenCalled();
  });

  it('composes bounded order activity through read authorization and one identity batch', async () => {
    const harness = makeApp();
    const response = await fetch(
      `${await start(harness.app)}/production/locations/east/history/activity?orderResolution=archived&limit=25`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        items: [
          {
            entityType: 'production_order',
            entityId: id(1),
            identity: {
              displayNumber: `ORD-${id(1)}`,
              customerDisplayName: `Customer ${id(1)}`,
            },
            resolutionAction: {
              action: 'restore',
              expectedVersion: 2,
            },
          },
        ],
      },
    });
    expect(harness.listActivity).toHaveBeenCalledWith({
      locationId: 'east',
      orderResolution: 'archived',
      limit: 25,
    });
    expect(harness.resolve).toHaveBeenCalledOnce();
    expect(harness.resolve.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        referenceId: `production:${id(1)}`,
        productionOrderId: id(1),
      }),
    ]);
    expect(harness.authorizeRead).toHaveBeenCalledOnce();
    expect(harness.authorizeOverride).not.toHaveBeenCalled();
  });
});
