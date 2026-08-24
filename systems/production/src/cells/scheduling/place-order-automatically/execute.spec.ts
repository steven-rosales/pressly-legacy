import type { CellOutcome } from '@pressly/cells';
import { databaseError } from '@pressly/errors/factories';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { placeOrderAutomaticallyCellDeclaration } from './cell.ts';
import type {
  OnlinePlacementProposal,
  OnlinePlacementResult,
  ProductionOrderPlacementContext,
} from '../../../model/online-order-placement/model.ts';
import { productionRules } from '../../../model/public.ts';
import {
  makeExecutePlaceOrderAutomatically,
  type PlaceOrderAutomaticallyRepository,
  type PlaceOrderAutomaticallySignals,
  type PlaceOrderAutomaticallyTransactionRepository,
} from './execute.ts';
import {
  placeOrderAutomaticallyIdempotency,
  serializePlaceOrderAutomaticallyWorkEventCommand,
  type StoredPlaceOrderAutomaticallyWorkEvent,
} from './idempotency.ts';
import type {
  AutomaticProductionOrderPlacedResult,
  AutomaticProductionOrderPlacementResult,
  PlaceOrderAutomaticallyExpectedFailure,
  PlaceProductionOrderAutomaticallyCommand,
} from './types.ts';

const ids = {
  run: '55000000-0000-4000-8000-000000000001',
  order: '55000000-0000-4000-8000-000000000002',
  batch: '55000000-0000-4000-8000-000000000003',
} as const;
const now = new Date('2026-08-22T15:00:00.000Z');
const command: PlaceProductionOrderAutomaticallyCommand = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionOrderId: ids.order,
  expectedQueueVersion: 4,
  idempotencyKey: 'place-automatic-1',
  actorId: 'actor-1',
  authorizedAction: 'production:override',
};

const stages = (startsAt = '2026-08-22T14:56:00.000Z') =>
  (['sorting', 'washing', 'drying', 'folding_packaging'] as const).map(
    (stage, index) => ({
      stage,
      startsAt: new Date(
        Date.parse(startsAt) + index * 56 * 60_000,
      ).toISOString(),
      endsAt: new Date(
        Date.parse(startsAt) + (index + 1) * 56 * 60_000,
      ).toISOString(),
      machineIds: [],
    }),
  );

const context = (queueVersion = 4): ProductionOrderPlacementContext => ({
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
      queueVersion,
      startsAt: '2026-08-22T13:00:00.000Z',
      shiftEndsAt: '2026-08-22T22:00:00.000Z',
      pulseMinutes: 56,
      pulseCapacityLbs: 100,
    },
    machines: [],
    batches: [
      {
        id: ids.batch,
        sequence: 0,
        status: 'queued',
        membershipFrozen: false,
        orderIds: ['existing-order'],
        priorityOrderIds: [],
        derivedWeightLbs: 40,
        bagCount: 1,
        stages: stages(),
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

const proposal = (
  input: {
    overtimeMinutes?: number;
    target?: 'existing' | 'new';
    queueVersion?: number;
  } = {},
): OnlinePlacementProposal => {
  const target = input.target ?? 'existing';
  const queueVersion = input.queueVersion ?? 4;
  const overtimeMinutes = input.overtimeMinutes ?? 0;
  return {
    kind: 'proposed',
    algorithmVersion: 'online-stable-insertion-v1',
    inputSnapshotHash: 'a'.repeat(64),
    placementPlanHash: 'b'.repeat(64),
    canonicalPlacement: '{}',
    expectedQueueVersion: queueVersion,
    target:
      target === 'existing'
        ? { type: 'existing_batch', batchId: ids.batch, sequence: 0 }
        : { type: 'new_batch', insertAtSequence: 1 },
    affectedFromSequence: target === 'existing' ? 0 : 1,
    affectedBatches: [
      {
        sourceBatchId: target === 'existing' ? ids.batch : null,
        sequence: target === 'existing' ? 0 : 1,
        status: 'queued',
        membershipFrozen: false,
        orderIds:
          target === 'existing' ? ['existing-order', ids.order] : [ids.order],
        priorityOrderIds: [],
        derivedWeightLbs: target === 'existing' ? 60 : 20,
        bagCount: target === 'existing' ? 2 : 1,
        stages: stages(),
        changed: true,
      },
    ],
    projectedCompletionAt:
      overtimeMinutes > 0
        ? '2026-08-22T22:15:00.000Z'
        : '2026-08-22T18:40:00.000Z',
    overtime: {
      required: overtimeMinutes > 0,
      shiftEndsAt: '2026-08-22T22:00:00.000Z',
      overrunMinutes: overtimeMinutes,
    },
  };
};

const placed = (
  value: OnlinePlacementProposal,
): AutomaticProductionOrderPlacedResult => ({
  status: 'placed',
  mode: 'automatic',
  productionRunId: ids.run,
  productionOrderId: ids.order,
  productionBatchId:
    value.target.type === 'existing_batch' ? value.target.batchId : ids.batch,
  createdBatch: value.target.type === 'new_batch',
  affectedBatchIds: [ids.batch],
  queueVersion: 5,
  proposalHash: value.placementPlanHash,
  plannedCompletionAt: value.projectedCompletionAt,
  overtimeMinutes: value.overtime.overrunMinutes,
  replayed: false,
});

const stored = (
  value: AutomaticProductionOrderPlacementResult,
  expected = command,
): StoredPlaceOrderAutomaticallyWorkEvent => ({
  command: serializePlaceOrderAutomaticallyWorkEventCommand({
    operation: 'production_order_placed_automatically',
    locationId: expected.locationId,
    actorId: expected.actorId,
    target: {
      entityType: 'production_order',
      entityId: expected.productionOrderId,
    },
    expectedVersion: expected.expectedQueueVersion,
    payload: {
      expectedQueueVersion: expected.expectedQueueVersion,
      authorizedAction: expected.authorizedAction,
      mode: 'automatic',
    },
  }),
  result: value as never,
  valid: true,
});

type HarnessInput = Readonly<{
  context?: ProductionOrderPlacementContext | null;
  proposal?: OnlinePlacementResult;
  storedReads?: readonly (StoredPlaceOrderAutomaticallyWorkEvent | null)[];
  commit?: CellOutcome<
    AutomaticProductionOrderPlacedResult,
    PlaceOrderAutomaticallyExpectedFailure
  >;
  appendError?: unknown;
}>;

const makeHarness = (input: HarnessInput = {}) => {
  const calls: string[] = [];
  const currentContext =
    input.context === undefined ? context() : input.context;
  const currentProposal = input.proposal ?? proposal();
  const reads = [...(input.storedReads ?? [null, null])];
  let clockReads = 0;
  const findWorkEvent = vi.fn(async () => reads.shift() ?? null);
  const loadContext = vi.fn(async () => {
    calls.push('load-context');
    return currentContext;
  });
  const recordOutcome = vi.fn(async () => {
    calls.push('record-outcome');
  });
  const commitPlacement = vi.fn(async () => {
    calls.push('commit-placement');
    if (input.commit !== undefined) return input.commit;
    if (currentProposal.kind !== 'proposed')
      throw databaseError({
        code: 'test_invalid_proposal',
        message: 'Test proposal is invalid.',
        safeMessage: 'Test proposal is invalid.',
      });
    return { kind: 'success' as const, value: placed(currentProposal) };
  });
  const appendWorkEvent = vi.fn(async () => {
    calls.push('append-event');
    if (input.appendError !== undefined) throw input.appendError;
  });
  const operations: PlaceOrderAutomaticallyTransactionRepository<StoredPlaceOrderAutomaticallyWorkEvent> =
    {
      findWorkEvent,
      loadContext,
      recordOutcome,
      commitPlacement,
      appendWorkEvent,
    };
  const repo: PlaceOrderAutomaticallyRepository<StoredPlaceOrderAutomaticallyWorkEvent> =
    {
      transaction: async (work) => {
        calls.push('transaction-begin');
        try {
          const outcome = await work(operations);
          calls.push('transaction-commit');
          return outcome;
        } catch (error) {
          calls.push('transaction-rollback');
          throw error;
        }
      },
    };
  const placementOutcome = vi.fn(() => calls.push('placement-signal'));
  const queueConflict = vi.fn(() => calls.push('queue-signal'));
  const signals: PlaceOrderAutomaticallySignals = {
    placementOutcome,
    queueConflict,
  };
  const proposeOnlinePlacement = vi.fn(() => {
    calls.push('propose');
    return currentProposal;
  });
  const execute = makeExecutePlaceOrderAutomatically({
    repo,
    idempotency: placeOrderAutomaticallyIdempotency,
    policy: productionRules,
    proposeOnlinePlacement,
    clock: {
      now: () => {
        calls.push('clock');
        clockReads += 1;
        return new Date(now);
      },
    },
    signals,
  });
  return {
    execute,
    calls,
    clockReads: () => clockReads,
    findWorkEvent,
    loadContext,
    recordOutcome,
    commitPlacement,
    appendWorkEvent,
    proposeOnlinePlacement,
    placementOutcome,
    queueConflict,
  };
};

describe('place-order-automatically executor', () => {
  proveOperation({
    operationId: 'production.place-order-automatically.v1',
    declaration: placeOrderAutomaticallyCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'commits an automatic existing-batch proposal audits then signals',
        proves: ['executor-success'],
        run: async () => {
          const target = 'existing' as const;
          const candidate = proposal({ target });
          const harness = makeHarness({ proposal: candidate });
          await expect(harness.execute(command)).resolves.toMatchObject({
            kind: 'success',
            value: {
              status: 'placed',
              mode: 'automatic',
              createdBatch: false,
              queueVersion: 5,
              replayed: false,
            },
          });
          expect(harness.proposeOnlinePlacement).toHaveBeenCalledWith({
            ...context().input,
            mode: { type: 'automatic' },
          });
          expect(harness.commitPlacement).toHaveBeenCalledWith(
            expect.objectContaining({
              command,
              proposal: candidate,
              initialBatchState: 'queued',
              initialStageState: 'planned',
              initialAttemptState: 'assigned',
              now,
            }),
          );
          expect(harness.appendWorkEvent).toHaveBeenCalledWith(
            expect.objectContaining({
              eventType: 'production_order_placement_resolved',
              expectedVersion: 4,
              payload: expect.objectContaining({
                authorizedAction: 'production:override',
                mode: 'automatic',
                outcome: 'placed',
              }),
            }),
          );
          expect(harness.calls.indexOf('placement-signal')).toBeGreaterThan(
            harness.calls.indexOf('transaction-commit'),
          );
          expect(harness.queueConflict).not.toHaveBeenCalled();
          expect(harness.clockReads()).toBe(1);
        },
      },
    ],
  });

  it.each(['new'] as const)(
    'commits an automatic %s-batch proposal, audits, then signals after commit',
    async (target) => {
      const candidate = proposal({ target });
      const harness = makeHarness({ proposal: candidate });
      await expect(harness.execute(command)).resolves.toMatchObject({
        kind: 'success',
        value: {
          status: 'placed',
          mode: 'automatic',
          createdBatch: target === 'new',
          queueVersion: 5,
          replayed: false,
        },
      });
      expect(harness.proposeOnlinePlacement).toHaveBeenCalledWith({
        ...context().input,
        mode: { type: 'automatic' },
      });
      expect(harness.commitPlacement).toHaveBeenCalledWith(
        expect.objectContaining({
          command,
          proposal: candidate,
          initialBatchState: 'queued',
          initialStageState: 'planned',
          initialAttemptState: 'assigned',
          now,
        }),
      );
      expect(harness.appendWorkEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'production_order_placement_resolved',
          expectedVersion: 4,
          payload: expect.objectContaining({
            authorizedAction: 'production:override',
            mode: 'automatic',
            outcome: 'placed',
          }),
        }),
      );
      expect(harness.calls.indexOf('placement-signal')).toBeGreaterThan(
        harness.calls.indexOf('transaction-commit'),
      );
      expect(harness.queueConflict).not.toHaveBeenCalled();
      expect(harness.clockReads()).toBe(1);
    },
  );

  it('persists and signals overtime confirmation-required without queue mutation', async () => {
    const candidate = proposal({ target: 'new', overtimeMinutes: 15 });
    const harness = makeHarness({ proposal: candidate });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: {
        status: 'confirmation_required',
        target: { kind: 'new_batch', sequence: 1 },
        proposalHash: candidate.placementPlanHash,
        overtimeMinutes: 15,
      },
    });
    expect(harness.commitPlacement).not.toHaveBeenCalled();
    expect(harness.recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingPlacement: expect.objectContaining({
          status: 'confirmation_required',
          proposalHash: candidate.placementPlanHash,
        }),
      }),
    );
    expect(harness.appendWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'production_order_placement_overtime_required',
        expectedVersion: 4,
      }),
    );
    expect(harness.placementOutcome).toHaveBeenCalledWith({
      status: 'confirmation_required',
      mode: 'automatic',
    });
  });

  it('persists deterministic proposal rejection with no preview', async () => {
    const harness = makeHarness({
      proposal: {
        kind: 'rejected',
        algorithmVersion: 'online-stable-insertion-v1',
        inputSnapshotHash: 'a'.repeat(64),
        reason: {
          code: 'ORDER_EXCEEDS_PULSE_CAPACITY',
          message: 'The whole order is too heavy.',
        },
      },
    });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: {
        status: 'not_placed',
        reason: 'hard_capacity_exceeded',
      },
    });
    expect(harness.recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        proposal: null,
        pendingPlacement: expect.objectContaining({
          status: 'not_placed',
          preview: null,
        }),
      }),
    );
    expect(harness.appendWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: null }),
    );
  });

  it('persists visible queue conflict and signals it only after commit', async () => {
    const candidate = proposal({ queueVersion: 5 });
    const harness = makeHarness({
      context: context(5),
      proposal: candidate,
    });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: {
        status: 'not_placed',
        reason: 'queue_conflict',
        queueVersion: 5,
      },
    });
    expect(harness.recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingPlacement: expect.objectContaining({
          status: 'not_placed',
          reason: 'queue_conflict',
          preview: expect.objectContaining({ queueVersion: 5 }),
        }),
      }),
    );
    expect(harness.placementOutcome).toHaveBeenCalledWith({
      status: 'not_placed',
      mode: 'automatic',
      reason: 'queue_conflict',
    });
    expect(harness.queueConflict).toHaveBeenCalledWith({
      operation: 'automatic_placement',
    });
    expect(harness.calls.indexOf('queue-signal')).toBeGreaterThan(
      harness.calls.indexOf('transaction-commit'),
    );
  });

  it('replays before context without clock, proposal, mutation, or signal', async () => {
    const value = placed(proposal());
    const harness = makeHarness({ storedReads: [stored(value)] });
    await expect(harness.execute(command)).resolves.toEqual({
      kind: 'success',
      value: { ...value, replayed: true },
    });
    expect(harness.loadContext).not.toHaveBeenCalled();
    expect(harness.proposeOnlinePlacement).not.toHaveBeenCalled();
    expect(harness.appendWorkEvent).not.toHaveBeenCalled();
    expect(harness.placementOutcome).not.toHaveBeenCalled();
    expect(harness.clockReads()).toBe(0);
  });

  it('replays after locked context without proposal, mutation, or signal', async () => {
    const value = placed(proposal());
    const harness = makeHarness({ storedReads: [null, stored(value)] });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: { status: 'placed', replayed: true },
    });
    expect(harness.loadContext).toHaveBeenCalledOnce();
    expect(harness.proposeOnlinePlacement).not.toHaveBeenCalled();
    expect(harness.commitPlacement).not.toHaveBeenCalled();
    expect(harness.placementOutcome).not.toHaveBeenCalled();
  });

  it('rejects divergent key reuse before locking context', async () => {
    const value = placed(proposal());
    const harness = makeHarness({
      storedReads: [stored(value, { ...command, expectedQueueVersion: 5 })],
    });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_idempotency_conflict' },
    });
    expect(harness.loadContext).not.toHaveBeenCalled();
    expect(harness.clockReads()).toBe(0);
  });

  it('returns missing locked context without clock, event, or signal', async () => {
    const harness = makeHarness({ context: null });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_placement_context_not_found' },
    });
    expect(harness.proposeOnlinePlacement).not.toHaveBeenCalled();
    expect(harness.appendWorkEvent).not.toHaveBeenCalled();
    expect(harness.placementOutcome).not.toHaveBeenCalled();
    expect(harness.clockReads()).toBe(0);
  });

  it('returns late typed CAS conflict without event or signal', async () => {
    const harness = makeHarness({
      commit: {
        kind: 'failure',
        failure: {
          kind: 'conflict',
          code: 'production_placement_order_version_conflict',
          message: 'The order stopped being eligible during placement.',
          safeMessage: 'Production state changed. Refresh and try again.',
        },
      },
    });
    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_placement_order_version_conflict' },
    });
    expect(harness.appendWorkEvent).not.toHaveBeenCalled();
    expect(harness.placementOutcome).not.toHaveBeenCalled();
    expect(harness.clockReads()).toBe(1);
  });

  it('maps a late event failure and keeps signals after durable commit only', async () => {
    const harness = makeHarness({
      appendError: 'work-event collision',
    });
    await expect(harness.execute(command)).rejects.toMatchObject({
      code: 'production_order_placement_failed',
      status: 503,
    });
    expect(harness.calls).toContain('transaction-rollback');
    expect(harness.placementOutcome).not.toHaveBeenCalled();
    expect(harness.queueConflict).not.toHaveBeenCalled();
  });
});
