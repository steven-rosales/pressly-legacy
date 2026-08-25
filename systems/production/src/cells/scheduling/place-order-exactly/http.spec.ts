import { proveOperation } from '@pressly/testkit/operation-proof';
import { placeOrderExactlyCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { placeOrderExactlyContract } from './contract.ts';
import { placeOrderExactlyHttpSurfaces } from './http.ts';

const ids = {
  run: '10000000-0000-4000-8000-000000000001',
  batch: '10000000-0000-4000-8000-000000000002',
  order: '10000000-0000-4000-8000-000000000003',
  actor: '10000000-0000-4000-8000-000000000004',
} as const;
const params = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionBatchId: ids.batch,
  productionOrderId: ids.order,
};
const body = {
  expectedQueueVersion: 4,
  expectedBatchVersion: 3,
  idempotencyKey: 'place-exact-1',
};
const surface = placeOrderExactlyHttpSurfaces[0];

describe('place order exactly HTTP surface', () => {
  proveOperation({
    operationId: 'production.place-order-exactly.v1',
    declaration: placeOrderExactlyCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'declares only the exact deployed POST with staged actor context',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            kind: 'http',
            method: 'POST',
            path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/orders/:productionOrderId/place',
            bodyLimit: '64kb',
            authorization: 'staged',
            contextRequirements: ['authenticated-actor'],
          });
        },
      },
    ],
  });

  it('rejects invalid body before invalid params', () => {
    expect(surface).toBeDefined();
    if (surface === undefined || surface.validateRequest === null) return;
    try {
      surface.validateRequest({
        params: {
          locationId: '',
          productionRunId: 'bad',
          productionBatchId: 'bad',
          productionOrderId: 'bad',
        },
        query: {},
        headers: {},
        body: {},
      });
      expect.unreachable('Invalid input must throw.');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect(error).toMatchObject({
        code: 'invalid_body_type',
        status: 400,
        publicDetails: { location: 'body' },
      });
    }
  });

  it('maps route and body only after actor context is present', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    expect(() =>
      surface.toSerializedInput({
        params,
        query: {},
        headers: {},
        body,
        context: {},
      }),
    ).toThrow(expect.objectContaining({ code: 'missing_auth_principal' }));
    expect(
      placeOrderExactlyContract.input.decode(
        surface.toSerializedInput({
          params,
          query: {},
          headers: {},
          body,
          context: { actorId: ids.actor },
        }),
      ),
    ).toEqual({
      kind: 'valid',
      value: {
        ...params,
        ...body,
        actorId: ids.actor,
        authorizedAction: 'production:override',
      },
    });
  });

  it('maps success, not-found, and conflict presentation exactly', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    expect(
      surface.present({
        kind: 'success',
        value: {
          status: 'not_placed',
          mode: 'manager_exact',
          productionRunId: ids.run,
          productionOrderId: ids.order,
          reason: 'queue_conflict',
          message: 'Queue changed.',
          queueVersion: 4,
          replayed: false,
        },
      }),
    ).toMatchObject({ status: 200, body: { ok: true } });
    expect(() =>
      surface.present({
        kind: 'failure',
        failure: {
          kind: 'not_found',
          code: 'production_placement_context_not_found',
          message: 'The production run or order was not found.',
          safeMessage: 'The production run or order was not found.',
        },
      }),
    ).toThrow(expect.objectContaining({ status: 404 }));
    expect(() =>
      surface.present({
        kind: 'failure',
        failure: {
          kind: 'conflict',
          code: 'production_idempotency_conflict',
          message: 'Conflict.',
          safeMessage: 'Conflict.',
        },
      }),
    ).toThrow(expect.objectContaining({ status: 409 }));
  });
});
