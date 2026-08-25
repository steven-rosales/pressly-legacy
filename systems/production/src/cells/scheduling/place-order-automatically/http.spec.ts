import { proveOperation } from '@pressly/testkit/operation-proof';
import { placeOrderAutomaticallyCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { placeOrderAutomaticallyContract } from './contract.ts';
import {
  placeOrderAutomaticallyContextNotFound,
  placeOrderAutomaticallyIdempotencyConflict,
} from './failures.ts';
import { placeOrderAutomaticallyHttpSurfaces } from './http.ts';

const ids = {
  run: '52000000-0000-4000-8000-000000000001',
  order: '52000000-0000-4000-8000-000000000002',
  batch: '52000000-0000-4000-8000-000000000003',
} as const;
const body = {
  expectedQueueVersion: 4,
  idempotencyKey: 'place-automatic-1',
};
const params = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionOrderId: ids.order,
};
const surface = placeOrderAutomaticallyHttpSurfaces[0];

describe('place-order-automatically HTTP boundary', () => {
  proveOperation({
    operationId: 'production.place-order-automatically.v1',
    declaration: placeOrderAutomaticallyCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'declares the exact staged POST surface',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            kind: 'http',
            method: 'POST',
            path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/place',
            bodyLimit: '64kb',
            contextRequirements: ['authenticated-actor'],
            authorization: 'staged',
          });
        },
      },
    ],
  });

  it('validates without actor context and derives only validated path scope', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    expect(
      surface.validateRequest?.({ params, query: {}, headers: {}, body }),
    ).toBeUndefined();
    expect(
      surface.decodeAuthorizationScope?.({ params, query: {}, headers: {} }),
    ).toEqual({ kind: 'valid', value: 'location-1' });
    expect(
      surface.decodeAuthorizationScope?.({
        params: { ...params, productionOrderId: 'bad' },
        query: {},
        headers: {},
      }),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('preserves body-before-params validation precedence', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    try {
      surface.toSerializedInput({
        params: {
          locationId: '',
          productionRunId: 'bad',
          productionOrderId: 'bad',
        },
        query: {},
        headers: {},
        body: { expectedQueueVersion: 0, idempotencyKey: 'bad' },
        context: {},
      });
      expect.unreachable('Invalid body must fail first.');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect(error).toMatchObject({
        code: 'invalid_body_type',
        status: 400,
        publicDetails: { location: 'body' },
      });
    }
  });

  it('validates params before resolving actor context, then decodes override authority', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    expect(() =>
      surface.toSerializedInput({
        params: { ...params, productionRunId: 'bad' },
        query: {},
        headers: {},
        body,
        context: {},
      }),
    ).toThrow(
      expect.objectContaining({ code: 'invalid_params_type', status: 400 }),
    );
    expect(() =>
      surface.toSerializedInput({
        params,
        query: {},
        headers: {},
        body,
        context: {},
      }),
    ).toThrow(
      expect.objectContaining({ code: 'missing_auth_principal', status: 401 }),
    );
    const serialized = surface.toSerializedInput({
      params,
      query: {},
      headers: {},
      body,
      context: { actorId: 'actor-1', privateValue: true },
    });
    expect(serialized).toEqual({ params, body, actorId: 'actor-1' });
    expect(placeOrderAutomaticallyContract.input.decode(serialized)).toEqual({
      kind: 'valid',
      value: {
        ...params,
        ...body,
        actorId: 'actor-1',
        authorizedAction: 'production:override',
      },
    });
  });

  it('presents all canonical results at 200 and exact expected failures', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    for (const value of [
      {
        status: 'placed' as const,
        mode: 'automatic' as const,
        productionRunId: ids.run,
        productionOrderId: ids.order,
        productionBatchId: ids.batch,
        createdBatch: false,
        affectedBatchIds: [ids.batch],
        queueVersion: 5,
        proposalHash: 'a'.repeat(64),
        plannedCompletionAt: '2026-08-22T21:00:00.000Z',
        overtimeMinutes: 0,
        replayed: false,
      },
      {
        status: 'confirmation_required' as const,
        mode: 'automatic' as const,
        productionRunId: ids.run,
        productionOrderId: ids.order,
        target: { kind: 'new_batch' as const, sequence: 2 },
        affectedBatchIds: [],
        queueVersion: 4,
        proposalHash: 'b'.repeat(64),
        projectedCompletionAt: '2026-08-22T22:15:00.000Z',
        overtimeMinutes: 15,
        replayed: false,
      },
      {
        status: 'not_placed' as const,
        mode: 'automatic' as const,
        productionRunId: ids.run,
        productionOrderId: ids.order,
        reason: 'queue_conflict' as const,
        message: 'The queue changed.',
        queueVersion: 5,
        replayed: false,
      },
    ])
      expect(surface.present({ kind: 'success', value })).toEqual({
        status: 200,
        body: { ok: true, data: value },
      });

    for (const [expectedFailure, status] of [
      [placeOrderAutomaticallyContextNotFound(), 404],
      [placeOrderAutomaticallyIdempotencyConflict(), 409],
    ] as const)
      expect(() =>
        surface.present({ kind: 'failure', failure: expectedFailure }),
      ).toThrow(
        expect.objectContaining({ code: expectedFailure.code, status }),
      );
  });
});
