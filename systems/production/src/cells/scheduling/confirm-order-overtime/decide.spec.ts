import { proveOperation } from '@pressly/testkit/operation-proof';
import { confirmOrderOvertimeCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import type {
  OnlinePlacementProposal,
  ProductionOrderPlacementContext,
} from '../../../model/online-order-placement/model.ts';
import { productionRules } from '../../../model/public.ts';
import {
  decideConfirmOrderOvertime,
  placementModeFromStoredOvertime,
} from './decide.ts';
import type {
  ConfirmOrderOvertimePolicy,
  ConfirmProductionOrderOvertimeCommand,
  StoredOvertimeProposal,
} from './types.ts';

const ids = {
  run: '66000000-0000-4000-8000-000000000001',
  order: '66000000-0000-4000-8000-000000000002',
  batch: '66000000-0000-4000-8000-000000000003',
} as const;
const hash = 'a'.repeat(64);
const command: ConfirmProductionOrderOvertimeCommand = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionOrderId: ids.order,
  expectedQueueVersion: 4,
  proposalHash: hash,
  idempotencyKey: 'confirm-overtime-1',
  actorId: 'actor-1',
  authorizedAction: 'production:override',
};
const stored: StoredOvertimeProposal = {
  mode: 'automatic',
  targetBatchId: null,
  proposalHash: hash,
  queueVersion: 4,
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
      shiftEndsAt: '2026-08-22T22:00:00.000Z',
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
const proposal = (
  input: { proposalHash?: string; queueVersion?: number } = {},
) =>
  ({
    kind: 'proposed',
    algorithmVersion: 'online-stable-insertion-v1',
    inputSnapshotHash: 'b'.repeat(64),
    placementPlanHash: input.proposalHash ?? hash,
    canonicalPlacement: '{}',
    expectedQueueVersion: input.queueVersion ?? 4,
    target: { type: 'existing_batch', batchId: ids.batch, sequence: 1 },
    affectedFromSequence: 1,
    affectedBatches: [
      {
        sourceBatchId: ids.batch,
        sequence: 1,
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
    projectedCompletionAt: '2026-08-22T22:15:00.000Z',
    overtime: {
      required: true,
      shiftEndsAt: '2026-08-22T22:00:00.000Z',
      overrunMinutes: 15,
    },
  }) satisfies OnlinePlacementProposal;

describe('confirm-order-overtime decision', () => {
  proveOperation({
    operationId: 'production.confirm-order-overtime.v1',
    declaration: confirmOrderOvertimeCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'recovers automatic or exact mode only from stored proposal provenance',
        proves: ['decision'],
        run: () => {
          expect(placementModeFromStoredOvertime(null)).toEqual({
            type: 'automatic',
          });
          expect(placementModeFromStoredOvertime(stored)).toEqual({
            type: 'automatic',
          });
          expect(
            placementModeFromStoredOvertime({
              ...stored,
              mode: 'manager_exact',
              targetBatchId: ids.batch,
            }),
          ).toEqual({ type: 'manager_exact', targetBatchId: ids.batch });
          expect(
            placementModeFromStoredOvertime({
              ...stored,
              mode: 'manager_exact',
              targetBatchId: null,
            }),
          ).toEqual({ type: 'automatic' });
        },
      },
    ],
  });

  it.each([
    ['automatic', { type: 'automatic' }],
    ['manager_exact', { type: 'manager_exact', targetBatchId: ids.batch }],
  ] as const)('commits matching %s confirmation', (_name, mode) => {
    const storedForMode: StoredOvertimeProposal = {
      ...stored,
      mode: mode.type,
      targetBatchId: mode.type === 'manager_exact' ? mode.targetBatchId : null,
    };
    expect(
      decideConfirmOrderOvertime({
        command,
        storedOvertime: storedForMode,
        mode,
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
  });

  it.each([
    ['missing stored proposal', null, proposal()],
    ['stored queue mismatch', { ...stored, queueVersion: 3 }, proposal()],
    [
      'stored hash mismatch',
      { ...stored, proposalHash: 'c'.repeat(64) },
      proposal(),
    ],
    [
      'recomputed hash mismatch',
      stored,
      proposal({ proposalHash: 'c'.repeat(64) }),
    ],
  ] as const)('records %s as stale', (_name, storedOvertime, recomputed) => {
    expect(
      decideConfirmOrderOvertime({
        command,
        storedOvertime,
        mode: { type: 'automatic' },
        context,
        proposal: recomputed,
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'record',
      result: { status: 'not_placed', reason: 'proposal_stale' },
    });
  });

  it('preserves proposal rejection before stale stored-proposal checks', () => {
    expect(
      decideConfirmOrderOvertime({
        command,
        storedOvertime: null,
        mode: { type: 'automatic' },
        context,
        proposal: {
          kind: 'rejected',
          algorithmVersion: 'online-stable-insertion-v1',
          inputSnapshotHash: 'b'.repeat(64),
          reason: {
            code: 'TARGET_BATCH_NOT_MUTABLE',
            message: 'The target is no longer mutable.',
          },
        },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'record',
      proposal: null,
      result: {
        status: 'not_placed',
        reason: 'no_mutable_position',
      },
    });
  });

  it('records policy queue conflict after a matching recomputation', () => {
    expect(
      decideConfirmOrderOvertime({
        command,
        storedOvertime: stored,
        mode: { type: 'automatic' },
        context: {
          ...context,
          input: {
            ...context.input,
            run: { ...context.input.run, queueVersion: 5 },
          },
        },
        proposal: proposal({ queueVersion: 5 }),
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'record',
      result: { status: 'not_placed', reason: 'queue_conflict' },
    });
  });

  it('retains the post-commit unresolved-confirmation branch', () => {
    const policy = {
      ...productionRules,
      evaluatePlacementCommit: () => ({
        tag: 'err' as const,
        error: {
          code: 'OVERTIME_CONFIRMATION_REQUIRED',
          message: 'Confirmation is still required.',
        },
      }),
    } satisfies ConfirmOrderOvertimePolicy;
    expect(
      decideConfirmOrderOvertime({
        command,
        storedOvertime: stored,
        mode: { type: 'automatic' },
        context,
        proposal: proposal(),
        policy,
      }),
    ).toMatchObject({
      kind: 'record',
      result: { status: 'confirmation_required' },
    });
  });

  it.each([
    ['corrupt', 'production_order_execution_state_invalid'],
    ['scheduled', 'production_order_execution_event_not_allowed'],
  ] as const)('rejects execution state %s', (executionStatus, code) => {
    expect(
      decideConfirmOrderOvertime({
        command,
        storedOvertime: stored,
        mode: { type: 'automatic' },
        context: { ...context, orderExecutionStatus: executionStatus },
        proposal: proposal(),
        policy: productionRules,
      }),
    ).toMatchObject({ kind: 'reject', failure: { code } });
  });
});
