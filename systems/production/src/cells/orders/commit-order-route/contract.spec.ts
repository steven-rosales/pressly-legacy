import { proveOperation } from '@pressly/testkit/operation-proof';
import { commitOrderRouteCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { commitOrderRouteContract } from './contract.ts';

const ids = {
  run: '10000000-0000-4000-8000-000000000001',
  order: '10000000-0000-4000-8000-000000000002',
  source: '10000000-0000-4000-8000-000000000003',
  target: '10000000-0000-4000-8000-000000000004',
  actor: '10000000-0000-4000-8000-000000000005',
  attempt: '10000000-0000-4000-8000-000000000006',
} as const;
const params = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionOrderId: ids.order,
};
const queuedBody = {
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
  proposalHash: queuedBody.proposalHash,
};

describe('commit order route contract', () => {
  proveOperation({
    operationId: 'production.commit-order-route.v1',
    declaration: commitOrderRouteCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'decodes strict body then params with trusted actor and authorization',
        proves: ['contract'],
        run: () => {
          expect(
            commitOrderRouteContract.input.decode({
              params,
              body: queuedBody,
              actorId: ids.actor,
            }),
          ).toEqual({
            kind: 'valid',
            value: {
              ...params,
              actorId: ids.actor,
              authorizedAction: 'production:stage',
              ...queuedBody,
            },
          });
        },
      },
    ],
  });

  it('trims exception notes and preserves body-before-params issue order', () => {
    expect(
      commitOrderRouteContract.input.decode({
        params,
        actorId: ids.actor,
        body: {
          kind: 'exception',
          reason: 'other',
          restartStage: 'washing',
          note: '  Explain route.  ',
          expectedQueueVersion: 4,
          expectedOrderVersion: 3,
          expectedSourceBatchVersion: 2,
          proposalHash: 'a'.repeat(64),
          idempotencyKey: 'commit-route-2',
        },
      }),
    ).toMatchObject({ kind: 'valid', value: { note: 'Explain route.' } });

    const invalid = commitOrderRouteContract.input.decode({
      params: {
        locationId: '',
        productionRunId: 'bad',
        productionOrderId: 'bad',
      },
      body: { kind: 'queued_move' },
      actorId: '',
    });
    expect(invalid).toMatchObject({ kind: 'invalid' });
    if (invalid.kind === 'invalid') {
      expect(invalid.issues[0]?.path[0]).toBe('body');
      expect(
        invalid.issues.findIndex((issue) => issue.path[0] === 'params'),
      ).toBeGreaterThan(0);
      expect(invalid.issues.at(-1)?.path).toEqual(['actorId']);
    }
  });

  it('round-trips the full result with fresh wire arrays', () => {
    const result = {
      status: 'routed' as const,
      proposal,
      queueVersion: 5,
      orderVersion: 4,
      sourceBatchVersion: 3,
      targetBatchVersion: 6,
      createdAttemptIds: [ids.attempt],
      replayed: false,
    };
    const encoded = commitOrderRouteContract.output.encode(result);
    expect(commitOrderRouteContract.output.decode(encoded)).toEqual({
      kind: 'valid',
      value: result,
    });
  });

  it('accepts exact not-found, conflict, and semantic validation failures only', () => {
    for (const failure of [
      {
        kind: 'not_found',
        code: 'production_order_route_not_found',
        message: 'The production run, order, or current batch was not found.',
        safeMessage:
          'The production run, order, or current batch was not found.',
      },
      {
        kind: 'conflict',
        code: 'production_order_route_proposal_stale',
        message: 'Stale.',
        safeMessage: 'Stale.',
      },
      {
        kind: 'validation',
        classification: 'semantic',
        code: 'hard_capacity_exceeded',
        message: 'Capacity.',
        safeMessage: 'Capacity.',
      },
    ])
      expect(commitOrderRouteContract.failure.decode(failure)).toMatchObject({
        kind: 'valid',
      });
  });
});
