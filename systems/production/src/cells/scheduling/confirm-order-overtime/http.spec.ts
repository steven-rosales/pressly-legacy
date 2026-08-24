import { proveOperation } from '@pressly/testkit/operation-proof';
import { confirmOrderOvertimeCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { confirmOrderOvertimeContract } from './contract.ts';
import {
  confirmOrderOvertimeContextNotFound,
  confirmOrderOvertimeIdempotencyConflict,
} from './failures.ts';
import { confirmOrderOvertimeHttpSurfaces } from './http.ts';

const ids = {
  run: '64000000-0000-4000-8000-000000000001',
  order: '64000000-0000-4000-8000-000000000002',
  batch: '64000000-0000-4000-8000-000000000003',
} as const;
const proposalHash = 'a'.repeat(64);
const body = {
  expectedQueueVersion: 4,
  proposalHash,
  idempotencyKey: 'confirm-overtime-1',
};
const params = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionOrderId: ids.order,
};
const surface = confirmOrderOvertimeHttpSurfaces[0];

describe('confirm-order-overtime HTTP boundary', () => {
  proveOperation({
    operationId: 'production.confirm-order-overtime.v1',
    declaration: confirmOrderOvertimeCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'declares the exact staged override POST surface',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            kind: 'http',
            method: 'POST',
            path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/confirm-overtime',
            bodyLimit: '64kb',
            contextRequirements: ['authenticated-actor'],
            authorization: 'staged',
          });
        },
      },
    ],
  });

  it('validates without context and decodes scope only from valid params', () => {
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
        params: { ...params, productionRunId: 'bad' },
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
        body: {
          expectedQueueVersion: 0,
          proposalHash: 'bad',
          idempotencyKey: 'bad',
        },
        context: {},
      });
      expect.unreachable('Invalid input must throw.');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect(error).toMatchObject({ code: 'invalid_body_type', status: 400 });
    }
  });

  it('resolves actor context only after valid body and params', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    expect(() =>
      surface.toSerializedInput({
        params: { ...params, productionOrderId: 'bad' },
        query: {},
        headers: {},
        body,
        context: {},
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid_params_type' }));
    expect(() =>
      surface.toSerializedInput({
        params,
        query: {},
        headers: {},
        body,
        context: {},
      }),
    ).toThrow(expect.objectContaining({ code: 'missing_auth_principal' }));
    const serialized = surface.toSerializedInput({
      params,
      query: {},
      headers: {},
      body,
      context: { actorId: 'actor-1', private: true },
    });
    expect(confirmOrderOvertimeContract.input.decode(serialized)).toEqual({
      kind: 'valid',
      value: {
        ...params,
        ...body,
        actorId: 'actor-1',
        authorizedAction: 'production:override',
      },
    });
  });

  it('presents placed and not-placed at 200 with exact expected failures', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    for (const value of [
      {
        status: 'placed' as const,
        mode: 'manager_exact' as const,
        productionRunId: ids.run,
        productionOrderId: ids.order,
        productionBatchId: ids.batch,
        createdBatch: false,
        affectedBatchIds: [ids.batch],
        queueVersion: 5,
        proposalHash,
        plannedCompletionAt: '2026-08-22T22:15:00.000Z',
        overtimeMinutes: 15,
        replayed: false,
      },
      {
        status: 'not_placed' as const,
        mode: 'automatic' as const,
        productionRunId: ids.run,
        productionOrderId: ids.order,
        reason: 'proposal_stale' as const,
        message: 'The proposal is stale.',
        queueVersion: 5,
        replayed: false,
      },
    ])
      expect(surface.present({ kind: 'success', value })).toEqual({
        status: 200,
        body: { ok: true, data: value },
      });
    for (const [failure, status] of [
      [confirmOrderOvertimeContextNotFound(), 404],
      [confirmOrderOvertimeIdempotencyConflict(), 409],
    ] as const)
      expect(() => surface.present({ kind: 'failure', failure })).toThrow(
        expect.objectContaining({ code: failure.code, status }),
      );
  });
});
