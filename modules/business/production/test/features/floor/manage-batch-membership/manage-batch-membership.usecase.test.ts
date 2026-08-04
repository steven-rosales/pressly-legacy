import { describe, expect, it, vi } from 'vitest';
import type { ProductionBatchMembershipMutationResult } from '../../../../src/features/floor/manage-batch-membership/manage-batch-membership.model.ts';
import type { ProductionRules } from '../../../../src/foundations/language/rules/production-rules.factory.ts';
import type {
  BatchMembershipContext,
  ManageBatchMembershipRepository,
} from '../../../../src/features/floor/manage-batch-membership/manage-batch-membership.port.ts';
import { makeManageBatchMembership } from '../../../../src/features/floor/manage-batch-membership/manage-batch-membership.usecase.ts';
import { nullProductionSignals } from '../../../../src/foundations/adapters/signals/null-production-signals.adapter.ts';

const ids = {
  run: '11111111-1111-4111-8111-111111111111',
  batch: '22222222-2222-4222-8222-222222222222',
  actor: '33333333-3333-4333-8333-333333333333',
} as const;

const context = (
  overrides: {
    queueVersion?: number;
    batchVersion?: number;
    status?: string;
    frozen?: boolean;
  } = {},
): BatchMembershipContext => ({
  productionRun: {
    id: ids.run,
    status: 'started',
    queueVersion: overrides.queueVersion ?? 4,
  },
  productionBatch: {
    id: ids.batch,
    status: overrides.status ?? 'queued',
    version: overrides.batchVersion ?? 7,
    membershipFrozenAt:
      overrides.frozen === true ? new Date('2026-07-14T14:00:00.000Z') : null,
    membershipFrozenBy: overrides.frozen === true ? ids.actor : null,
  },
});

const policy = {
  evaluateBatchMembershipTransition: vi.fn(
    (
      input: Parameters<
        ProductionRules['evaluateBatchMembershipTransition']
      >[0],
    ) => {
      if (input.batchStatus !== 'queued')
        return {
          tag: 'err' as const,
          error: {
            code: 'BATCH_MEMBERSHIP_IMMUTABLE',
            message: 'Membership cannot change after work starts.',
          },
        };
      if (
        input.action === 'unfreeze' &&
        input.authorizedAction !== 'production:override'
      )
        return {
          tag: 'err' as const,
          error: {
            code: 'BATCH_UNFREEZE_FORBIDDEN',
            message: 'Only managers can unfreeze queued work.',
          },
        };
      return {
        tag: 'ok' as const,
        value: { membershipFrozen: input.action === 'freeze' },
      };
    },
  ),
} as unknown as ProductionRules;

const makeRepository = (
  loaded: BatchMembershipContext | null,
): {
  repo: ManageBatchMembershipRepository;
  changeBatchMembership: ReturnType<typeof vi.fn>;
  appendWorkEvent: ReturnType<typeof vi.fn>;
} => {
  const mutation: ProductionBatchMembershipMutationResult = {
    productionRunId: ids.run,
    productionBatchId: ids.batch,
    queueVersion: 5,
    batchVersion: 8,
    membership: {
      state: 'frozen',
      frozenAt: '2026-07-14T15:00:00.000Z',
      frozenBy: ids.actor,
    },
    replayed: false,
  };
  const changeBatchMembership = vi.fn(async () => mutation);
  const appendWorkEvent = vi.fn(async () => undefined);
  const operations = {
    findWorkEvent: vi.fn(async () => null),
    lockBatchMembershipContext: vi.fn(async () => loaded),
    changeBatchMembership,
    appendWorkEvent,
  };

  return {
    repo: {
      transaction: async (work) => work(operations),
    },
    changeBatchMembership,
    appendWorkEvent,
  };
};

const freezeCommand = {
  action: 'freeze' as const,
  locationId: 'location-1',
  productionRunId: ids.run,
  productionBatchId: ids.batch,
  expectedQueueVersion: 4,
  expectedBatchVersion: 7,
  actorId: ids.actor,
  authorizedAction: 'production:queue' as const,
  idempotencyKey: 'freeze-batch-1',
};

describe('manage batch membership', () => {
  it('freezes a queued batch and records the queue-versioned command', async () => {
    const repository = makeRepository(context());
    const batchFrozen = vi.fn();
    const manage = makeManageBatchMembership({
      repo: repository.repo,
      policy,
      clock: { now: () => new Date('2026-07-14T15:00:00.000Z') },
      signals: { ...nullProductionSignals, batchFrozen },
    });

    await expect(manage(freezeCommand)).resolves.toMatchObject({
      tag: 'ok',
      value: {
        productionRunId: ids.run,
        productionBatchId: ids.batch,
        queueVersion: 5,
        batchVersion: 8,
        membership: { state: 'frozen' },
      },
    });
    expect(repository.changeBatchMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'freeze',
        expectedQueueVersion: 4,
        expectedBatchVersion: 7,
      }),
    );
    expect(repository.appendWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'batch_membership_frozen',
        entityId: ids.batch,
      }),
    );
    expect(batchFrozen).toHaveBeenCalledWith({ source: 'explicit' });
  });

  it('rejects a stale queue version before changing membership', async () => {
    const repository = makeRepository(context({ queueVersion: 5 }));
    const queueConflict = vi.fn();
    const manage = makeManageBatchMembership({
      repo: repository.repo,
      policy,
      clock: { now: () => new Date('2026-07-14T15:00:00.000Z') },
      signals: { ...nullProductionSignals, queueConflict },
    });

    await expect(manage(freezeCommand)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_queue_version_conflict', kind: 'conflict' },
    });
    expect(repository.changeBatchMembership).not.toHaveBeenCalled();
    expect(queueConflict).toHaveBeenCalledWith({
      operation: 'freeze_membership',
    });
  });

  it('keeps membership immutable after the batch leaves the queue', async () => {
    const repository = makeRepository(context({ status: 'sorting' }));
    const manage = makeManageBatchMembership({
      repo: repository.repo,
      policy,
      clock: { now: () => new Date('2026-07-14T15:00:00.000Z') },
      signals: nullProductionSignals,
    });

    await expect(manage(freezeCommand)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'batch_membership_immutable', kind: 'conflict' },
    });
    expect(repository.changeBatchMembership).not.toHaveBeenCalled();
  });
});
