import { describe, expect, it } from 'vitest';
import {
  resolveCommitOrderRouteReplay,
  serializeCommitOrderRouteWorkEventCommand,
} from './idempotency.ts';
import type { CommitOrderRouteWorkEventCommand } from './execute.ts';
import type { CommitOrderRouteResult } from './types.ts';

const queued: CommitOrderRouteWorkEventCommand = {
  operation: 'production_order_rebatched',
  locationId: 'location-1',
  actorId: '10000000-0000-4000-8000-000000000001',
  target: {
    entityType: 'production_order',
    entityId: '10000000-0000-4000-8000-000000000002',
  },
  expectedVersion: 3,
  payload: {
    kind: 'queued_move',
    authorizedAction: 'production:stage',
    reason: 'manual_rebatch',
    restartStage: 'sorting',
    expectedQueueVersion: 4,
    expectedSourceBatchVersion: 2,
    proposalHash: 'a'.repeat(64),
    targetProductionBatchId: '10000000-0000-4000-8000-000000000003',
  },
};

const result: CommitOrderRouteResult = {
  status: 'routed',
  proposal: {
    kind: 'queued_move',
    productionRunId: 'run-1',
    productionOrderId: queued.target.entityId,
    sourceProductionBatchId: 'batch-1',
    sourceBatchSequence: 0,
    targetProductionBatchId: '10000000-0000-4000-8000-000000000003',
    targetBatchSequence: 1,
    restartStage: 'sorting',
    releasedStages: ['sorting', 'washing', 'drying', 'folding_packaging'],
    assignedStages: ['sorting', 'washing', 'drying', 'folding_packaging'],
    orderWeightLbs: 20,
    targetWeightLbs: 40,
    targetCapacityLbs: 100,
    expectedQueueVersion: queued.payload.expectedQueueVersion,
    expectedOrderVersion: queued.expectedVersion,
    expectedSourceBatchVersion: queued.payload.expectedSourceBatchVersion,
    expectedTargetBatchVersion: 5,
    proposalHash: queued.payload.proposalHash,
  },
  queueVersion: 5,
  orderVersion: 4,
  sourceBatchVersion: 3,
  targetBatchVersion: 6,
  createdAttemptIds: ['attempt-1'],
  replayed: false,
};

describe('commit order route idempotency', () => {
  it('serializes the exact queued command identity', () => {
    expect(serializeCommitOrderRouteWorkEventCommand(queued)).toEqual(queued);
  });

  it('serializes normalized exception note only when present', () => {
    expect(
      serializeCommitOrderRouteWorkEventCommand({
        ...queued,
        operation: 'production_order_route_exception_recorded',
        payload: {
          kind: 'exception',
          authorizedAction: 'production:stage',
          reason: 'other',
          restartStage: 'washing',
          expectedQueueVersion: 4,
          expectedSourceBatchVersion: 2,
          proposalHash: 'a'.repeat(64),
          note: 'Explain route.',
        },
      }),
    ).toMatchObject({ payload: { note: 'Explain route.' } });
  });

  it('distinguishes a miss, exact replay, and divergent command', () => {
    expect(resolveCommitOrderRouteReplay(null, queued)).toEqual({
      kind: 'miss',
    });
    expect(
      resolveCommitOrderRouteReplay(
        {
          valid: true,
          command: serializeCommitOrderRouteWorkEventCommand(queued),
          result,
        },
        queued,
      ),
    ).toMatchObject({ kind: 'replay', result: { replayed: true } });
    expect(
      resolveCommitOrderRouteReplay(
        {
          valid: true,
          command: serializeCommitOrderRouteWorkEventCommand(queued),
          result,
        },
        {
          ...queued,
          payload: { ...queued.payload, proposalHash: 'b'.repeat(64) },
        },
      ),
    ).toEqual({ kind: 'conflict' });
  });

  it('rejects malformed envelopes and non-object results', () => {
    expect(
      resolveCommitOrderRouteReplay(
        { valid: false, command: {}, result: {} },
        queued,
      ),
    ).toEqual({ kind: 'conflict' });
  });
});
