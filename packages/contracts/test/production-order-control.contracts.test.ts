import {
  commitProductionOrderRouteRequestSchema,
  listProductionOrderControlQuerySchema,
  previewProductionOrderRouteRequestSchema,
  productionOrderCommandCapabilitiesSchema,
  productionOrderRouteProposalSchema,
} from '../src/index.ts';
import { describe, expect, it } from 'vitest';

const id = (value: number): string =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

describe('production order-control contracts', () => {
  it('coerces bounded keyset page filters from an HTTP query', () => {
    expect(
      listProductionOrderControlQuerySchema.parse({
        view: 'active',
        dueBucket: 'overdue',
        priority: 'true',
        movable: 'false',
        limit: '25',
      }),
    ).toMatchObject({
      view: 'active',
      dueBucket: 'overdue',
      priority: true,
      movable: false,
      limit: 25,
    });
    expect(
      listProductionOrderControlQuerySchema.safeParse({
        dueBefore: '2026-07-20T04:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('requires an explanation for a non-enumerated floor reason', () => {
    const base = {
      kind: 'exception',
      reason: 'other',
      restartStage: 'drying',
      expectedQueueVersion: 2,
      expectedOrderVersion: 3,
      expectedSourceBatchVersion: 4,
    } as const;
    expect(
      previewProductionOrderRouteRequestSchema.safeParse(base).success,
    ).toBe(false);
    expect(
      previewProductionOrderRouteRequestSchema.parse({
        ...base,
        note: 'Comforter is still damp at the center.',
      }),
    ).toMatchObject({ reason: 'other', restartStage: 'drying' });
  });

  it('keeps preview identity and optimistic versions bound into commit', () => {
    const proposal = productionOrderRouteProposalSchema.parse({
      kind: 'queued_move',
      productionRunId: id(1),
      productionOrderId: id(2),
      sourceProductionBatchId: id(3),
      sourceBatchSequence: 1,
      targetProductionBatchId: id(4),
      targetBatchSequence: 2,
      restartStage: 'sorting',
      releasedStages: ['sorting', 'washing', 'drying', 'folding_packaging'],
      assignedStages: ['sorting', 'washing', 'drying', 'folding_packaging'],
      orderWeightLbs: 30,
      targetWeightLbs: 90,
      targetCapacityLbs: 100,
      expectedQueueVersion: 5,
      expectedOrderVersion: 6,
      expectedSourceBatchVersion: 7,
      expectedTargetBatchVersion: 8,
      proposalHash: 'a'.repeat(64),
    });
    expect(
      commitProductionOrderRouteRequestSchema.parse({
        kind: 'queued_move',
        reason: 'manual_rebatch',
        targetProductionBatchId: proposal.targetProductionBatchId,
        restartStage: 'sorting',
        expectedQueueVersion: proposal.expectedQueueVersion,
        expectedOrderVersion: proposal.expectedOrderVersion,
        expectedSourceBatchVersion: proposal.expectedSourceBatchVersion,
        proposalHash: proposal.proposalHash,
        idempotencyKey: 'manual-order-route-1',
      }),
    ).toMatchObject({ proposalHash: proposal.proposalHash });
  });

  it('requires structured server-owned route capabilities and exact target denials', () => {
    const target = {
      productionBatchId: id(4),
      batchSequence: 2,
      batchStatus: 'queued',
      membershipFrozen: false,
      expectedBatchVersion: 8,
      currentWeightLbs: 60,
      projectedWeightLbs: 90,
      capacityLbs: 100,
      feasibility: { status: 'allowed' },
    } as const;

    expect(
      productionOrderCommandCapabilitiesSchema.parse({
        queuedMove: {
          status: 'allowed',
          expectedQueueVersion: 5,
          expectedOrderVersion: 6,
          expectedSourceBatchVersion: 7,
          targets: [
            target,
            {
              ...target,
              productionBatchId: id(5),
              membershipFrozen: true,
              feasibility: {
                status: 'blocked',
                code: 'TARGET_MEMBERSHIP_FROZEN',
              },
            },
          ],
        },
        routeException: {
          status: 'blocked',
          code: 'EXCEPTION_SOURCE_NOT_IN_FLIGHT',
        },
      }),
    ).toMatchObject({
      queuedMove: {
        status: 'allowed',
        targets: [
          { feasibility: { status: 'allowed' } },
          {
            feasibility: {
              status: 'blocked',
              code: 'TARGET_MEMBERSHIP_FROZEN',
            },
          },
        ],
      },
    });

    expect(
      productionOrderCommandCapabilitiesSchema.safeParse({
        canMoveQueued: true,
        canRouteException: false,
      }).success,
    ).toBe(false);
    expect(
      productionOrderCommandCapabilitiesSchema.safeParse({
        queuedMove: {
          status: 'allowed',
          expectedQueueVersion: 5,
          expectedOrderVersion: 6,
          expectedSourceBatchVersion: 7,
          targets: [
            {
              ...target,
              feasibility: {
                status: 'blocked',
                code: 'HARD_CAPACITY_EXCEEDED',
              },
            },
          ],
        },
        routeException: {
          status: 'blocked',
          code: 'EXCEPTION_SOURCE_NOT_IN_FLIGHT',
        },
      }).success,
    ).toBe(false);
  });
});
