import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { result } from '@pressly/kernel';
import express, { type RequestHandler } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ConfirmProductionOrderOvertime,
  PlaceProductionOrderAutomatically,
  PlaceProductionOrderExactly,
} from '../../../../src/features/scheduling/place-order/place-production-order.port.ts';
import { makePlaceProductionOrderRoutes } from '../../../../src/features/scheduling/place-order/place-production-order.route.ts';

const locationId = 'location-1';
const productionRunId = '11111111-1111-4111-8111-111111111111';
const productionOrderId = '22222222-2222-4222-8222-222222222222';
const productionBatchId = '33333333-3333-4333-8333-333333333333';
const actorId = '44444444-4444-4444-8444-444444444444';
const proposalHash =
  'a6da4f7659bca9627f63969bc4d5d413665fda2aaec6c94ae0837ea03e075d98';
const servers: Server[] = [];

const start = async (app: express.Express): Promise<string> => {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
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

describe('place Production order HTTP boundary', () => {
  it('preserves the three placement routes, commands, and serialized results', async () => {
    const placeAutomatically = vi
      .fn<PlaceProductionOrderAutomatically>()
      .mockResolvedValue(
        result.ok({
          status: 'placed',
          mode: 'automatic',
          productionRunId,
          productionOrderId,
          productionBatchId,
          createdBatch: true,
          affectedBatchIds: [productionBatchId],
          queueVersion: 5,
          proposalHash,
          plannedCompletionAt: '2026-08-02T21:00:00.000Z',
          overtimeMinutes: 0,
          replayed: false,
        }),
      );
    const placeExactly = vi.fn<PlaceProductionOrderExactly>().mockResolvedValue(
      result.ok({
        status: 'confirmation_required',
        mode: 'manager_exact',
        productionRunId,
        productionOrderId,
        target: {
          kind: 'existing_batch',
          productionBatchId,
          sequence: 1,
        },
        affectedBatchIds: [productionBatchId],
        queueVersion: 5,
        proposalHash,
        projectedCompletionAt: '2026-08-02T21:15:00.000Z',
        overtimeMinutes: 15,
        replayed: false,
      }),
    );
    const confirmOvertime = vi
      .fn<ConfirmProductionOrderOvertime>()
      .mockResolvedValue(
        result.ok({
          status: 'not_placed',
          mode: 'manager_exact',
          productionRunId,
          productionOrderId,
          reason: 'proposal_stale',
          message: 'The overtime proposal is stale.',
          queueVersion: 6,
          replayed: false,
        }),
      );
    const pass: RequestHandler = (_request, _response, next) => next();
    const app = express();
    app.use(express.json());
    app.use(
      makePlaceProductionOrderRoutes({
        placeAutomatically,
        placeExactly,
        confirmOvertime,
        authenticate: pass,
        authorizeOverride: pass,
        readActorId: () => actorId,
      }),
    );
    const baseUrl = await start(app);
    const orderUrl = `${baseUrl}/production/locations/${locationId}/runs/${productionRunId}/orders/${productionOrderId}`;
    const automatic = await fetch(`${orderUrl}/place`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedQueueVersion: 4,
        idempotencyKey: 'place-automatic-123',
      }),
    });
    const exact = await fetch(
      `${baseUrl}/production/locations/${locationId}/runs/${productionRunId}/batches/${productionBatchId}/orders/${productionOrderId}/place`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedQueueVersion: 4,
          expectedBatchVersion: 2,
          idempotencyKey: 'place-exact-123',
        }),
      },
    );
    const confirmed = await fetch(`${orderUrl}/confirm-overtime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedQueueVersion: 5,
        proposalHash,
        idempotencyKey: 'confirm-overtime-123',
      }),
    });

    expect([automatic.status, exact.status, confirmed.status]).toEqual([
      200, 200, 200,
    ]);
    await expect(automatic.json()).resolves.toMatchObject({
      ok: true,
      data: { status: 'placed', mode: 'automatic' },
    });
    await expect(exact.json()).resolves.toMatchObject({
      ok: true,
      data: { status: 'confirmation_required', mode: 'manager_exact' },
    });
    await expect(confirmed.json()).resolves.toMatchObject({
      ok: true,
      data: { status: 'not_placed', reason: 'proposal_stale' },
    });
    expect(placeAutomatically).toHaveBeenCalledWith({
      locationId,
      productionRunId,
      productionOrderId,
      expectedQueueVersion: 4,
      idempotencyKey: 'place-automatic-123',
      actorId,
      authorizedAction: 'production:override',
    });
    expect(placeExactly).toHaveBeenCalledWith({
      locationId,
      productionRunId,
      productionBatchId,
      productionOrderId,
      expectedQueueVersion: 4,
      expectedBatchVersion: 2,
      idempotencyKey: 'place-exact-123',
      actorId,
      authorizedAction: 'production:override',
    });
    expect(confirmOvertime).toHaveBeenCalledWith({
      locationId,
      productionRunId,
      productionOrderId,
      expectedQueueVersion: 5,
      proposalHash,
      idempotencyKey: 'confirm-overtime-123',
      actorId,
      authorizedAction: 'production:override',
    });
  });
});
