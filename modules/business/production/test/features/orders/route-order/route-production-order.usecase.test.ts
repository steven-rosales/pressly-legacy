import { makeAppError } from '@pressly/errors/app-error';
import { describe, expect, it, vi } from 'vitest';
import { nullProductionSignals } from '../../../../src/foundations/adapters/signals/null-production-signals.adapter.ts';
import type { StoredWorkEvent } from '../../../../src/foundations/language/commands/production-command.model.ts';
import type {
  ProductionOrderRoutingContext,
  RouteProductionOrderRepository,
} from '../../../../src/features/orders/route-order/route-production-order.port.ts';
import { makeRouteProductionOrder } from '../../../../src/features/orders/route-order/route-production-order.usecase.ts';
import type { CommitProductionOrderRouteResult } from '../../../../src/features/orders/route-order/route-production-order.model.ts';
import { allowPolicy, makeClock } from '../../../support/production.fake.ts';

const ids = {
  run: '10000000-0000-4000-8000-000000000001',
  order: '10000000-0000-4000-8000-000000000002',
  source: '10000000-0000-4000-8000-000000000003',
  target: '10000000-0000-4000-8000-000000000004',
  membership: '10000000-0000-4000-8000-000000000005',
  actor: '10000000-0000-4000-8000-000000000006',
} as const;

const stageIds = {
  sorting: '20000000-0000-4000-8000-000000000001',
  washing: '20000000-0000-4000-8000-000000000002',
  drying: '20000000-0000-4000-8000-000000000003',
  folding_packaging: '20000000-0000-4000-8000-000000000004',
} as const;

const attemptIds = {
  sorting: '30000000-0000-4000-8000-000000000001',
  washing: '30000000-0000-4000-8000-000000000002',
  drying: '30000000-0000-4000-8000-000000000003',
  folding_packaging: '30000000-0000-4000-8000-000000000004',
} as const;

const context = (): ProductionOrderRoutingContext => ({
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
      stages: (
        ['sorting', 'washing', 'drying', 'folding_packaging'] as const
      ).map((stage) => ({
        stageRunId: stageIds[stage],
        stage,
        status: 'planned' as const,
        assignedWeightLbs: 50,
        capacityLbs: 100,
      })),
    },
  ],
  attempts: (
    ['sorting', 'washing', 'drying', 'folding_packaging'] as const
  ).map((stage) => ({
    id: attemptIds[stage],
    stageRunId: stageIds[stage],
    productionBatchId: ids.source,
    stage,
    attemptNumber: 1,
    status: 'assigned' as const,
  })),
});

const command = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionOrderId: ids.order,
  actorId: ids.actor,
  authorizedAction: 'production:stage' as const,
  kind: 'queued_move' as const,
  reason: 'manual_rebatch' as const,
  restartStage: 'sorting' as const,
  targetProductionBatchId: ids.target,
  expectedQueueVersion: 4,
  expectedOrderVersion: 3,
  expectedSourceBatchVersion: 2,
};

const setup = (
  storedEvent: StoredWorkEvent | null = null,
  transactionFailure?: unknown,
  policy = allowPolicy,
) => {
  const loadContext = vi.fn(async () => context());
  let appliedWorkEvent = storedEvent;
  const findWorkEvent = vi.fn(async () => appliedWorkEvent);
  const commit = vi.fn(async (input) => {
    const output: CommitProductionOrderRouteResult = {
      status: 'routed',
      proposal: input.proposal,
      queueVersion: 5,
      orderVersion: 4,
      sourceBatchVersion: 3,
      targetBatchVersion: 6,
      createdAttemptIds: [stageIds.sorting],
      replayed: false,
    };
    appliedWorkEvent = {
      command: input.idempotency,
      result: output,
      valid: true,
    };
    return output;
  });
  const repo: RouteProductionOrderRepository = {
    transaction: async (work) => {
      if (transactionFailure !== undefined) throw transactionFailure;
      return work({ loadContext, findWorkEvent, commit });
    },
  };
  const orderRouteOutcome = vi.fn();
  const queueConflict = vi.fn();
  const signals = {
    ...nullProductionSignals,
    orderRouteOutcome,
    queueConflict,
  };
  const route = makeRouteProductionOrder({
    repo,
    policy,
    clock: makeClock('2026-07-15T16:00:00.000Z').clock,
    signals,
  });
  return {
    route,
    loadContext,
    findWorkEvent,
    commit,
    orderRouteOutcome,
    queueConflict,
  };
};

describe('route production order', () => {
  it('previews a deterministic whole-order move without mutating persistence', async () => {
    const { route, commit, orderRouteOutcome } = setup();
    const outcome = await route.preview(command);
    expect(outcome.tag).toBe('ok');
    if (outcome.tag !== 'ok') return;
    expect(outcome.value).toMatchObject({
      productionOrderId: ids.order,
      sourceProductionBatchId: ids.source,
      targetProductionBatchId: ids.target,
      releasedStages: ['sorting', 'washing', 'drying', 'folding_packaging'],
      assignedStages: ['sorting', 'washing', 'drying', 'folding_packaging'],
    });
    expect(outcome.value.proposalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(commit).not.toHaveBeenCalled();
    expect(orderRouteOutcome).toHaveBeenCalledWith({
      operation: 'preview',
      status: 'proposed',
      kind: 'queued_move',
      reason: 'manual_rebatch',
    });
  });

  it('re-evaluates the hash under lock before one atomic commit', async () => {
    const { route, loadContext, commit, orderRouteOutcome } = setup();
    const preview = await route.preview(command);
    if (preview.tag !== 'ok') throw new Error('Expected a preview.');
    const outcome = await route.commit({
      ...command,
      proposalHash: preview.value.proposalHash,
      idempotencyKey: 'route-production-order-1',
    });
    expect(outcome).toMatchObject({
      tag: 'ok',
      value: { status: 'routed', queueVersion: 5, orderVersion: 4 },
    });
    expect(loadContext).toHaveBeenLastCalledWith(
      'location-1',
      ids.run,
      ids.order,
      true,
    );
    expect(commit).toHaveBeenCalledOnce();
    expect(orderRouteOutcome).toHaveBeenLastCalledWith({
      operation: 'commit',
      status: 'committed',
      kind: 'queued_move',
      reason: 'manual_rebatch',
    });
  });

  it('rejects a stale queue version before proposing a route', async () => {
    const { route, commit, orderRouteOutcome, queueConflict } = setup();
    const outcome = await route.preview({
      ...command,
      expectedQueueVersion: 3,
    });
    expect(outcome).toMatchObject({
      tag: 'err',
      error: { code: 'production_queue_version_conflict' },
    });
    expect(commit).not.toHaveBeenCalled();
    expect(orderRouteOutcome).toHaveBeenCalledWith({
      operation: 'preview',
      status: 'conflict',
      kind: 'queued_move',
      reason: 'manual_rebatch',
    });
    expect(queueConflict).toHaveBeenCalledWith({
      operation: 'order_route_preview',
    });
  });

  it('rejects an archived order before proposing an operational route', async () => {
    const { route, loadContext, commit } = setup();
    loadContext.mockResolvedValueOnce({
      ...context(),
      order: {
        ...context().order,
        resolutionState: 'resolved_without_production',
      },
    });

    await expect(route.preview(command)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_order_resolved', kind: 'conflict' },
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it('reports a bounded failure outcome when an atomic route cannot commit', async () => {
    const { route, commit, orderRouteOutcome } = setup();
    const preview = await route.preview(command);
    if (preview.tag !== 'ok') throw new Error('Expected a preview.');
    commit.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      route.commit({
        ...command,
        proposalHash: preview.value.proposalHash,
        idempotencyKey: 'route-production-order-failure-1',
      }),
    ).rejects.toMatchObject({
      tag: 'AppError',
      kind: 'DatabaseError',
      code: 'production_order_route_failed',
      status: 503,
    });
    expect(orderRouteOutcome).toHaveBeenLastCalledWith({
      operation: 'commit',
      status: 'failed',
      kind: 'queued_move',
      reason: 'manual_rebatch',
    });
  });

  it('returns a database failure when preview persistence is unavailable', async () => {
    const { route, orderRouteOutcome } = setup(
      null,
      new Error('database unavailable'),
    );

    await expect(route.preview(command)).rejects.toMatchObject({
      tag: 'AppError',
      kind: 'DatabaseError',
      code: 'production_order_route_preview_failed',
      status: 503,
    });
    expect(orderRouteOutcome).toHaveBeenLastCalledWith({
      operation: 'preview',
      status: 'failed',
      kind: 'queued_move',
      reason: 'manual_rebatch',
    });
  });

  it('does not misclassify a policy failure as a database failure', async () => {
    const cause = new Error('policy implementation failed');
    const policy = {
      ...allowPolicy,
      evaluateProductionOrderOperationalAccess: vi.fn(() => {
        throw cause;
      }),
    };
    const { route } = setup(null, undefined, policy);

    await expect(route.preview(command)).rejects.toMatchObject({
      tag: 'AppError',
      kind: 'InvariantViolationError',
      code: 'production_order_route_evaluation_failed',
      status: 500,
      cause,
    });
  });

  it('preserves an existing application error from route persistence', async () => {
    const existing = makeAppError({
      kind: 'ExternalServiceError',
      code: 'routing_dependency_unavailable',
      message: 'Routing dependency unavailable.',
      safeMessage: 'Routing is temporarily unavailable.',
      status: 502,
    });
    const { route, commit } = setup();
    const preview = await route.preview(command);
    if (preview.tag !== 'ok') throw new Error('Expected a preview.');
    commit.mockRejectedValueOnce(existing);

    await expect(
      route.commit({
        ...command,
        proposalHash: preview.value.proposalHash,
        idempotencyKey: 'route-production-order-existing-error-1',
      }),
    ).rejects.toBe(existing);
  });

  it('distinguishes an idempotent replay from a newly committed route', async () => {
    const { route, commit, orderRouteOutcome } = setup();
    const preview = await route.preview(command);
    if (preview.tag !== 'ok') throw new Error('Expected a preview.');
    const commitCommand = {
      ...command,
      proposalHash: preview.value.proposalHash,
      idempotencyKey: 'route-production-order-replay-1',
    };

    await route.commit(commitCommand);
    const replay = await route.commit(commitCommand);

    expect(replay).toMatchObject({
      tag: 'ok',
      value: { status: 'routed', replayed: true },
    });
    expect(commit).toHaveBeenCalledOnce();
    expect(orderRouteOutcome).toHaveBeenLastCalledWith({
      operation: 'commit',
      status: 'replayed',
      kind: 'queued_move',
      reason: 'manual_rebatch',
    });
  });
});
