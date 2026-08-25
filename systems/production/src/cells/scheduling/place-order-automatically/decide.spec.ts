import { proveOperation } from '@pressly/testkit/operation-proof';
import { placeOrderAutomaticallyCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import type {
  OnlinePlacementProposal,
  ProductionOrderPlacementContext,
} from '../../../model/online-order-placement/model.ts';
import { productionRules } from '../../../model/public.ts';
import {
  decidePlaceOrderAutomatically,
  productionPlacementFailureReason,
} from './decide.ts';
import type { PlaceProductionOrderAutomaticallyCommand } from './types.ts';

const ids = {
  run: '53000000-0000-4000-8000-000000000001',
  order: '53000000-0000-4000-8000-000000000002',
  batch: '53000000-0000-4000-8000-000000000003',
} as const;
const command: PlaceProductionOrderAutomaticallyCommand = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionOrderId: ids.order,
  expectedQueueVersion: 4,
  idempotencyKey: 'place-automatic-1',
  actorId: 'actor-1',
  authorizedAction: 'production:override',
};
const context: ProductionOrderPlacementContext = {
  input: {
    order: {
      id: ids.order,
      priority: false,
      derivedWeightLbs: 20,
      bagCount: 1,
      version: 2,
    },
    run: {
      id: ids.run,
      queueVersion: 4,
      startsAt: '2026-08-22T13:00:00.000Z',
      shiftEndsAt: '2026-08-22T21:00:00.000Z',
      pulseMinutes: 56,
      pulseCapacityLbs: 100,
    },
    machines: [],
    batches: [],
  },
  runStatus: 'started',
  orderStatus: 'eligible',
  orderExecutionStatus: 'unassigned',
  orderVersion: 2,
  orderAlreadyAssigned: false,
  batchVersions: {},
};
const proposal = (overtimeMinutes = 0): OnlinePlacementProposal => ({
  kind: 'proposed',
  algorithmVersion: 'online-stable-insertion-v1',
  inputSnapshotHash: 'a'.repeat(64),
  placementPlanHash: 'b'.repeat(64),
  canonicalPlacement: '{}',
  expectedQueueVersion: 4,
  target: { type: 'new_batch', insertAtSequence: 0 },
  affectedFromSequence: 0,
  affectedBatches: [
    {
      sourceBatchId: null,
      sequence: 0,
      status: 'queued',
      membershipFrozen: false,
      orderIds: [ids.order],
      priorityOrderIds: [],
      derivedWeightLbs: 20,
      bagCount: 1,
      stages: [],
      changed: true,
    },
  ],
  projectedCompletionAt: '2026-08-22T21:15:00.000Z',
  overtime: {
    required: overtimeMinutes > 0,
    shiftEndsAt: context.input.run.shiftEndsAt,
    overrunMinutes: overtimeMinutes,
  },
});

describe('place-order-automatically decision', () => {
  proveOperation({
    operationId: 'production.place-order-automatically.v1',
    declaration: placeOrderAutomaticallyCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'commits the target model execution transition',
        proves: ['decision'],
        run: () => {
          expect(
            decidePlaceOrderAutomatically({
              command,
              context,
              proposal: proposal(),
              policy: productionRules,
            }),
          ).toMatchObject({
            kind: 'commit',
            orderLifecycle: {
              productionOrderId: ids.order,
              persistedState: 'unassigned',
              expectedVersion: 2,
              lifecycle: { from: 'unassigned', state: 'scheduled' },
            },
          });
        },
      },
    ],
  });

  it('records deterministic proposal rejection as not placed', () => {
    expect(
      decidePlaceOrderAutomatically({
        command,
        context,
        proposal: {
          kind: 'rejected',
          algorithmVersion: 'online-stable-insertion-v1',
          inputSnapshotHash: 'a'.repeat(64),
          reason: {
            code: 'ORDER_EXCEEDS_PULSE_CAPACITY',
            message: 'The whole order is too heavy.',
          },
        },
        policy: productionRules,
      }),
    ).toEqual({
      kind: 'record',
      proposal: null,
      result: {
        status: 'not_placed',
        mode: 'automatic',
        productionRunId: ids.run,
        productionOrderId: ids.order,
        reason: 'hard_capacity_exceeded',
        message: 'The whole order is too heavy.',
        queueVersion: 4,
        replayed: false,
      },
    });
  });

  it('persists a version-bound overtime confirmation requirement', () => {
    expect(
      decidePlaceOrderAutomatically({
        command,
        context,
        proposal: proposal(15),
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'record',
      proposal: { placementPlanHash: 'b'.repeat(64) },
      result: {
        status: 'confirmation_required',
        mode: 'automatic',
        queueVersion: 4,
        proposalHash: 'b'.repeat(64),
        overtimeMinutes: 15,
        replayed: false,
      },
    });
  });

  it.each([
    [{ ...context, runStatus: 'completed' }, 'run_not_started'],
    [{ ...context, orderStatus: 'scheduled' }, 'order_not_eligible'],
    [{ ...context, orderAlreadyAssigned: true }, 'order_already_scheduled'],
    [
      {
        ...context,
        input: {
          ...context.input,
          run: { ...context.input.run, queueVersion: 5 },
        },
      },
      'queue_conflict',
    ],
  ] as const)('records policy rejection as %s', (facts, reason) => {
    expect(
      decidePlaceOrderAutomatically({
        command,
        context: facts,
        proposal: proposal(),
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'record',
      result: { status: 'not_placed', reason },
    });
  });

  it.each([
    ['corrupt', 'production_order_execution_state_invalid'],
    ['scheduled', 'production_order_execution_event_not_allowed'],
  ] as const)('rejects execution state %s', (executionStatus, code) => {
    expect(
      decidePlaceOrderAutomatically({
        command,
        context: { ...context, orderExecutionStatus: executionStatus },
        proposal: proposal(),
        policy: productionRules,
      }),
    ).toMatchObject({ kind: 'reject', failure: { code } });
  });

  it('retains every deployed failure-reason mapping', () => {
    expect(
      [
        'PRODUCTION_RUN_NOT_STARTED',
        'PRODUCTION_RUN_COMPLETED',
        'ORDER_NOT_ELIGIBLE',
        'ORDER_ALREADY_PLACED',
        'QUEUE_VERSION_CONFLICT',
        'OVERTIME_CONFIRMATION_STALE',
        'ORDER_EXCEEDS_PULSE_CAPACITY',
        'TARGET_BATCH_CAPACITY_EXCEEDED',
        'BATCH_CAPACITY_EXCEEDED',
        'TARGET_BATCH_NOT_MUTABLE',
      ].map(productionPlacementFailureReason),
    ).toEqual([
      'run_not_started',
      'run_completed',
      'order_not_eligible',
      'order_already_scheduled',
      'queue_conflict',
      'proposal_stale',
      'hard_capacity_exceeded',
      'hard_capacity_exceeded',
      'hard_capacity_exceeded',
      'no_mutable_position',
    ]);
  });
});
