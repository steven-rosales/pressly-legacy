import { proveOperation } from '@pressly/testkit/operation-proof';
import { commitOrderRouteCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { commitOrderRouteContract } from './contract.ts';
import { commitOrderRouteHttpSurfaces } from './http.ts';

const ids = {
  run: '10000000-0000-4000-8000-000000000001',
  order: '10000000-0000-4000-8000-000000000002',
  source: '10000000-0000-4000-8000-000000000003',
  target: '10000000-0000-4000-8000-000000000004',
  actor: '10000000-0000-4000-8000-000000000005',
  attempt: '10000000-0000-4000-8000-000000000006',
} as const;
const surface = commitOrderRouteHttpSurfaces[0];
const validParams = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionOrderId: ids.order,
};
const validBody = {
  kind: 'queued_move',
  reason: 'manual_rebatch',
  targetProductionBatchId: ids.target,
  restartStage: 'sorting',
  expectedQueueVersion: 4,
  expectedOrderVersion: 3,
  expectedSourceBatchVersion: 2,
  proposalHash: 'a'.repeat(64),
  idempotencyKey: 'commit-route-1',
};

describe('commit order route HTTP surface', () => {
  proveOperation({
    operationId: 'production.commit-order-route.v1',
    declaration: commitOrderRouteCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'declares the deployed commit path with staged actor authorization',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            kind: 'http',
            method: 'POST',
            path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route',
            bodyLimit: '64kb',
            authorization: 'staged',
            contextRequirements: ['authenticated-actor'],
          });
        },
      },
    ],
  });

  it('rejects the body before invalid params', () => {
    expect(surface).toBeDefined();
    if (surface === undefined || surface.validateRequest === null) return;
    try {
      surface.validateRequest({
        params: {
          locationId: '',
          productionRunId: 'bad',
          productionOrderId: 'bad',
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

  it('validates params after a valid body and reads actor last', () => {
    expect(surface).toBeDefined();
    if (surface === undefined || surface.validateRequest === null) return;
    const validateRequest = surface.validateRequest;
    expect(() =>
      validateRequest({
        params: {
          locationId: '',
          productionRunId: 'bad',
          productionOrderId: 'bad',
        },
        query: {},
        headers: {},
        body: validBody,
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid_params_type' }));

    expect(() =>
      surface.toSerializedInput({
        params: validParams,
        query: {},
        headers: {},
        body: validBody,
        context: {},
      }),
    ).toThrow(expect.objectContaining({ code: 'missing_auth_principal' }));
  });

  it('maps the trusted identity and fixed authorization action', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    const serialized = surface.toSerializedInput({
      params: validParams,
      query: {},
      headers: {},
      body: validBody,
      context: { actorId: ids.actor },
    });
    expect(commitOrderRouteContract.input.decode(serialized)).toEqual({
      kind: 'valid',
      value: {
        ...validParams,
        actorId: ids.actor,
        authorizedAction: 'production:stage',
        ...validBody,
      },
    });
  });

  it('presents success and maps all expected failure categories exactly', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    const proposal = {
      kind: 'queued_move' as const,
      productionRunId: ids.run,
      productionOrderId: ids.order,
      sourceProductionBatchId: ids.source,
      sourceBatchSequence: 0,
      targetProductionBatchId: ids.target,
      targetBatchSequence: 1,
      restartStage: 'sorting' as const,
      releasedStages: ['sorting'] as const,
      assignedStages: ['sorting'] as const,
      orderWeightLbs: 25,
      targetWeightLbs: 75,
      targetCapacityLbs: 100,
      expectedQueueVersion: 4,
      expectedOrderVersion: 3,
      expectedSourceBatchVersion: 2,
      expectedTargetBatchVersion: 5,
      proposalHash: validBody.proposalHash,
    };
    expect(
      surface.present({
        kind: 'success',
        value: {
          status: 'routed',
          proposal,
          queueVersion: 5,
          orderVersion: 4,
          sourceBatchVersion: 3,
          targetBatchVersion: 6,
          createdAttemptIds: [ids.attempt],
          replayed: false,
        },
      }),
    ).toMatchObject({ status: 200, body: { ok: true } });

    const failures = [
      {
        failure: {
          kind: 'not_found' as const,
          code: 'production_order_route_not_found' as const,
          message:
            'The production run, order, or current batch was not found.' as const,
          safeMessage:
            'The production run, order, or current batch was not found.' as const,
        },
        status: 404,
      },
      {
        failure: {
          kind: 'conflict' as const,
          code: 'production_order_route_proposal_stale',
          message: 'Stale.',
          safeMessage: 'Stale.',
        },
        status: 409,
      },
      {
        failure: {
          kind: 'validation' as const,
          classification: 'semantic' as const,
          code: 'hard_capacity_exceeded',
          message: 'Capacity.',
          safeMessage: 'Capacity.',
        },
        status: 422,
      },
    ];
    for (const candidate of failures)
      expect(() =>
        surface.present({ kind: 'failure', failure: candidate.failure }),
      ).toThrow(expect.objectContaining({ status: candidate.status }));
  });
});
