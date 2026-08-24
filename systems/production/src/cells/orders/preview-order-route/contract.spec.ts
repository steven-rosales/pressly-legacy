import { proveOperation } from '@pressly/testkit/operation-proof';
import { previewOrderRouteCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { previewOrderRouteContract } from './contract.ts';

const ids = {
  run: '10000000-0000-4000-8000-000000000001',
  order: '10000000-0000-4000-8000-000000000002',
  source: '10000000-0000-4000-8000-000000000003',
  target: '10000000-0000-4000-8000-000000000004',
  actor: '10000000-0000-4000-8000-000000000005',
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
};

describe('preview order route contract', () => {
  proveOperation({
    operationId: 'production.preview-order-route.v1',
    declaration: previewOrderRouteCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'decodes the strict queued-move request with its trusted route identity',
        proves: ['contract'],
        run: () => {
          expect(
            previewOrderRouteContract.input.decode({
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

  it('trims an explained exception and rejects unexplained other reasons', () => {
    expect(
      previewOrderRouteContract.input.decode({
        params,
        body: {
          kind: 'exception',
          reason: 'other',
          restartStage: 'washing',
          note: '  Customer requested a second wash.  ',
          expectedQueueVersion: 4,
          expectedOrderVersion: 3,
          expectedSourceBatchVersion: 2,
        },
        actorId: ids.actor,
      }),
    ).toMatchObject({
      kind: 'valid',
      value: { note: 'Customer requested a second wash.' },
    });

    const missingNote = previewOrderRouteContract.input.decode({
      params,
      body: {
        kind: 'exception',
        reason: 'other',
        restartStage: 'washing',
        expectedQueueVersion: 4,
        expectedOrderVersion: 3,
        expectedSourceBatchVersion: 2,
      },
      actorId: ids.actor,
    });
    expect(missingNote).toMatchObject({ kind: 'invalid' });
    if (missingNote.kind === 'invalid')
      expect(missingNote.issues).toContainEqual({
        path: ['body', 'note'],
        message: 'An explanatory note is required for the other reason.',
      });
  });

  it('keeps body, params, and actor contract issues explicitly located', () => {
    const decoded = previewOrderRouteContract.input.decode({
      params: {
        locationId: '',
        productionRunId: 'not-a-run',
        productionOrderId: 'not-an-order',
      },
      body: { kind: 'queued_move' },
      actorId: '',
    });

    expect(decoded).toMatchObject({ kind: 'invalid' });
    if (decoded.kind === 'invalid')
      expect(decoded.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(['body', 'params', 'actorId']),
      );
  });

  it('round-trips the complete serialized proposal', () => {
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
      assignedStages: [
        'sorting',
        'washing',
        'drying',
        'folding_packaging',
      ] as const,
      orderWeightLbs: 25,
      targetWeightLbs: 75,
      targetCapacityLbs: 100,
      expectedQueueVersion: 4,
      expectedOrderVersion: 3,
      expectedSourceBatchVersion: 2,
      expectedTargetBatchVersion: 5,
      proposalHash: 'a'.repeat(64),
    };

    expect(
      previewOrderRouteContract.output.decode(
        previewOrderRouteContract.output.encode(proposal),
      ),
    ).toEqual({ kind: 'valid', value: proposal });
  });
});
