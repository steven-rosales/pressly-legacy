import { describe, expect, it } from 'vitest';
import {
  toCommitProductionOrderRouteCommand,
  toCommitProductionOrderRouteResult,
  toPreviewProductionOrderRouteCommand,
  toProductionOrderRouteProposal,
} from '../../../../src/features/orders/route-order/route-production-order.contract.mapper.ts';
import type {
  CommitProductionOrderRouteResult,
  ProductionOrderRouteProposal,
} from '../../../../src/features/orders/route-order/route-production-order.model.ts';

const identity = {
  locationId: 'location-1',
  productionRunId: '10000000-0000-4000-8000-000000000001',
  productionOrderId: '10000000-0000-4000-8000-000000000002',
  actorId: '10000000-0000-4000-8000-000000000003',
} as const;

const proposal: ProductionOrderRouteProposal = {
  kind: 'queued_move',
  productionRunId: identity.productionRunId,
  productionOrderId: identity.productionOrderId,
  sourceProductionBatchId: '10000000-0000-4000-8000-000000000004',
  sourceBatchSequence: 0,
  targetProductionBatchId: '10000000-0000-4000-8000-000000000005',
  targetBatchSequence: 1,
  restartStage: 'sorting',
  releasedStages: ['sorting', 'washing'],
  assignedStages: ['sorting', 'washing'],
  orderWeightLbs: 25,
  targetWeightLbs: 75,
  targetCapacityLbs: 100,
  expectedQueueVersion: 4,
  expectedOrderVersion: 3,
  expectedSourceBatchVersion: 2,
  expectedTargetBatchVersion: 5,
  proposalHash: 'a'.repeat(64),
};

describe('production order route boundary mapper', () => {
  it('adds trusted application identity to each decoded request shape', () => {
    expect(
      toPreviewProductionOrderRouteCommand(identity, {
        kind: 'queued_move',
        reason: 'manual_rebatch',
        targetProductionBatchId: proposal.targetProductionBatchId,
        restartStage: 'sorting',
        expectedQueueVersion: 4,
        expectedOrderVersion: 3,
        expectedSourceBatchVersion: 2,
      }),
    ).toEqual({
      ...identity,
      authorizedAction: 'production:stage',
      kind: 'queued_move',
      reason: 'manual_rebatch',
      targetProductionBatchId: proposal.targetProductionBatchId,
      restartStage: 'sorting',
      expectedQueueVersion: 4,
      expectedOrderVersion: 3,
      expectedSourceBatchVersion: 2,
    });

    expect(
      toCommitProductionOrderRouteCommand(identity, {
        kind: 'exception',
        reason: 'other',
        restartStage: 'drying',
        note: 'Customer reported remaining moisture.',
        expectedQueueVersion: 4,
        expectedOrderVersion: 3,
        expectedSourceBatchVersion: 2,
        proposalHash: proposal.proposalHash,
        idempotencyKey: 'route-order-1',
      }),
    ).toMatchObject({
      ...identity,
      authorizedAction: 'production:stage',
      kind: 'exception',
      reason: 'other',
      restartStage: 'drying',
      note: 'Customer reported remaining moisture.',
      proposalHash: proposal.proposalHash,
      idempotencyKey: 'route-order-1',
    });
  });

  it('materializes readonly application collections at the wire boundary', () => {
    const wireProposal = toProductionOrderRouteProposal(proposal);
    expect(wireProposal).toEqual(proposal);
    expect(wireProposal.releasedStages).not.toBe(proposal.releasedStages);
    expect(wireProposal.assignedStages).not.toBe(proposal.assignedStages);

    const outcome: CommitProductionOrderRouteResult = {
      status: 'routed',
      proposal,
      queueVersion: 5,
      orderVersion: 4,
      sourceBatchVersion: 3,
      targetBatchVersion: 6,
      createdAttemptIds: ['10000000-0000-4000-8000-000000000006'],
      replayed: false,
    };
    const wireOutcome = toCommitProductionOrderRouteResult(outcome);
    expect(wireOutcome).toEqual(outcome);
    expect(wireOutcome.createdAttemptIds).not.toBe(outcome.createdAttemptIds);
    expect(wireOutcome.proposal).not.toBe(outcome.proposal);
  });
});
