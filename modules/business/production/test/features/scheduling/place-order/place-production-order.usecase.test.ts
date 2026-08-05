import { describe, expect, it, vi } from 'vitest';
import type { OnlinePlacementProposal } from '../../../../src/foundations/language/scheduling/online-placement.model.ts';
import type { ProductionRules } from '../../../../src/foundations/language/rules/production-rules.model.ts';
import type { ProductionAlgorithmRegistry } from '../../../../src/foundations/algorithms/approved-production/production-algorithm-registry.factory.ts';
import type { StoredWorkEvent } from '../../../../src/foundations/language/commands/production-command.model.ts';
import type {
  PlaceProductionOrderRepository,
  StoredOvertimeProposal,
} from '../../../../src/features/scheduling/place-order/place-production-order.port.ts';
import type { ProductionOrderPlacementContext } from '../../../../src/foundations/language/scheduling/online-placement.model.ts';
import { makePlaceProductionOrder } from '../../../../src/features/scheduling/place-order/place-production-order.usecase.ts';
import { allowPolicy } from '../../../support/production.fake.ts';
import type { ProductionOrderPlacedResult } from '../../../../src/foundations/language/scheduling/production-placement.model.ts';
import { nullProductionSignals } from '../../../../src/foundations/adapters/signals/null-production-signals.adapter.ts';
import type { ProductionSignalsPort } from '../../../../src/foundations/ports/signals/production-signals.port.ts';

const ids = {
  run: '11111111-1111-4111-8111-111111111111',
  newOrder: '22222222-2222-4222-8222-222222222222',
  existingA: '33333333-3333-4333-8333-333333333333',
  existingB: '44444444-4444-4444-8444-444444444444',
  batchA: '55555555-5555-4555-8555-555555555555',
  batchB: '66666666-6666-4666-8666-666666666666',
  actor: '77777777-7777-4777-8777-777777777777',
} as const;

const stages = (startsAt: string) =>
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

const makeContext = (queueVersion = 4): ProductionOrderPlacementContext => ({
  input: {
    order: {
      id: ids.newOrder,
      priority: false,
      derivedWeightLbs: 20,
      bagCount: 1,
      version: 2,
    },
    run: {
      id: ids.run,
      queueVersion,
      startsAt: '2026-07-14T14:00:00.000Z',
      shiftEndsAt: '2026-07-14T22:00:00.000Z',
      pulseMinutes: 56,
      pulseCapacityLbs: 100,
    },
    machines: [],
    batches: [
      {
        id: ids.batchA,
        sequence: 0,
        status: 'sorting',
        membershipFrozen: true,
        orderIds: [ids.existingA],
        priorityOrderIds: [],
        derivedWeightLbs: 50,
        bagCount: 2,
        stages: stages('2026-07-14T14:00:00.000Z'),
      },
      {
        id: ids.batchB,
        sequence: 1,
        status: 'queued',
        membershipFrozen: false,
        orderIds: [ids.existingB],
        priorityOrderIds: [],
        derivedWeightLbs: 40,
        bagCount: 1,
        stages: stages('2026-07-14T14:56:00.000Z'),
      },
    ],
    mode: { type: 'automatic' },
  },
  runStatus: 'started',
  orderStatus: 'eligible',
  orderExecutionStatus: 'unassigned',
  orderVersion: 2,
  orderAlreadyAssigned: false,
  batchVersions: { [ids.batchA]: 2, [ids.batchB]: 3 },
});

const makeProposal = (
  input: {
    queueVersion?: number;
    proposalHash?: string;
    overtimeMinutes?: number;
  } = {},
): OnlinePlacementProposal => {
  const queueVersion = input.queueVersion ?? 4;
  const overtimeMinutes = input.overtimeMinutes ?? 0;
  return {
    kind: 'proposed',
    algorithmVersion: 'online-stable-insertion-v1',
    inputSnapshotHash: 'a'.repeat(64),
    placementPlanHash: input.proposalHash ?? 'b'.repeat(64),
    canonicalPlacement: '{}',
    expectedQueueVersion: queueVersion,
    target: {
      type: 'existing_batch',
      batchId: ids.batchB,
      sequence: 1,
    },
    affectedFromSequence: 1,
    affectedBatches: [
      {
        sourceBatchId: ids.batchB,
        sequence: 1,
        status: 'queued',
        membershipFrozen: false,
        orderIds: [ids.existingB, ids.newOrder],
        priorityOrderIds: [],
        derivedWeightLbs: 60,
        bagCount: 2,
        stages: stages('2026-07-14T14:56:00.000Z'),
        changed: true,
      },
    ],
    projectedCompletionAt: new Date(
      Date.parse('2026-07-14T14:56:00.000Z') + 4 * 56 * 60_000,
    ).toISOString(),
    overtime: {
      required: overtimeMinutes > 0,
      shiftEndsAt: '2026-07-14T22:00:00.000Z',
      overrunMinutes: overtimeMinutes,
    },
  };
};

const placedResult = (
  proposal: OnlinePlacementProposal,
  mode: 'automatic' | 'manager_exact',
): ProductionOrderPlacedResult => ({
  status: 'placed',
  mode,
  productionRunId: ids.run,
  productionOrderId: ids.newOrder,
  productionBatchId: ids.batchB,
  createdBatch: false,
  affectedBatchIds: [ids.batchB],
  queueVersion: proposal.expectedQueueVersion + 1,
  proposalHash: proposal.placementPlanHash,
  plannedCompletionAt: proposal.projectedCompletionAt,
  overtimeMinutes: proposal.overtime.overrunMinutes,
  replayed: false,
});

const makePolicy = (
  decide: ProductionRules['evaluatePlacementCommit'],
): ProductionRules =>
  ({
    ...allowPolicy,
    evaluatePlacementCommit: vi.fn(decide),
  }) satisfies ProductionRules;

const allowPlacement: ProductionRules['evaluatePlacementCommit'] = () => ({
  tag: 'ok',
  value: { commit: true },
});

const makeScheduler = (
  proposal: OnlinePlacementProposal,
): Pick<ProductionAlgorithmRegistry, 'proposeOnlinePlacement'> => ({
  proposeOnlinePlacement: vi.fn(() => proposal),
});

const makeRepository = (
  input: {
    context?: ProductionOrderPlacementContext;
    overtime?: StoredOvertimeProposal | null;
    proposal?: OnlinePlacementProposal;
  } = {},
) => {
  const context = input.context ?? makeContext();
  const proposal = input.proposal ?? makeProposal();
  const recordOutcome = vi.fn(async () => undefined);
  const commitPlacement = vi.fn(async (command) =>
    placedResult(command.proposal, command.mode),
  );
  const findWorkEvent = vi.fn(
    async (): Promise<StoredWorkEvent | null> => null,
  );
  const operations = {
    findWorkEvent,
    lockLocationScheduling: vi.fn(async () => undefined),
    findStartedRuns: vi.fn(async () => []),
    recordPendingRunResolution: vi.fn(async () => undefined),
    loadContext: vi.fn(async () => context),
    findOvertimeProposal: vi.fn(async () => input.overtime ?? null),
    recordOutcome,
    commitPlacement,
  };
  const repo: PlaceProductionOrderRepository = {
    transaction: async (work) => work(operations),
  };
  return { repo, operations, recordOutcome, commitPlacement, proposal };
};

const automaticCommand = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionOrderId: ids.newOrder,
  expectedQueueVersion: 4,
  idempotencyKey: 'place-order-automatic-1',
  actorId: ids.actor,
  authorizedAction: 'production:queue' as const,
};

const makePlacement = (input: {
  repository: ReturnType<typeof makeRepository>;
  policy?: ProductionRules;
  scheduler?: Pick<ProductionAlgorithmRegistry, 'proposeOnlinePlacement'>;
  signals?: ProductionSignalsPort;
}) =>
  makePlaceProductionOrder({
    repo: input.repository.repo,
    policy: input.policy ?? makePolicy(allowPlacement),
    scheduler: input.scheduler ?? makeScheduler(input.repository.proposal),
    clock: { now: () => new Date('2026-07-14T15:00:00.000Z') },
    signals: input.signals ?? nullProductionSignals,
  });

describe('place production order', () => {
  it('commits automatic placement without moving existing membership', async () => {
    const context = makeContext();
    const original = structuredClone(context.input.batches);
    const repository = makeRepository({ context });
    const scheduler = makeScheduler(repository.proposal);
    const placementOutcome = vi.fn();
    const placement = makePlacement({
      repository,
      scheduler,
      signals: { ...nullProductionSignals, placementOutcome },
    });

    await expect(
      placement.placeAutomatically(automaticCommand),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        status: 'placed',
        mode: 'automatic',
        productionBatchId: ids.batchB,
        queueVersion: 5,
      },
    });
    expect(repository.commitPlacement).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'automatic',
        targetBatchId: null,
        overtimeConfirmed: false,
      }),
    );
    expect(context.input.batches).toEqual(original);
    expect(placementOutcome).toHaveBeenCalledWith({
      status: 'placed',
      mode: 'automatic',
    });
    expect(
      repository.commitPlacement.mock.calls[0]?.[0].proposal,
    ).toMatchObject({
      affectedBatches: [
        {
          sourceBatchId: ids.batchB,
          orderIds: [ids.existingB, ids.newOrder],
        },
      ],
    });
  });

  it('rechecks idempotency after acquiring the run lock', async () => {
    const repository = makeRepository();
    const storedResult = placedResult(repository.proposal, 'automatic');
    repository.operations.findWorkEvent
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        valid: true,
        command: {
          operation: 'production_order_placed_automatically',
          locationId: automaticCommand.locationId,
          actorId: automaticCommand.actorId,
          target: {
            entityType: 'production_order',
            entityId: automaticCommand.productionOrderId,
          },
          expectedVersion: automaticCommand.expectedQueueVersion,
          payload: {
            expectedQueueVersion: automaticCommand.expectedQueueVersion,
            mode: 'automatic',
            authorizedAction: automaticCommand.authorizedAction,
          },
        },
        result: storedResult,
      });
    const placementOutcome = vi.fn();
    const placement = makePlacement({
      repository,
      signals: { ...nullProductionSignals, placementOutcome },
    });

    await expect(
      placement.placeAutomatically(automaticCommand),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { status: 'placed', queueVersion: 5, replayed: true },
    });
    expect(repository.operations.loadContext).toHaveBeenCalledOnce();
    expect(repository.commitPlacement).not.toHaveBeenCalled();
    expect(placementOutcome).not.toHaveBeenCalled();
  });

  it('rejects exact placement when the target batch version is stale', async () => {
    const repository = makeRepository();
    const scheduler = makeScheduler(repository.proposal);
    const placement = makePlacement({ repository, scheduler });

    await expect(
      placement.placeExactly({
        ...automaticCommand,
        authorizedAction: 'production:override',
        productionBatchId: ids.batchB,
        expectedBatchVersion: 2,
        idempotencyKey: 'place-order-exact-stale',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        status: 'not_placed',
        mode: 'manager_exact',
        reason: 'queue_conflict',
      },
    });
    expect(scheduler.proposeOnlinePlacement).not.toHaveBeenCalled();
    expect(repository.commitPlacement).not.toHaveBeenCalled();
    expect(repository.recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'manager_exact',
        targetBatchId: ids.batchB,
        proposal: null,
      }),
    );
  });

  it('passes exact placement as a durable manager pin intent', async () => {
    const repository = makeRepository();
    const placement = makePlacement({ repository });

    await placement.placeExactly({
      ...automaticCommand,
      authorizedAction: 'production:override',
      productionBatchId: ids.batchB,
      expectedBatchVersion: 3,
      idempotencyKey: 'place-order-exact-current',
    });

    expect(repository.commitPlacement).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'manager_exact',
        targetBatchId: ids.batchB,
        actorId: ids.actor,
      }),
    );
  });

  it('returns a version-bound overtime proposal without committing it', async () => {
    const proposal = makeProposal({ overtimeMinutes: 35 });
    const repository = makeRepository({ proposal });
    const policy = makePolicy(() => ({
      tag: 'err',
      error: {
        code: 'OVERTIME_CONFIRMATION_REQUIRED',
        message: 'Manager confirmation is required.',
      },
    }));
    const placement = makePlacement({
      repository,
      policy,
      scheduler: makeScheduler(proposal),
    });

    await expect(
      placement.placeAutomatically(automaticCommand),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        status: 'confirmation_required',
        proposalHash: proposal.placementPlanHash,
        queueVersion: 4,
        overtimeMinutes: 35,
      },
    });
    expect(repository.commitPlacement).not.toHaveBeenCalled();
    expect(repository.recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({ status: 'confirmation_required' }),
        proposal,
      }),
    );
  });

  it('rejects overtime confirmation when recomputation changes the proposal', async () => {
    const originalHash = 'b'.repeat(64);
    const changed = makeProposal({
      proposalHash: 'c'.repeat(64),
      overtimeMinutes: 35,
    });
    const repository = makeRepository({
      proposal: changed,
      overtime: {
        mode: 'automatic',
        targetBatchId: null,
        proposalHash: originalHash,
        queueVersion: 4,
      },
    });
    const policy = makePolicy(allowPlacement);
    const placement = makePlacement({
      repository,
      policy,
      scheduler: makeScheduler(changed),
    });

    await expect(
      placement.confirmOvertime({
        ...automaticCommand,
        authorizedAction: 'production:override',
        proposalHash: originalHash,
        idempotencyKey: 'confirm-overtime-stale',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { status: 'not_placed', reason: 'proposal_stale' },
    });
    expect(policy.evaluatePlacementCommit).not.toHaveBeenCalled();
    expect(repository.commitPlacement).not.toHaveBeenCalled();
  });

  it('invalidates overtime acceptance after the queue version changes', async () => {
    const proposal = makeProposal({ overtimeMinutes: 35 });
    const repository = makeRepository({
      proposal,
      overtime: {
        mode: 'automatic',
        targetBatchId: null,
        proposalHash: proposal.placementPlanHash,
        queueVersion: 3,
      },
    });
    const policy = makePolicy(allowPlacement);
    const placementOutcome = vi.fn();
    const overtimeConfirmed = vi.fn();
    const placement = makePlacement({
      repository,
      policy,
      scheduler: makeScheduler(proposal),
      signals: {
        ...nullProductionSignals,
        placementOutcome,
        overtimeConfirmed,
      },
    });

    await expect(
      placement.confirmOvertime({
        ...automaticCommand,
        authorizedAction: 'production:override',
        proposalHash: proposal.placementPlanHash,
        idempotencyKey: 'confirm-overtime-old-queue',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        status: 'not_placed',
        reason: 'proposal_stale',
        queueVersion: 4,
      },
    });
    expect(policy.evaluatePlacementCommit).not.toHaveBeenCalled();
    expect(repository.commitPlacement).not.toHaveBeenCalled();
    expect(placementOutcome).toHaveBeenCalledWith({
      status: 'not_placed',
      mode: 'automatic',
      reason: 'proposal_stale',
    });
    expect(overtimeConfirmed).not.toHaveBeenCalled();
  });

  it('commits matching overtime confirmation as the stored placement mode', async () => {
    const proposal = makeProposal({ overtimeMinutes: 35 });
    const repository = makeRepository({
      proposal,
      overtime: {
        mode: 'manager_exact',
        targetBatchId: ids.batchB,
        proposalHash: proposal.placementPlanHash,
        queueVersion: 4,
      },
    });
    const policy = makePolicy(allowPlacement);
    const placementOutcome = vi.fn();
    const overtimeConfirmed = vi.fn();
    const placement = makePlacement({
      repository,
      policy,
      scheduler: makeScheduler(proposal),
      signals: {
        ...nullProductionSignals,
        placementOutcome,
        overtimeConfirmed,
      },
    });

    await expect(
      placement.confirmOvertime({
        ...automaticCommand,
        authorizedAction: 'production:override',
        proposalHash: proposal.placementPlanHash,
        idempotencyKey: 'confirm-overtime-current',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { status: 'placed', mode: 'manager_exact', queueVersion: 5 },
    });
    expect(repository.commitPlacement).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'manager_exact',
        targetBatchId: ids.batchB,
        overtimeConfirmed: true,
      }),
    );
    expect(placementOutcome).toHaveBeenCalledWith({
      status: 'placed',
      mode: 'manager_exact',
    });
    expect(overtimeConfirmed).toHaveBeenCalledOnce();
  });

  it('returns a visible queue conflict instead of committing stale work', async () => {
    const context = makeContext(5);
    const proposal = makeProposal({ queueVersion: 5 });
    const repository = makeRepository({ context, proposal });
    const placementOutcome = vi.fn();
    const queueConflict = vi.fn();
    const placement = makePlacement({
      repository,
      scheduler: makeScheduler(proposal),
      policy: makePolicy(() => ({
        tag: 'err',
        error: {
          code: 'QUEUE_VERSION_CONFLICT',
          message: 'The queue changed.',
        },
      })),
      signals: {
        ...nullProductionSignals,
        placementOutcome,
        queueConflict,
      },
    });

    await expect(
      placement.placeAutomatically(automaticCommand),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        status: 'not_placed',
        reason: 'queue_conflict',
        queueVersion: 5,
      },
    });
    expect(repository.commitPlacement).not.toHaveBeenCalled();
    expect(placementOutcome).toHaveBeenCalledWith({
      status: 'not_placed',
      mode: 'automatic',
      reason: 'queue_conflict',
    });
    expect(queueConflict).toHaveBeenCalledWith({
      operation: 'automatic_placement',
    });
  });
});
