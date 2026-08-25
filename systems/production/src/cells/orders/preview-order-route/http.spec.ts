import { proveOperation } from '@pressly/testkit/operation-proof';
import { previewOrderRouteCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { previewOrderRouteContract } from './contract.ts';
import { previewOrderRouteHttpSurfaces } from './http.ts';

const ids = {
  run: '10000000-0000-4000-8000-000000000001',
  order: '10000000-0000-4000-8000-000000000002',
  target: '10000000-0000-4000-8000-000000000003',
  actor: '10000000-0000-4000-8000-000000000004',
} as const;

const surface = previewOrderRouteHttpSurfaces[0];
const validBody = {
  kind: 'queued_move',
  reason: 'manual_rebatch',
  targetProductionBatchId: ids.target,
  restartStage: 'sorting',
  expectedQueueVersion: 8,
  expectedOrderVersion: 3,
  expectedSourceBatchVersion: 5,
};
const validParams = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionOrderId: ids.order,
};

describe('preview order route HTTP surface', () => {
  proveOperation({
    operationId: 'production.preview-order-route.v1',
    declaration: previewOrderRouteCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'declares only the deployed preview transport and actor context',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            kind: 'http',
            method: 'POST',
            path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route/preview',
            bodyLimit: '64kb',
            authorization: 'staged',
            contextRequirements: ['authenticated-actor'],
          });
          expect(surface?.validateRequest).not.toBeNull();
        },
      },
    ],
  });

  it('rejects an invalid body before invalid params or actor context', () => {
    expect(surface).toBeDefined();
    if (surface === undefined || surface.validateRequest === null) return;

    try {
      surface.validateRequest({
        params: {
          locationId: '',
          productionRunId: 'not-a-run',
          productionOrderId: 'not-an-order',
        },
        query: {},
        headers: {},
        body: { kind: 'queued_move' },
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

  it('validates params only after a valid body', () => {
    expect(surface).toBeDefined();
    if (surface === undefined || surface.validateRequest === null) return;
    const validateRequest = surface.validateRequest;

    expect(() =>
      validateRequest({
        params: {
          locationId: '',
          productionRunId: 'not-a-run',
          productionOrderId: 'not-an-order',
        },
        query: {},
        headers: {},
        body: validBody,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'invalid_params_type',
        status: 400,
        publicDetails: expect.objectContaining({ location: 'params' }),
      }),
    );
  });

  it('maps the authenticated actor and fixed authorization identity', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;

    const serialized = surface.toSerializedInput({
      params: validParams,
      query: {},
      headers: {},
      body: validBody,
      context: { actorId: ids.actor },
    });
    expect(previewOrderRouteContract.input.decode(serialized)).toEqual({
      kind: 'valid',
      value: {
        ...validParams,
        actorId: ids.actor,
        authorizedAction: 'production:stage',
        ...validBody,
      },
    });
  });

  it('presents proposal success and each typed failure category', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;

    const proposal = {
      kind: 'queued_move' as const,
      productionRunId: ids.run,
      productionOrderId: ids.order,
      sourceProductionBatchId: '10000000-0000-4000-8000-000000000005',
      sourceBatchSequence: 0,
      targetProductionBatchId: ids.target,
      targetBatchSequence: 1,
      restartStage: 'sorting' as const,
      releasedStages: ['sorting'] as const,
      assignedStages: ['sorting'] as const,
      orderWeightLbs: 20,
      targetWeightLbs: 45,
      targetCapacityLbs: 100,
      expectedQueueVersion: 8,
      expectedOrderVersion: 3,
      expectedSourceBatchVersion: 5,
      expectedTargetBatchVersion: 6,
      proposalHash: 'a'.repeat(64),
    };
    expect(surface.present({ kind: 'success', value: proposal })).toEqual({
      status: 200,
      body: { ok: true, data: proposal },
    });
    expect(() =>
      surface.present({
        kind: 'failure',
        failure: {
          kind: 'conflict',
          code: 'production_queue_version_conflict',
          message: 'The queue changed.',
          safeMessage: 'The queue changed.',
        },
      }),
    ).toThrow(expect.objectContaining({ status: 409 }));
    expect(() =>
      surface.present({
        kind: 'failure',
        failure: {
          kind: 'validation',
          classification: 'semantic',
          code: 'hard_capacity_exceeded',
          message: 'Capacity exceeded.',
          safeMessage: 'Capacity exceeded.',
        },
      }),
    ).toThrow(expect.objectContaining({ status: 422 }));
  });
});
