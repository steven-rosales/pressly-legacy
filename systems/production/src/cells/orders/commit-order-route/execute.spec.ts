import { proveOperation } from '@pressly/testkit/operation-proof';
import { commitOrderRouteCellDeclaration } from './cell.ts';
import { databaseError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import type { OrderRouteProposalContext } from '../../../model/order-route-proposal/model.ts';
import {
  makeExecuteCommitOrderRoute,
  type CommitOrderRouteReplay,
  type CommitOrderRouteSignals,
  type CommitOrderRouteTransactionRepository,
} from './execute.ts';
import type {
  CommitOrderRouteCommand,
  CommitOrderRouteResult,
} from './types.ts';

const ids = {
  run: '10000000-0000-4000-8000-000000000001',
  order: '10000000-0000-4000-8000-000000000002',
  source: '10000000-0000-4000-8000-000000000003',
  target: '10000000-0000-4000-8000-000000000004',
  membership: '10000000-0000-4000-8000-000000000005',
  actor: '10000000-0000-4000-8000-000000000006',
} as const;
const stages = ['sorting', 'washing', 'drying', 'folding_packaging'] as const;

const context = (): OrderRouteProposalContext => ({
  run: { id: ids.run, status: 'started', queueVersion: 4 },
  order: {
    id: ids.order,
    operationalStatus: 'scheduled',
    executionStatus: 'scheduled',
    resolutionState: 'open',
    version: 3,
    weightLbs: 25,
  },
  source: {
    membershipId: ids.membership,
    productionBatchId: ids.source,
    sequence: 0,
    status: 'queued',
    membershipFrozen: false,
    version: 2,
    derivedWeightLbs: 70,
    activeOrderCount: 2,
  },
  candidates: [
    {
      productionBatchId: ids.target,
      sequence: 1,
      status: 'queued',
      membershipFrozen: false,
      version: 5,
      derivedWeightLbs: 50,
      pulseCapacityLbs: 100,
      stages: stages.map((stage, index) => ({
        stageRunId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        stage,
        status: 'planned' as const,
        assignedWeightLbs: 50,
        capacityLbs: 100,
      })),
    },
  ],
  attempts: stages.map((stage, index) => ({
    id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    stageRunId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    productionBatchId: ids.source,
    stage,
    attemptNumber: 1,
    status: 'assigned' as const,
  })),
});

const command: CommitOrderRouteCommand = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionOrderId: ids.order,
  actorId: ids.actor,
  authorizedAction: 'production:stage',
  kind: 'queued_move',
  reason: 'manual_rebatch',
  targetProductionBatchId: ids.target,
  restartStage: 'sorting',
  expectedQueueVersion: 4,
  expectedOrderVersion: 3,
  expectedSourceBatchVersion: 2,
  proposalHash:
    '8be903b98fe772984bec28fba7465728e0a97b39a5d852f63c4ba150c6ade60c',
  idempotencyKey: 'commit-route-1',
};

const setup = (
  input: {
    loaded?: OrderRouteProposalContext | null;
    replays?: CommitOrderRouteReplay[];
  } = {},
) => {
  const trace: string[] = [];
  const replays = [...(input.replays ?? [])];
  const findWorkEvent = vi.fn(async () => {
    trace.push('findWorkEvent');
    return {};
  });
  const loadContextForUpdate = vi.fn(async () => {
    trace.push('loadContextForUpdate');
    return input.loaded === undefined ? context() : input.loaded;
  });
  const commit = vi.fn<
    CommitOrderRouteTransactionRepository<unknown>['commit']
  >(async (mutation) => {
    trace.push('commit');
    const result: CommitOrderRouteResult = {
      status: 'routed',
      proposal: mutation.plan.proposal,
      queueVersion: 5,
      orderVersion: 4,
      sourceBatchVersion: 3,
      targetBatchVersion: 6,
      createdAttemptIds: ['50000000-0000-4000-8000-000000000001'],
      replayed: false,
    };
    return { kind: 'saved', result };
  });
  const appendWorkEvent = vi.fn<
    CommitOrderRouteTransactionRepository<unknown>['appendWorkEvent']
  >(async () => {
    trace.push('appendWorkEvent');
  });
  const orderRouteOutcome = vi.fn<CommitOrderRouteSignals['orderRouteOutcome']>(
    () => {
      trace.push('orderRouteOutcome');
    },
  );
  const queueConflict = vi.fn<CommitOrderRouteSignals['queueConflict']>(() => {
    trace.push('queueConflict');
  });
  const execute = makeExecuteCommitOrderRoute({
    repo: {
      transaction: async (work) => {
        trace.push('transaction:begin');
        try {
          const outcome = await work({
            findWorkEvent,
            loadContextForUpdate,
            commit,
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
    clock: {
      now: () => {
        trace.push('clock');
        return new Date('2026-08-22T14:00:00.000Z');
      },
    },
    signals: { orderRouteOutcome, queueConflict },
  });

  return {
    execute,
    trace,
    findWorkEvent,
    loadContextForUpdate,
    commit,
    appendWorkEvent,
    orderRouteOutcome,
    queueConflict,
  };
};

const replayedResult = (): CommitOrderRouteResult => ({
  status: 'routed',
  proposal: {
    kind: 'queued_move',
    productionRunId: ids.run,
    productionOrderId: ids.order,
    sourceProductionBatchId: ids.source,
    sourceBatchSequence: 0,
    targetProductionBatchId: ids.target,
    targetBatchSequence: 1,
    restartStage: 'sorting',
    releasedStages: stages,
    assignedStages: stages,
    orderWeightLbs: 25,
    targetWeightLbs: 75,
    targetCapacityLbs: 100,
    expectedQueueVersion: 4,
    expectedOrderVersion: 3,
    expectedSourceBatchVersion: 2,
    expectedTargetBatchVersion: 5,
    proposalHash: command.proposalHash,
  },
  queueVersion: 5,
  orderVersion: 4,
  sourceBatchVersion: 3,
  targetBatchVersion: 6,
  createdAttemptIds: ['50000000-0000-4000-8000-000000000001'],
  replayed: true,
});

describe('execute commit order route', () => {
  proveOperation({
    operationId: 'production.commit-order-route.v1',
    declaration: commitOrderRouteCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'double-checks replay around the locked graph and signals only after commit',
        proves: ['executor-success'],
        run: async () => {
          const harness = setup();

          await expect(harness.execute(command)).resolves.toMatchObject({
            kind: 'success',
            value: { status: 'routed', replayed: false },
          });
          expect(harness.trace).toEqual([
            'transaction:begin',
            'findWorkEvent',
            'loadContextForUpdate',
            'findWorkEvent',
            'clock',
            'commit',
            'appendWorkEvent',
            'transaction:commit',
            'orderRouteOutcome',
          ]);
          expect(harness.appendWorkEvent).toHaveBeenCalledWith(
            expect.objectContaining({
              eventType: 'production_order_rebatched',
              entityId: ids.order,
              expectedVersion: 3,
              payload: expect.objectContaining({
                sourceProductionBatchId: ids.source,
                targetProductionBatchId: ids.target,
                proposalHash: command.proposalHash,
                queueVersion: 5,
                orderVersion: 4,
              }),
            }),
          );
          expect(harness.orderRouteOutcome).toHaveBeenCalledWith({
            operation: 'commit',
            status: 'committed',
            kind: 'queued_move',
            reason: 'manual_rebatch',
          });
        },
      },
    ],
  });

  it('returns a first-check replay without taking route locks', async () => {
    const replay = replayedResult();
    const harness = setup({ replays: [{ kind: 'replay', result: replay }] });

    await expect(harness.execute(command)).resolves.toEqual({
      kind: 'success',
      value: replay,
    });
    expect(harness.trace).toEqual([
      'transaction:begin',
      'findWorkEvent',
      'transaction:commit',
      'orderRouteOutcome',
    ]);
    expect(harness.loadContextForUpdate).not.toHaveBeenCalled();
  });

  it('returns an after-lock replay without mutating or appending', async () => {
    const harness = setup({
      replays: [{ kind: 'miss' }, { kind: 'replay', result: replayedResult() }],
    });

    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: { replayed: true },
    });
    expect(harness.loadContextForUpdate).toHaveBeenCalledOnce();
    expect(harness.commit).not.toHaveBeenCalled();
    expect(harness.appendWorkEvent).not.toHaveBeenCalled();
  });

  it('returns exact divergence before locks and rolls back typed failure data', async () => {
    const harness = setup({ replays: [{ kind: 'conflict' }] });

    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_idempotency_conflict' },
    });
    expect(harness.trace).toEqual([
      'transaction:begin',
      'findWorkEvent',
      'transaction:rollback',
      'orderRouteOutcome',
    ]);
  });

  it('returns not found only after both replay checkpoints', async () => {
    const harness = setup({ loaded: null });

    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_route_not_found' },
    });
    expect(harness.findWorkEvent).toHaveBeenCalledTimes(2);
    expect(harness.orderRouteOutcome).toHaveBeenCalledWith({
      operation: 'commit',
      status: 'rejected',
      kind: 'queued_move',
      reason: 'manual_rebatch',
    });
  });

  it('emits queue conflict only for the exact proposal queue fence', async () => {
    const harness = setup();

    await expect(
      harness.execute({ ...command, expectedQueueVersion: 3 }),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_queue_version_conflict' },
    });
    expect(harness.queueConflict).toHaveBeenCalledWith({
      operation: 'order_route_commit',
    });
  });

  it('does not append after a late typed mutation conflict', async () => {
    const harness = setup();
    harness.commit.mockResolvedValueOnce({
      kind: 'conflict',
      failure: {
        kind: 'conflict',
        code: 'production_order_route_order_version_conflict',
        message: 'Production order changed concurrently.',
        safeMessage: 'Production state changed. Refresh and try again.',
      },
    });

    await expect(harness.execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_route_order_version_conflict' },
    });
    expect(harness.appendWorkEvent).not.toHaveBeenCalled();
    expect(harness.trace).toContain('transaction:rollback');
  });

  it('maps unknown late append failures after rollback and preserves owned errors', async () => {
    const unknownHarness = setup();
    unknownHarness.appendWorkEvent.mockRejectedValueOnce('late append failed');
    await expect(unknownHarness.execute(command)).rejects.toMatchObject({
      tag: 'AppError',
      kind: 'DatabaseError',
      code: 'production_order_route_failed',
      status: 503,
    });
    expect(unknownHarness.trace.slice(-2)).toEqual([
      'transaction:rollback',
      'orderRouteOutcome',
    ]);

    const owned = databaseError({
      code: 'route_storage_owned_failure',
      message: 'Route storage failed.',
      safeMessage: 'Route storage failed.',
      status: 503,
    });
    const ownedHarness = setup();
    ownedHarness.commit.mockRejectedValueOnce(owned);
    await expect(ownedHarness.execute(command)).rejects.toBe(owned);
  });

  it('normalizes exception notes before binding replay identity', async () => {
    const seen: unknown[] = [];
    const harness = setup({ replays: [{ kind: 'conflict' }] });
    const execute = makeExecuteCommitOrderRoute({
      repo: {
        transaction: async (work) =>
          work({
            findWorkEvent: async () => ({}),
            loadContextForUpdate: harness.loadContextForUpdate,
            commit: harness.commit,
            appendWorkEvent: harness.appendWorkEvent,
          }),
      },
      idempotency: {
        resolveReplay: (_stored, identity) => {
          seen.push(identity);
          return { kind: 'conflict' };
        },
      },
      policy: productionRules,
      clock: { now: () => new Date('2026-08-22T14:00:00.000Z') },
    });

    await execute({
      locationId: command.locationId,
      productionRunId: command.productionRunId,
      productionOrderId: command.productionOrderId,
      actorId: command.actorId,
      authorizedAction: command.authorizedAction,
      kind: 'exception',
      reason: 'other',
      restartStage: 'washing',
      note: '  Explain route.  ',
      expectedQueueVersion: command.expectedQueueVersion,
      expectedOrderVersion: command.expectedOrderVersion,
      expectedSourceBatchVersion: command.expectedSourceBatchVersion,
      proposalHash: command.proposalHash,
      idempotencyKey: 'commit-route-exception-1',
    });

    expect(seen).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ note: 'Explain route.' }),
      }),
    ]);
  });
});
