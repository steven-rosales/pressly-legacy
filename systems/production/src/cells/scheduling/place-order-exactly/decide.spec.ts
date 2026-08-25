import { proveOperation } from '@pressly/testkit/operation-proof';
import { placeOrderExactlyCellDeclaration } from './cell.ts';
import { describe, expect, it, vi } from 'vitest';
import type {
  OnlinePlacementProposal,
  ProductionOrderPlacementContext,
} from '../../../model/online-order-placement/model.ts';
import { productionRules } from '../../../model/public.ts';
import { decidePlaceOrderExactly, placementFailureReason } from './decide.ts';
import type { PlaceOrderExactlyCommand } from './types.ts';

const ids = {
  run: '10000000-0000-4000-8000-000000000001',
  order: '10000000-0000-4000-8000-000000000002',
  batch: '10000000-0000-4000-8000-000000000003',
  existing: '10000000-0000-4000-8000-000000000004',
  actor: '10000000-0000-4000-8000-000000000005',
} as const;
const stages = ['sorting', 'washing', 'drying', 'folding_packaging'] as const;

const command: PlaceOrderExactlyCommand = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionBatchId: ids.batch,
  productionOrderId: ids.order,
  expectedQueueVersion: 4,
  expectedBatchVersion: 3,
  idempotencyKey: 'place-exact-1',
  actorId: ids.actor,
  authorizedAction: 'production:override',
};

const context = (): ProductionOrderPlacementContext => ({
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
      startsAt: '2026-08-22T12:00:00.000Z',
      shiftEndsAt: '2026-08-22T22:00:00.000Z',
      pulseMinutes: 60,
      pulseCapacityLbs: 100,
    },
    machines: [],
    batches: [
      {
        id: ids.batch,
        sequence: 0,
        status: 'queued',
        membershipFrozen: false,
        orderIds: [ids.existing],
        priorityOrderIds: [],
        derivedWeightLbs: 40,
        bagCount: 1,
        stages: stages.map((stage, index) => ({
          stage,
          startsAt: new Date(
            Date.parse('2026-08-22T12:00:00.000Z') + index * 60 * 60_000,
          ).toISOString(),
          endsAt: new Date(
            Date.parse('2026-08-22T12:00:00.000Z') + (index + 1) * 60 * 60_000,
          ).toISOString(),
          machineIds: [],
        })),
      },
    ],
  },
  runStatus: 'started',
  orderStatus: 'eligible',
  orderExecutionStatus: 'unassigned',
  orderVersion: 2,
  orderAlreadyAssigned: false,
  batchVersions: { [ids.batch]: 3 },
});

const proposal = (overtimeMinutes = 0): OnlinePlacementProposal => ({
  kind: 'proposed',
  algorithmVersion: 'online-stable-insertion-v1',
  inputSnapshotHash: 'a'.repeat(64),
  placementPlanHash: 'b'.repeat(64),
  canonicalPlacement: '{}',
  expectedQueueVersion: 4,
  target: { type: 'existing_batch', batchId: ids.batch, sequence: 0 },
  affectedFromSequence: 0,
  affectedBatches: [
    {
      sourceBatchId: ids.batch,
      sequence: 0,
      status: 'queued',
      membershipFrozen: false,
      orderIds: [ids.existing, ids.order],
      priorityOrderIds: [],
      derivedWeightLbs: 60,
      bagCount: 2,
      stages: context().input.batches[0]!.stages,
      changed: true,
    },
  ],
  projectedCompletionAt: '2026-08-22T16:00:00.000Z',
  overtime: {
    required: overtimeMinutes > 0,
    shiftEndsAt: '2026-08-22T22:00:00.000Z',
    overrunMinutes: overtimeMinutes,
  },
});

describe('place order exactly decision', () => {
  proveOperation({
    operationId: 'production.place-order-exactly.v1',
    declaration: placeOrderExactlyCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'binds exact target input and returns the canonical commit plan',
        proves: ['decision'],
        run: () => {
          const proposeOnlinePlacement = vi.fn(() => proposal());
          expect(
            decidePlaceOrderExactly({
              command,
              context: context(),
              policy: productionRules,
              proposeOnlinePlacement,
            }),
          ).toMatchObject({
            kind: 'commit',
            plan: {
              proposal: { placementPlanHash: 'b'.repeat(64) },
              orderLifecycle: {
                productionOrderId: ids.order,
                persistedState: 'unassigned',
                expectedVersion: 2,
                lifecycle: { from: 'unassigned', state: 'scheduled' },
              },
              initialBatchState: 'queued',
              initialStageState: 'planned',
              initialAttemptState: 'assigned',
            },
          });
          expect(proposeOnlinePlacement).toHaveBeenCalledWith(
            expect.objectContaining({
              mode: { type: 'manager_exact', targetBatchId: ids.batch },
            }),
          );
        },
      },
    ],
  });

  it('audits a stale or missing exact target before invoking the proposal', () => {
    const proposeOnlinePlacement = vi.fn(() => proposal());
    const facts = context();
    expect(
      decidePlaceOrderExactly({
        command,
        context: {
          ...facts,
          batchVersions: { [ids.batch]: 2 },
        },
        policy: productionRules,
        proposeOnlinePlacement,
      }),
    ).toEqual({
      kind: 'audit',
      proposal: null,
      result: {
        status: 'not_placed',
        mode: 'manager_exact',
        productionRunId: ids.run,
        productionOrderId: ids.order,
        reason: 'queue_conflict',
        message: 'The target batch changed before exact placement.',
        queueVersion: 4,
        replayed: false,
      },
    });
    expect(proposeOnlinePlacement).not.toHaveBeenCalled();
  });

  it('maps proposal rejection to durable not-placed data without preview', () => {
    expect(
      decidePlaceOrderExactly({
        command,
        context: context(),
        policy: productionRules,
        proposeOnlinePlacement: () => ({
          kind: 'rejected',
          algorithmVersion: 'online-stable-insertion-v1',
          inputSnapshotHash: 'a'.repeat(64),
          reason: {
            code: 'TARGET_BATCH_CAPACITY_EXCEEDED',
            message: 'Exact placement cannot override hard pulse capacity.',
          },
        }),
      }),
    ).toMatchObject({
      kind: 'audit',
      proposal: null,
      result: {
        status: 'not_placed',
        reason: 'hard_capacity_exceeded',
      },
    });
  });

  it('returns a hash- and queue-bound overtime confirmation result', () => {
    expect(
      decidePlaceOrderExactly({
        command,
        context: context(),
        policy: productionRules,
        proposeOnlinePlacement: () => proposal(35),
      }),
    ).toMatchObject({
      kind: 'audit',
      proposal: { placementPlanHash: 'b'.repeat(64) },
      result: {
        status: 'confirmation_required',
        mode: 'manager_exact',
        target: {
          kind: 'existing_batch',
          productionBatchId: ids.batch,
          sequence: 0,
        },
        affectedBatchIds: [ids.batch],
        queueVersion: 4,
        proposalHash: 'b'.repeat(64),
        overtimeMinutes: 35,
      },
    });
  });

  it('turns placement policy denials into visible not-placed outcomes', () => {
    const facts = context();
    expect(
      decidePlaceOrderExactly({
        command,
        context: {
          ...facts,
          input: {
            ...facts.input,
            run: { ...facts.input.run, queueVersion: 5 },
          },
        },
        policy: productionRules,
        proposeOnlinePlacement: () => ({
          ...proposal(),
          expectedQueueVersion: 5,
        }),
      }),
    ).toMatchObject({
      kind: 'audit',
      result: {
        status: 'not_placed',
        reason: 'queue_conflict',
        queueVersion: 5,
      },
    });
  });

  it('returns execution lifecycle failures as expected conflict data', () => {
    expect(
      decidePlaceOrderExactly({
        command,
        context: context(),
        policy: {
          ...productionRules,
          resolveProductionOrderExecutionState: () => ({
            tag: 'err',
            error: {
              code: 'PRODUCTION_ORDER_EXECUTION_STATE_INVALID',
              message: 'The production order execution state is invalid.',
            },
          }),
        },
        proposeOnlinePlacement: () => proposal(),
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_execution_state_invalid' },
    });
  });

  it('preserves the deployed fallback classification for unknown rejections', () => {
    expect(placementFailureReason('TARGET_BATCH_NOT_MUTABLE')).toBe(
      'no_mutable_position',
    );
  });
});
