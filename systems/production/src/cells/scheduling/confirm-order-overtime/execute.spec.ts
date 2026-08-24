import type { CellOutcome } from '@pressly/cells';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { confirmOrderOvertimeCellDeclaration } from './cell.ts';
import type {
  OnlinePlacementMode,
  OnlinePlacementProposal,
  OnlinePlacementResult,
  ProductionOrderPlacementContext,
} from '../../../model/online-order-placement/model.ts';
import { productionRules } from '../../../model/public.ts';
import {
  makeExecuteConfirmOrderOvertime,
  type ConfirmOrderOvertimeRepository,
  type ConfirmOrderOvertimeSignals,
  type ConfirmOrderOvertimeTransactionRepository,
} from './execute.ts';
import {
  confirmOrderOvertimeIdempotency,
  serializeConfirmOrderOvertimeWorkEventCommand,
  type StoredConfirmOrderOvertimeWorkEvent,
} from './idempotency.ts';
import type {
  ConfirmOrderOvertimeExpectedFailure,
  ConfirmOrderOvertimePolicy,
  ConfirmOrderOvertimeTransactionResult,
  ConfirmProductionOrderOvertimeCommand,
  ConfirmedProductionOrderPlacedResult,
  StoredOvertimeProposal,
} from './types.ts';

const ids = {
  run: '67000000-0000-4000-8000-000000000001',
  order: '67000000-0000-4000-8000-000000000002',
  batch: '67000000-0000-4000-8000-000000000003',
} as const;
const hash = 'a'.repeat(64);
const now = new Date('2026-08-22T15:00:00.000Z');
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
const storedProposal = (
  mode: OnlinePlacementMode = { type: 'automatic' },
): StoredOvertimeProposal => ({
  mode: mode.type,
  targetBatchId: mode.type === 'manager_exact' ? mode.targetBatchId : null,
  proposalHash: hash,
  queueVersion: 4,
});
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
const proposal = (input: { hash?: string; queueVersion?: number } = {}) =>
  ({
    kind: 'proposed',
    algorithmVersion: 'online-stable-insertion-v1',
    inputSnapshotHash: 'b'.repeat(64),
    placementPlanHash: input.hash ?? hash,
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
const placed = (
  mode: OnlinePlacementMode = { type: 'automatic' },
): ConfirmedProductionOrderPlacedResult => ({
  status: 'placed',
  mode: mode.type,
  productionRunId: ids.run,
  productionOrderId: ids.order,
  productionBatchId: ids.batch,
  createdBatch: false,
  affectedBatchIds: [ids.batch],
  queueVersion: 5,
  proposalHash: hash,
  plannedCompletionAt: '2026-08-22T22:15:00.000Z',
  overtimeMinutes: 15,
  replayed: false,
});

const storedResult = (
  result: ConfirmOrderOvertimeTransactionResult,
  mode: OnlinePlacementMode = { type: 'automatic' },
): StoredConfirmOrderOvertimeWorkEvent => ({
  command: serializeConfirmOrderOvertimeWorkEventCommand({
    operation: 'production_order_overtime_confirmed',
    locationId: command.locationId,
    actorId: command.actorId,
    target: {
      entityType: 'production_order',
      entityId: command.productionOrderId,
    },
    expectedVersion: command.expectedQueueVersion,
    payload: {
      expectedQueueVersion: command.expectedQueueVersion,
      authorizedAction: command.authorizedAction,
      mode: mode.type,
      ...(mode.type === 'manager_exact'
        ? { productionBatchId: mode.targetBatchId }
        : {}),
      proposalHash: command.proposalHash,
    },
  }),
  result: result as never,
  valid: true,
});

type HarnessInput = Readonly<{
  storedOvertime?: StoredOvertimeProposal | null;
  context?: ProductionOrderPlacementContext | null;
  proposal?: OnlinePlacementResult;
  replayReads?: readonly (StoredConfirmOrderOvertimeWorkEvent | null)[];
  commit?: CellOutcome<
    ConfirmedProductionOrderPlacedResult,
    ConfirmOrderOvertimeExpectedFailure
  >;
  policy?: ConfirmOrderOvertimePolicy;
  appendError?: unknown;
}>;

const makeHarness = (input: HarnessInput = {}) => {
  const calls: string[] = [];
  const storedOvertime =
    input.storedOvertime === undefined
      ? storedProposal()
      : input.storedOvertime;
  const currentContext = input.context === undefined ? context : input.context;
  const currentProposal = input.proposal ?? proposal();
  const replayReads = [...(input.replayReads ?? [null, null])];
  const findOvertimeProposal = vi.fn(async () => {
    calls.push('stored-proposal-read');
    return storedOvertime;
  });
  const findWorkEvent = vi.fn(async () => {
    calls.push('replay-read');
    return replayReads.shift() ?? null;
  });
  const loadContext = vi.fn(async () => {
    calls.push('load-context');
    return currentContext;
  });
  const recordOutcome = vi.fn(async () => {
    calls.push('record-outcome');
  });
  const commitPlacement = vi.fn(async () => {
    calls.push('commit-placement');
    return input.commit ?? { kind: 'success' as const, value: placed() };
  });
  const appendWorkEvent = vi.fn(async () => {
    calls.push('append-event');
    if (input.appendError !== undefined) throw input.appendError;
  });
  const operations: ConfirmOrderOvertimeTransactionRepository<StoredConfirmOrderOvertimeWorkEvent> =
    {
      findWorkEvent,
      loadContext,
      recordOutcome,
      commitPlacement,
      appendWorkEvent,
    };
  const repository: ConfirmOrderOvertimeRepository<StoredConfirmOrderOvertimeWorkEvent> =
    {
      findOvertimeProposal,
      transaction: async (work) => {
        calls.push('placement-transaction-begin');
        try {
          const outcome = await work(operations);
          calls.push('placement-transaction-commit');
          return outcome;
        } catch (error) {
          calls.push('placement-transaction-rollback');
          throw error;
        }
      },
    };
  const placementOutcome = vi.fn(() => calls.push('signal:placement'));
  const queueConflict = vi.fn(() => calls.push('signal:queue'));
  const overtimeConfirmed = vi.fn(() => calls.push('signal:overtime'));
  const signals: ConfirmOrderOvertimeSignals = {
    placementOutcome,
    queueConflict,
    overtimeConfirmed,
  };
  const proposeOnlinePlacement = vi.fn(() => {
    calls.push('propose');
    return currentProposal;
  });
  const execute = makeExecuteConfirmOrderOvertime({
    repo: repository,
    idempotency: confirmOrderOvertimeIdempotency,
    policy: input.policy ?? productionRules,
    proposeOnlinePlacement,
    clock: {
      now: () => {
        calls.push('clock');
        return new Date(now);
      },
    },
    signals,
  });
  return {
    execute,
    calls,
    findOvertimeProposal,
    findWorkEvent,
    loadContext,
    recordOutcome,
    commitPlacement,
    appendWorkEvent,
    proposeOnlinePlacement,
    placementOutcome,
    queueConflict,
    overtimeConfirmed,
  };
};

describe('confirm-order-overtime executor', () => {
  proveOperation({
    operationId: 'production.confirm-order-overtime.v1',
    declaration: confirmOrderOvertimeCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'commits matching automatic confirmation and signals after commit',
        proves: ['executor-success'],
        run: async () => {
          const mode = { type: 'automatic' } as const;
          const harness = makeHarness({
            storedOvertime: storedProposal(mode),
            commit: { kind: 'success', value: placed(mode) },
          });
          await expect(harness.execute(command)).resolves.toMatchObject({
            kind: 'success',
            value: { status: 'placed', mode: mode.type, replayed: false },
          });
          expect(harness.proposeOnlinePlacement).toHaveBeenCalledWith({
            ...context.input,
            mode,
          });
          expect(harness.commitPlacement).toHaveBeenCalledWith(
            expect.objectContaining({
              mode,
              overtimeConfirmed: true,
              now,
            }),
          );
          expect(harness.calls.indexOf('stored-proposal-read')).toBeLessThan(
            harness.calls.indexOf('replay-read'),
          );
          expect(harness.calls.indexOf('signal:placement')).toBeGreaterThan(
            harness.calls.indexOf('placement-transaction-commit'),
          );
          expect(harness.calls.slice(-2)).toEqual([
            'signal:placement',
            'signal:overtime',
          ]);
        },
      },
    ],
  });

  it.each([
    ['manager_exact', { type: 'manager_exact', targetBatchId: ids.batch }],
  ] as const)(
    'commits matching %s confirmation and signals after commit',
    async (_name, mode) => {
      const harness = makeHarness({
        storedOvertime: storedProposal(mode),
        commit: { kind: 'success', value: placed(mode) },
      });
      await expect(harness.execute(command)).resolves.toMatchObject({
        kind: 'success',
        value: { status: 'placed', mode: mode.type, replayed: false },
      });
      expect(harness.proposeOnlinePlacement).toHaveBeenCalledWith({
        ...context.input,
        mode,
      });
      expect(harness.commitPlacement).toHaveBeenCalledWith(
        expect.objectContaining({
          mode,
          overtimeConfirmed: true,
          now,
        }),
      );
      expect(harness.calls.indexOf('stored-proposal-read')).toBeLessThan(
        harness.calls.indexOf('replay-read'),
      );
      expect(harness.calls.indexOf('signal:placement')).toBeGreaterThan(
        harness.calls.indexOf('placement-transaction-commit'),
      );
      expect(harness.calls.slice(-2)).toEqual([
        'signal:placement',
        'signal:overtime',
      ]);
    },
  );

  it('never performs a replay lookup before the unlocked stored-proposal read', async () => {
    const harness = makeHarness({ replayReads: [storedResult(placed())] });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: { replayed: true },
    });
    expect(harness.calls[0]).toBe('stored-proposal-read');
    expect(harness.calls.indexOf('stored-proposal-read')).toBeLessThan(
      harness.calls.indexOf('placement-transaction-begin'),
    );
    expect(harness.calls.indexOf('placement-transaction-begin')).toBeLessThan(
      harness.calls.indexOf('replay-read'),
    );
    expect(harness.loadContext).not.toHaveBeenCalled();
    expect(harness.proposeOnlinePlacement).not.toHaveBeenCalled();
    expect(harness.placementOutcome).not.toHaveBeenCalled();
    expect(harness.overtimeConfirmed).not.toHaveBeenCalled();
  });

  it('replays after locked context without proposal, mutation, or signals', async () => {
    const harness = makeHarness({
      replayReads: [null, storedResult(placed())],
    });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: { status: 'placed', replayed: true },
    });
    expect(harness.loadContext).toHaveBeenCalledOnce();
    expect(harness.proposeOnlinePlacement).not.toHaveBeenCalled();
    expect(harness.commitPlacement).not.toHaveBeenCalled();
    expect(harness.placementOutcome).not.toHaveBeenCalled();
  });

  it('rejects divergent confirmation identity after stored-proposal lookup', async () => {
    const divergent = storedResult(placed());
    const harness = makeHarness({
      replayReads: [
        { ...divergent, command: { ...divergent.command, expectedVersion: 5 } },
      ],
    });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_idempotency_conflict' },
    });
    expect(harness.findOvertimeProposal).toHaveBeenCalledOnce();
    expect(harness.loadContext).not.toHaveBeenCalled();
  });

  it.each([
    ['missing stored proposal', null, proposal()],
    [
      'recomputed mismatch',
      storedProposal(),
      proposal({ hash: 'c'.repeat(64) }),
    ],
    [
      'stored queue mismatch',
      { ...storedProposal(), queueVersion: 3 },
      proposal(),
    ],
  ] as const)(
    'records %s as not placed',
    async (_name, storedOvertime, recomputed) => {
      const harness = makeHarness({
        storedOvertime,
        proposal: recomputed,
      });
      await expect(harness.execute(command)).resolves.toMatchObject({
        kind: 'success',
        value: { status: 'not_placed', reason: 'proposal_stale' },
      });
      expect(harness.recordOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          pendingPlacement: expect.objectContaining({
            status: 'not_placed',
            reason: 'proposal_stale',
          }),
        }),
      );
      expect(harness.commitPlacement).not.toHaveBeenCalled();
      expect(harness.placementOutcome).toHaveBeenCalledWith({
        status: 'not_placed',
        mode: 'automatic',
        reason: 'proposal_stale',
      });
      expect(harness.overtimeConfirmed).not.toHaveBeenCalled();
    },
  );

  it('records proposal rejection before stale lookup semantics', async () => {
    const harness = makeHarness({
      storedOvertime: null,
      proposal: {
        kind: 'rejected',
        algorithmVersion: 'online-stable-insertion-v1',
        inputSnapshotHash: 'b'.repeat(64),
        reason: {
          code: 'TARGET_BATCH_NOT_MUTABLE',
          message: 'The target is no longer mutable.',
        },
      },
    });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: { status: 'not_placed', reason: 'no_mutable_position' },
    });
    expect(harness.appendWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: null }),
    );
  });

  it('signals a current queue conflict after the placement transaction', async () => {
    const harness = makeHarness({
      context: {
        ...context,
        input: {
          ...context.input,
          run: { ...context.input.run, queueVersion: 5 },
        },
      },
      proposal: proposal({ queueVersion: 5 }),
    });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: { status: 'not_placed', reason: 'queue_conflict' },
    });
    expect(harness.calls.slice(-2)).toEqual([
      'signal:placement',
      'signal:queue',
    ]);
    expect(harness.overtimeConfirmed).not.toHaveBeenCalled();
  });

  it('commits unresolved confirmation evidence, then preserves the invariant error and signal silence', async () => {
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
    const harness = makeHarness({ policy });
    await expect(harness.execute(command)).rejects.toMatchObject({
      code: 'production_overtime_confirmation_unresolved',
      status: 500,
    });
    expect(harness.calls).toContain('placement-transaction-commit');
    expect(harness.recordOutcome).toHaveBeenCalled();
    expect(harness.appendWorkEvent).toHaveBeenCalled();
    expect(harness.placementOutcome).not.toHaveBeenCalled();
    expect(harness.overtimeConfirmed).not.toHaveBeenCalled();
  });

  it('returns late typed CAS conflict without event or signals', async () => {
    const harness = makeHarness({
      commit: {
        kind: 'failure',
        failure: {
          kind: 'conflict',
          code: 'production_placement_queue_version_conflict',
          message: 'The queue changed.',
          safeMessage: 'Production state changed. Refresh and try again.',
        },
      },
    });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_placement_queue_version_conflict' },
    });
    expect(harness.appendWorkEvent).not.toHaveBeenCalled();
    expect(harness.placementOutcome).not.toHaveBeenCalled();
  });

  it('maps late receipt failure and emits no rollback signal', async () => {
    const harness = makeHarness({ appendError: 'receipt collision' });
    await expect(harness.execute(command)).rejects.toMatchObject({
      code: 'production_order_overtime_confirmation_failed',
      status: 503,
    });
    expect(harness.calls).toContain('placement-transaction-rollback');
    expect(harness.placementOutcome).not.toHaveBeenCalled();
    expect(harness.overtimeConfirmed).not.toHaveBeenCalled();
  });
});
