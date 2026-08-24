import { describe, expect, it } from 'vitest';
import {
  deriveOrderRoutingCurrentStage,
  evaluateOrderRouting,
  evaluateQueuedMoveTarget,
  orderRoutingStages,
  type OrderRoutingInput,
  type OrderRoutingStage,
  type OrderRoutingStageStatus,
  type OrderRoutingTargetCandidate,
} from './order-routing.ts';

const stageStatuses = (
  statuses: Partial<Record<OrderRoutingStage, OrderRoutingStageStatus>> = {},
  assignedWeightLbs = 40,
  capacityLbs = 100,
) =>
  orderRoutingStages.map((stage) => ({
    stage,
    status: statuses[stage] ?? 'planned',
    assignedWeightLbs,
    capacityLbs,
  }));

const target = (
  productionBatchId: string,
  sequence: number,
  input: Partial<OrderRoutingTargetCandidate> = {},
): OrderRoutingTargetCandidate => ({
  productionBatchId,
  sequence,
  status: 'queued',
  membershipFrozen: false,
  stages: stageStatuses(),
  ...input,
});

const dryerDeferral = (
  sourceSequence: number,
  candidates: readonly OrderRoutingTargetCandidate[],
): OrderRoutingInput => ({
  command: 'defer_or_rework',
  order: { productionOrderId: 'order-1', weightLbs: 25 },
  source: {
    productionBatchId: `batch-${sourceSequence}`,
    sequence: sourceSequence,
    status: 'drying',
    membershipFrozen: true,
  },
  currentStage: 'drying',
  currentStageStatus: 'started',
  restartStage: 'drying',
  targetCandidates: candidates,
});

describe('order routing policy', () => {
  it('derives the next required stage in the completed-stage gap', () => {
    const progress = deriveOrderRoutingCurrentStage({
      batchStatus: 'washing',
      stages: stageStatuses({ sorting: 'completed', washing: 'completed' }),
      attempts: orderRoutingStages.map((stage) => ({
        stage,
        status:
          stage === 'sorting' || stage === 'washing'
            ? ('completed' as const)
            : ('assigned' as const),
      })),
    });

    expect(progress).toEqual({
      tag: 'ok',
      value: { stage: 'drying', status: 'planned' },
    });
    if (progress.tag !== 'ok') return;
    expect(
      evaluateOrderRouting({
        ...dryerDeferral(1, [target('batch-2', 2)]),
        source: {
          productionBatchId: 'batch-1',
          sequence: 1,
          status: 'washing',
          membershipFrozen: true,
        },
        currentStage: progress.value.stage,
        currentStageStatus: progress.value.status,
      }),
    ).toMatchObject({
      decision: 'accepted',
      route: {
        currentStage: 'drying',
        releasedUnfinishedStages: ['drying', 'folding_packaging'],
      },
    });

    expect(
      deriveOrderRoutingCurrentStage({
        batchStatus: 'washing',
        stages: stageStatuses({ sorting: 'completed', washing: 'started' }),
        attempts: [
          { stage: 'sorting', status: 'completed' },
          { stage: 'washing', status: 'completed' },
          { stage: 'drying', status: 'assigned' },
          { stage: 'folding_packaging', status: 'assigned' },
        ],
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'SOURCE_ORDER_ATTEMPT_INCONSISTENT' },
    });
  });

  it('routes a dryer leave-behind from batch m to the earliest feasible m+1 suffix', () => {
    const later = target('batch-3', 3, {
      status: 'washing',
      membershipFrozen: true,
      stages: stageStatuses({ sorting: 'completed', washing: 'started' }),
    });
    const earliest = target('batch-2', 2, {
      status: 'washing',
      membershipFrozen: true,
      stages: stageStatuses({ sorting: 'completed', washing: 'started' }),
    });

    expect(evaluateOrderRouting(dryerDeferral(1, [later, earliest]))).toEqual({
      decision: 'accepted',
      command: 'defer_or_rework',
      wholeOrder: { productionOrderId: 'order-1', weightLbs: 25 },
      route: {
        sourceProductionBatchId: 'batch-1',
        sourceSequence: 1,
        targetProductionBatchId: 'batch-2',
        targetSequence: 2,
        currentStage: 'drying',
        restartStage: 'drying',
        releasedUnfinishedStages: ['drying', 'folding_packaging'],
        reworkStages: [],
        targetAssignments: [
          {
            stage: 'drying',
            sourceDisposition: 'release_unfinished',
            assignedWeightBeforeLbs: 40,
            assignedWeightAfterLbs: 65,
            capacityLbs: 100,
          },
          {
            stage: 'folding_packaging',
            sourceDisposition: 'release_unfinished',
            assignedWeightBeforeLbs: 40,
            assignedWeightAfterLbs: 65,
            capacityLbs: 100,
          },
        ],
      },
    });
  });

  it('supports a repeated same-stage deferral from m+1 to m+2 without mutating candidates', () => {
    const next = target('batch-3', 3, {
      status: 'washing',
      membershipFrozen: true,
      stages: stageStatuses({ sorting: 'completed', washing: 'started' }),
    });
    const before = structuredClone(next);

    const decision = evaluateOrderRouting(dryerDeferral(2, [next]));

    expect(decision).toMatchObject({
      decision: 'accepted',
      route: {
        sourceProductionBatchId: 'batch-2',
        targetProductionBatchId: 'batch-3',
        targetSequence: 3,
        restartStage: 'drying',
      },
    });
    expect(next).toEqual(before);
  });

  it('models dry-to-wash rework without erasing completed wash history', () => {
    const decision = evaluateOrderRouting({
      ...dryerDeferral(1, [target('batch-2', 2)]),
      restartStage: 'washing',
    });

    expect(decision).toMatchObject({
      decision: 'accepted',
      route: {
        releasedUnfinishedStages: ['drying', 'folding_packaging'],
        reworkStages: ['washing'],
        targetAssignments: [
          {
            stage: 'washing',
            sourceDisposition: 'preserve_completed_for_rework',
          },
          { stage: 'drying', sourceDisposition: 'release_unfinished' },
          {
            stage: 'folding_packaging',
            sourceDisposition: 'release_unfinished',
          },
        ],
      },
    });
  });

  it('requires exception routing to advance to a later batch', () => {
    expect(
      evaluateOrderRouting(
        dryerDeferral(2, [target('batch-1', 1), target('batch-2', 2)]),
      ),
    ).toEqual({
      decision: 'rejected',
      command: 'defer_or_rework',
      reason: {
        code: 'NO_LATER_TARGET',
        message: 'Deferral or rework requires a later production batch.',
      },
    });
  });

  it('rejects hard capacity across the complete routed suffix', () => {
    const overloaded = target('batch-2', 2, {
      stages: stageStatuses({}, 80, 100).map((stage) =>
        stage.stage === 'folding_packaging'
          ? { ...stage, assignedWeightLbs: 90 }
          : stage,
      ),
    });

    expect(evaluateOrderRouting(dryerDeferral(1, [overloaded]))).toMatchObject({
      decision: 'rejected',
      reason: { code: 'HARD_CAPACITY_EXCEEDED' },
    });
  });

  it('applies the whole order weight to every target stage in the requested suffix', () => {
    const decision = evaluateOrderRouting({
      ...dryerDeferral(1, [target('batch-2', 2)]),
      order: { productionOrderId: 'order-1', weightLbs: 17 },
      restartStage: 'washing',
    });

    expect(decision).toMatchObject({ decision: 'accepted' });
    if (decision.decision === 'accepted') {
      expect(
        decision.route.targetAssignments.map((stage) => stage.stage),
      ).toEqual(['washing', 'drying', 'folding_packaging']);
      expect(
        decision.route.targetAssignments.map(
          (stage) => stage.assignedWeightAfterLbs,
        ),
      ).toEqual([57, 57, 57]);
    }
  });

  it('keeps ordinary queued rebatching inside mutable queued batches', () => {
    const queuedMove: OrderRoutingInput = {
      command: 'queued_rebatch',
      order: { productionOrderId: 'order-1', weightLbs: 20 },
      source: {
        productionBatchId: 'batch-2',
        sequence: 2,
        status: 'queued',
        membershipFrozen: false,
      },
      currentStage: 'sorting',
      currentStageStatus: 'planned',
      restartStage: 'sorting',
      targetCandidates: [target('batch-3', 3), target('batch-1', 1)],
    };

    expect(evaluateOrderRouting(queuedMove)).toMatchObject({
      decision: 'accepted',
      route: { targetProductionBatchId: 'batch-1', targetSequence: 1 },
    });
    expect(
      evaluateOrderRouting({
        ...queuedMove,
        source: { ...queuedMove.source, membershipFrozen: true },
      }),
    ).toMatchObject({
      decision: 'rejected',
      reason: { code: 'QUEUED_REBATCH_SOURCE_FROZEN' },
    });
    expect(
      evaluateOrderRouting({
        ...queuedMove,
        source: {
          ...queuedMove.source,
          status: 'sorting',
          membershipFrozen: true,
        },
      }),
    ).toMatchObject({
      decision: 'rejected',
      reason: { code: 'QUEUED_REBATCH_SOURCE_NOT_QUEUED' },
    });
  });

  it('classifies each queued-move target with an exact server-owned denial', () => {
    const sourceProductionBatchId = 'batch-1';
    const evaluate = (
      candidate: OrderRoutingTargetCandidate,
      orderWeightLbs = 20,
    ) =>
      evaluateQueuedMoveTarget({
        sourceProductionBatchId,
        orderWeightLbs,
        target: candidate,
      });

    expect(evaluate(target(sourceProductionBatchId, 1))).toEqual({
      decision: 'blocked',
      code: 'TARGET_IS_SOURCE_BATCH',
    });
    expect(evaluate(target('batch-2', 2, { status: 'sorting' }))).toEqual({
      decision: 'blocked',
      code: 'TARGET_NOT_QUEUED',
    });
    expect(evaluate(target('batch-2', 2, { membershipFrozen: true }))).toEqual({
      decision: 'blocked',
      code: 'TARGET_MEMBERSHIP_FROZEN',
    });
    expect(
      evaluate(
        target('batch-2', 2, {
          stages: stageStatuses().slice(0, 3),
        }),
      ),
    ).toEqual({
      decision: 'blocked',
      code: 'TARGET_STAGE_GRAPH_INVALID',
    });
    expect(
      evaluate(
        target('batch-2', 2, {
          stages: stageStatuses({ washing: 'started' }),
        }),
      ),
    ).toEqual({
      decision: 'blocked',
      code: 'TARGET_STAGE_NOT_PLANNED',
    });
    expect(
      evaluate(
        target('batch-2', 2, {
          stages: stageStatuses({}, 85, 100),
        }),
      ),
    ).toEqual({
      decision: 'blocked',
      code: 'HARD_CAPACITY_EXCEEDED',
    });
    expect(evaluate(target('batch-2', 2))).toEqual({
      decision: 'allowed',
    });
  });

  it('rejects a restart that skips the order current required stage', () => {
    expect(
      evaluateOrderRouting({
        ...dryerDeferral(1, [target('batch-2', 2)]),
        currentStage: 'washing',
        source: {
          productionBatchId: 'batch-1',
          sequence: 1,
          status: 'washing',
          membershipFrozen: true,
        },
        restartStage: 'drying',
      }),
    ).toMatchObject({
      decision: 'rejected',
      reason: { code: 'RESTART_STAGE_SKIPS_REQUIRED_WORK' },
    });
  });
});
