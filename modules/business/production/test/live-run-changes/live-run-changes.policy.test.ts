import {
  productionLiveRunChangesSchema,
  type ProductionPendingOrder,
} from '@pressly/contracts';
import { describe, expect, it, vi } from 'vitest';
import { projectLiveRunChanges } from '../../src/load-production-workspace/live-run-changes.policy.ts';
import type {
  OnlinePlacementInput,
  OnlinePlacementProposal,
  ProductionOrderPlacementContext,
} from '../../src/scheduling/online-placement.port.ts';

const ids = {
  run: '00000000-0000-4000-8000-000000000001',
  order: '00000000-0000-4000-8000-000000000002',
  batchOne: '00000000-0000-4000-8000-000000000003',
  batchTwo: '00000000-0000-4000-8000-000000000004',
  batchFrozen: '00000000-0000-4000-8000-000000000005',
  batchActive: '00000000-0000-4000-8000-000000000006',
  priorityOrder: '00000000-0000-4000-8000-000000000007',
} as const;

const hash = (character: string) => character.repeat(64);

const batch = (
  id: string,
  sequence: number,
  derivedWeightLbs: number,
  options: Readonly<{
    status?: OnlinePlacementInput['batches'][number]['status'];
    frozen?: boolean;
  }> = {},
): OnlinePlacementInput['batches'][number] => ({
  id,
  sequence,
  status: options.status ?? 'queued',
  membershipFrozen: options.frozen ?? false,
  orderIds: [],
  priorityOrderIds: [],
  derivedWeightLbs,
  bagCount: 1,
  stages: [],
});

const context = (): ProductionOrderPlacementContext => ({
  input: {
    order: {
      id: ids.order,
      priority: false,
      derivedWeightLbs: 50,
      bagCount: 2,
      version: 7,
    },
    run: {
      id: ids.run,
      queueVersion: 4,
      startsAt: '2026-07-26T17:30:00.000Z',
      shiftEndsAt: '2026-07-27T04:00:00.000Z',
      pulseMinutes: 56,
      pulseCapacityLbs: 224,
    },
    machines: [],
    batches: [
      batch(ids.batchOne, 0, 100),
      batch(ids.batchFrozen, 1, 20, { frozen: true }),
      batch(ids.batchActive, 2, 20, { status: 'sorting' }),
      batch(ids.batchTwo, 3, 210),
    ],
    mode: { type: 'automatic' },
  },
  runStatus: 'started',
  orderStatus: 'eligible',
  orderExecutionStatus: 'unassigned',
  orderVersion: 7,
  orderAlreadyAssigned: false,
  batchVersions: {
    [ids.batchOne]: 3,
    [ids.batchFrozen]: 4,
    [ids.batchActive]: 5,
    [ids.batchTwo]: 8,
  },
});

const order = (): ProductionPendingOrder => ({
  id: ids.order,
  externalOrderId: 'Order TEST-ARRIVAL-001',
  dueAt: '2026-07-27T02:00:00.000Z',
  dueBucket: 'today',
  priority: false,
  derivedWeightLbs: 50,
  bagCount: 2,
  version: 7,
  placement: {
    status: 'awaiting_run',
    reason: 'automatic_placement_not_attempted',
    message: 'Placement is ready for manager review.',
  },
});

const proposal = (
  input: OnlinePlacementInput,
  overtime = false,
): OnlinePlacementProposal => {
  const targetBatchId =
    input.mode.type === 'manager_exact'
      ? input.mode.targetBatchId
      : ids.batchOne;
  const targetBatch = input.batches.find(
    (candidate) => candidate.id === targetBatchId,
  )!;

  return {
    kind: 'proposed',
    algorithmVersion: 'online-stable-insertion-v1',
    inputSnapshotHash: hash('a'),
    placementPlanHash: input.mode.type === 'automatic' ? hash('b') : hash('c'),
    canonicalPlacement: '{}',
    expectedQueueVersion: input.run.queueVersion,
    target: {
      type: 'existing_batch',
      batchId: targetBatch.id,
      sequence: targetBatch.sequence,
    },
    affectedFromSequence: targetBatch.sequence,
    affectedBatches: input.batches.map((candidate) => ({
      sourceBatchId: candidate.id,
      sequence: candidate.sequence,
      status: candidate.status,
      membershipFrozen: candidate.membershipFrozen,
      orderIds:
        candidate.id === targetBatch.id
          ? [...candidate.orderIds, input.order.id]
          : candidate.orderIds,
      priorityOrderIds: candidate.priorityOrderIds,
      derivedWeightLbs:
        candidate.id === targetBatch.id
          ? candidate.derivedWeightLbs + input.order.derivedWeightLbs
          : candidate.derivedWeightLbs,
      bagCount:
        candidate.id === targetBatch.id
          ? candidate.bagCount + input.order.bagCount
          : candidate.bagCount,
      stages: candidate.stages,
      changed: candidate.id === targetBatch.id,
    })),
    projectedCompletionAt: overtime
      ? '2026-07-27T05:00:00.000Z'
      : '2026-07-27T03:00:00.000Z',
    overtime: {
      required: overtime,
      shiftEndsAt: input.run.shiftEndsAt,
      overrunMinutes: overtime ? 60 : 0,
    },
  };
};

describe('live run changes projection', () => {
  it('publishes only exact targets authorized by the server scheduler', () => {
    const proposeOnlinePlacement = vi.fn((input: OnlinePlacementInput) => {
      if (input.mode.type === 'automatic') return proposal(input);
      const targetBatchId = input.mode.targetBatchId;
      const target = input.batches.find(
        (candidate) => candidate.id === targetBatchId,
      );
      const rejection = (code: string, message: string) => ({
        kind: 'rejected' as const,
        algorithmVersion: 'online-stable-insertion-v1' as const,
        inputSnapshotHash: hash('d'),
        reason: { code, message },
      });
      if (target === undefined)
        return rejection(
          'TARGET_BATCH_NOT_FOUND',
          'The target batch is not part of this run.',
        );
      if (target.membershipFrozen || target.status !== 'queued')
        return rejection(
          'TARGET_BATCH_NOT_MUTABLE',
          'The target batch is not mutable.',
        );
      if (
        target.derivedWeightLbs + input.order.derivedWeightLbs >
        input.run.pulseCapacityLbs
      )
        return rejection(
          'TARGET_BATCH_CAPACITY_EXCEEDED',
          'The target batch cannot accept the whole order.',
        );
      return proposal(input);
    });

    const output = projectLiveRunChanges({
      runId: ids.run,
      queueVersion: 4,
      pulseCapacityLbs: 224,
      orders: [{ order: order(), context: context() }],
      scheduler: { proposeOnlinePlacement },
    });

    expect(output.orders[0]).toMatchObject({
      recommendedPlacement: {
        status: 'available',
        placement: {
          target: {
            kind: 'existing_batch',
            productionBatchId: ids.batchOne,
          },
          expectedQueueVersion: 4,
          expectedOrderVersion: 7,
          expectedBatchVersion: 3,
          capacity: { beforeLbs: 100, afterLbs: 150, limitLbs: 224 },
          allowedActions: ['place_automatically'],
        },
      },
      exactBatchTargets: [
        {
          target: { productionBatchId: ids.batchOne },
          expectedBatchVersion: 3,
          allowedActions: ['place_exactly'],
        },
      ],
    });
    expect(proposeOnlinePlacement).toHaveBeenCalledTimes(5);
    expect(productionLiveRunChangesSchema.parse(output)).toEqual(output);
  });

  it('orders ready work and exact targets deterministically', () => {
    const safeBatches = [
      batch(ids.batchTwo, 1, 20),
      batch(ids.batchOne, 0, 30),
    ];
    const ordinaryOrder = order();
    const priorityOrder: ProductionPendingOrder = {
      ...order(),
      id: ids.priorityOrder,
      externalOrderId: 'Order TEST-ARRIVAL-002',
      priority: true,
      dueAt: '2026-07-27T03:00:00.000Z',
    };
    const placementContext = (
      pending: ProductionPendingOrder,
    ): ProductionOrderPlacementContext => {
      const base = context();
      return {
        ...base,
        input: {
          ...base.input,
          order: {
            ...base.input.order,
            id: pending.id,
            priority: pending.priority,
          },
          batches: safeBatches,
        },
        batchVersions: { [ids.batchOne]: 3, [ids.batchTwo]: 8 },
      };
    };

    const output = projectLiveRunChanges({
      runId: ids.run,
      queueVersion: 4,
      pulseCapacityLbs: 224,
      orders: [
        {
          order: ordinaryOrder,
          context: placementContext(ordinaryOrder),
        },
        {
          order: priorityOrder,
          context: placementContext(priorityOrder),
        },
      ],
      scheduler: { proposeOnlinePlacement: (input) => proposal(input) },
    });

    expect(output.orders.map((pending) => pending.id)).toEqual([
      ids.priorityOrder,
      ids.order,
    ]);
    expect(
      output.orders.map((pending) =>
        pending.exactBatchTargets.map((target) => target.target.sequence),
      ),
    ).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });

  it('exposes confirmation only for the matching durable overtime proposal', () => {
    const pending = order();
    pending.placement = {
      status: 'confirmation_required',
      mode: 'automatic',
      productionRunId: ids.run,
      target: {
        kind: 'existing_batch',
        productionBatchId: ids.batchOne,
        sequence: 0,
      },
      affectedBatchIds: [ids.batchOne],
      queueVersion: 4,
      proposalHash: hash('b'),
      projectedCompletionAt: '2026-07-27T05:00:00.000Z',
      overtimeMinutes: 60,
    };
    const overtimeContext = context();
    const safeOvertimeContext: ProductionOrderPlacementContext = {
      ...overtimeContext,
      input: {
        ...overtimeContext.input,
        batches: [batch(ids.batchOne, 0, 100)],
      },
      batchVersions: { [ids.batchOne]: 3 },
    };

    const output = projectLiveRunChanges({
      runId: ids.run,
      queueVersion: 4,
      pulseCapacityLbs: 224,
      orders: [{ order: pending, context: safeOvertimeContext }],
      scheduler: { proposeOnlinePlacement: (input) => proposal(input, true) },
    });

    expect(
      output.orders[0]?.recommendedPlacement.status === 'available'
        ? output.orders[0].recommendedPlacement.placement.allowedActions
        : [],
    ).toEqual(['confirm_overtime']);
    expect(output.orders[0]?.exactBatchTargets[0]?.allowedActions).toEqual([
      'place_exactly',
    ]);
  });
});
