import { proveOperation } from '@pressly/testkit/operation-proof';
import { placeOrderExactlyCellDeclaration } from './cell.ts';
import { databaseError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import type {
  OnlinePlacementProposal,
  ProductionOrderPlacementContext,
} from '../../../model/online-order-placement/model.ts';
import { productionRules } from '../../../model/public.ts';
import {
  makeExecutePlaceOrderExactly,
  type PlaceOrderExactlyReplay,
  type PlaceOrderExactlySignals,
  type PlaceOrderExactlyTransactionRepository,
} from './execute.ts';
import type {
  ExactOrderPlacedResult,
  PlaceOrderExactlyCommand,
} from './types.ts';

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

const placed = (): ExactOrderPlacedResult => ({
  status: 'placed',
  mode: 'manager_exact',
  productionRunId: ids.run,
  productionOrderId: ids.order,
  productionBatchId: ids.batch,
  createdBatch: false,
  affectedBatchIds: [ids.batch],
  queueVersion: 5,
  proposalHash: 'b'.repeat(64),
  plannedCompletionAt: '2026-08-22T16:00:00.000Z',
  overtimeMinutes: 0,
  replayed: false,
});

const setup = (
  input: {
    loaded?: ProductionOrderPlacementContext | null;
    replays?: PlaceOrderExactlyReplay[];
    proposed?: ReturnType<typeof proposal>;
  } = {},
) => {
  const trace: string[] = [];
  const replays = [...(input.replays ?? [])];
  let findCount = 0;
  const findWorkEvent = vi.fn(async () => {
    trace.push(findCount++ === 0 ? 'find:before' : 'find:after');
    return {};
  });
  const loadContext = vi.fn(async () => {
    trace.push('loadContext');
    return input.loaded === undefined ? context() : input.loaded;
  });
  const savePendingOutcome = vi.fn<
    PlaceOrderExactlyTransactionRepository<unknown>['savePendingOutcome']
  >(async () => {
    trace.push('savePendingOutcome');
  });
  const commitPlacement = vi.fn<
    PlaceOrderExactlyTransactionRepository<unknown>['commitPlacement']
  >(async () => {
    trace.push('commitPlacement');
    return { kind: 'saved', result: placed() };
  });
  const appendWorkEvent = vi.fn<
    PlaceOrderExactlyTransactionRepository<unknown>['appendWorkEvent']
  >(async () => {
    trace.push('appendWorkEvent');
  });
  const placementOutcome = vi.fn<PlaceOrderExactlySignals['placementOutcome']>(
    () => trace.push('placementOutcome'),
  );
  const queueConflict = vi.fn<PlaceOrderExactlySignals['queueConflict']>(() =>
    trace.push('queueConflict'),
  );
  const proposeOnlinePlacement = vi.fn(() => input.proposed ?? proposal());
  const execute = makeExecutePlaceOrderExactly({
    repo: {
      transaction: async (work) => {
        trace.push('transaction:begin');
        try {
          const outcome = await work({
            findWorkEvent,
            loadContext,
            savePendingOutcome,
            commitPlacement,
            appendWorkEvent,
          });
          trace.push(
            outcome.kind === 'success'
              ? 'transaction:commit'
              : 'transaction:rollback',
          );
          return outcome;
        } catch (error) {
          trace.push('transaction:rollback');
          throw error;
        }
      },
    },
    idempotency: {
      resolveReplay: () => replays.shift() ?? { kind: 'miss' },
    },
    policy: productionRules,
    proposeOnlinePlacement,
    clock: {
      now: () => {
        trace.push('clock');
        return new Date('2026-08-22T14:00:00.000Z');
      },
    },
    signals: { placementOutcome, queueConflict },
  });
  return {
    execute,
    trace,
    findWorkEvent,
    loadContext,
    savePendingOutcome,
    commitPlacement,
    appendWorkEvent,
    placementOutcome,
    queueConflict,
    proposeOnlinePlacement,
  };
};

describe('execute place order exactly', () => {
  proveOperation({
    operationId: 'production.place-order-exactly.v1',
    declaration: placeOrderExactlyCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'checks replay before and after the locked context inside one UoW, then signals after commit',
        proves: ['executor-success'],
        run: async () => {
          const harness = setup();
          await expect(harness.execute(command)).resolves.toEqual({
            kind: 'success',
            value: placed(),
          });
          expect(harness.trace).toEqual([
            'transaction:begin',
            'find:before',
            'loadContext',
            'find:after',
            'clock',
            'commitPlacement',
            'appendWorkEvent',
            'transaction:commit',
            'placementOutcome',
          ]);
          expect(harness.appendWorkEvent).toHaveBeenCalledWith(
            expect.objectContaining({
              eventType: 'production_order_placement_resolved',
              expectedVersion: 4,
              payload: expect.objectContaining({
                mode: 'manager_exact',
                targetBatchId: ids.batch,
                proposalHash: 'b'.repeat(64),
                outcome: 'placed',
              }),
            }),
          );
        },
      },
    ],
  });

  it('returns a first-check replay from the UoW without loading or signaling', async () => {
    const replay = { ...placed(), replayed: true };
    const harness = setup({ replays: [{ kind: 'replay', result: replay }] });
    await expect(harness.execute(command)).resolves.toEqual({
      kind: 'success',
      value: replay,
    });
    expect(harness.trace).toEqual([
      'transaction:begin',
      'find:before',
      'transaction:commit',
    ]);
    expect(harness.loadContext).not.toHaveBeenCalled();
    expect(harness.placementOutcome).not.toHaveBeenCalled();
  });

  it('returns the after-lock replay without writing or signaling', async () => {
    const harness = setup({
      replays: [
        { kind: 'miss' },
        { kind: 'replay', result: { ...placed(), replayed: true } },
      ],
    });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: { replayed: true },
    });
    expect(harness.loadContext).toHaveBeenCalledOnce();
    expect(harness.commitPlacement).not.toHaveBeenCalled();
    expect(harness.appendWorkEvent).not.toHaveBeenCalled();
    expect(harness.placementOutcome).not.toHaveBeenCalled();
  });

  it('rejects divergent reuse at the first in-UoW replay check', async () => {
    const harness = setup({ replays: [{ kind: 'conflict' }] });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_idempotency_conflict' },
    });
    expect(harness.trace).toEqual([
      'transaction:begin',
      'find:before',
      'transaction:rollback',
    ]);
  });

  it('audits stale target version before proposal and emits queue conflict after commit', async () => {
    const facts = context();
    const harness = setup({
      loaded: { ...facts, batchVersions: { [ids.batch]: 2 } },
    });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: { status: 'not_placed', reason: 'queue_conflict' },
    });
    expect(harness.proposeOnlinePlacement).not.toHaveBeenCalled();
    expect(harness.savePendingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingPlacement: expect.objectContaining({
          status: 'not_placed',
          preview: null,
        }),
      }),
    );
    expect(harness.appendWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'production_order_placement_resolved',
        expectedVersion: null,
        payload: expect.objectContaining({ proposalHash: null }),
      }),
    );
    expect(harness.trace.slice(-3)).toEqual([
      'transaction:commit',
      'placementOutcome',
      'queueConflict',
    ]);
  });

  it('persists overtime confirmation-required with proposal preview', async () => {
    const harness = setup({ proposed: proposal(35) });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: {
        status: 'confirmation_required',
        proposalHash: 'b'.repeat(64),
        overtimeMinutes: 35,
      },
    });
    expect(harness.commitPlacement).not.toHaveBeenCalled();
    expect(harness.savePendingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingPlacement: expect.objectContaining({
          status: 'confirmation_required',
          proposalHash: 'b'.repeat(64),
        }),
      }),
    );
    expect(harness.appendWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'production_order_placement_overtime_required',
      }),
    );
  });

  it('rolls back typed late mutation conflict without event or signal', async () => {
    const harness = setup();
    harness.commitPlacement.mockResolvedValueOnce({
      kind: 'conflict',
      failure: {
        kind: 'conflict',
        code: 'production_placement_order_version_conflict',
        message: 'The order stopped being eligible during placement.',
        safeMessage: 'Production state changed. Refresh and try again.',
      },
    });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_placement_order_version_conflict' },
    });
    expect(harness.trace).toContain('transaction:rollback');
    expect(harness.appendWorkEvent).not.toHaveBeenCalled();
    expect(harness.placementOutcome).not.toHaveBeenCalled();
  });

  it('maps unknown rollback faults and preserves owned application errors', async () => {
    const unknown = setup();
    unknown.appendWorkEvent.mockRejectedValueOnce('late append fault');
    await expect(unknown.execute(command)).rejects.toMatchObject({
      tag: 'AppError',
      kind: 'DatabaseError',
      code: 'production_order_placement_failed',
      status: 503,
    });
    expect(unknown.placementOutcome).not.toHaveBeenCalled();

    const ownedError = databaseError({
      code: 'owned_placement_store_failure',
      message: 'Owned placement store failure.',
      safeMessage: 'Owned placement store failure.',
      status: 503,
    });
    const owned = setup();
    owned.loadContext.mockRejectedValueOnce(ownedError);
    await expect(owned.execute(command)).rejects.toBe(ownedError);
  });
});
