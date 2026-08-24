import { proveOperation } from '@pressly/testkit/operation-proof';
import { unfreezeBatchMembershipCellDeclaration } from './cell.ts';
import { productionRules } from '../../../model/public.ts';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteUnfreezeBatchMembership } from './execute.ts';
import { unfreezeBatchMembershipIdempotency } from './idempotency.ts';

const command = {
  locationId: 'location-1',
  productionRunId: '10000000-0000-4000-8000-000000000001',
  productionBatchId: '10000000-0000-4000-8000-000000000002',
  expectedQueueVersion: 4,
  expectedBatchVersion: 7,
  idempotencyKey: 'unfreeze-1',
  actorId: '10000000-0000-4000-8000-000000000003',
} as const;
const facts = {
  productionRun: {
    id: command.productionRunId,
    status: 'started',
    queueVersion: 4,
  },
  productionBatch: {
    id: command.productionBatchId,
    status: 'queued',
    version: 7,
    membershipFrozenAt: new Date('2026-08-21T14:00:00.000Z'),
    membershipFrozenBy: command.actorId,
  },
};
const mutation = {
  productionRunId: command.productionRunId,
  productionBatchId: command.productionBatchId,
  queueVersion: 5,
  batchVersion: 8,
  membership: { state: 'mutable' as const },
  replayed: false,
};

describe('unfreeze batch membership executor', () => {
  proveOperation({
    operationId: 'production.unfreeze-batch-membership.v1',
    declaration: unfreezeBatchMembershipCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'double-checks replay and commits one audited mutation',
        proves: ['executor-success'],
        run: async () => {
          const calls: string[] = [];
          const execute = makeExecuteUnfreezeBatchMembership({
            repo: {
              transaction: async (work) =>
                work({
                  findWorkEvent: async () => {
                    calls.push('find');
                    return null;
                  },
                  lockBatchMembershipContext: async () => {
                    calls.push('lock');
                    return facts;
                  },
                  unfreezeBatchMembership: async () => {
                    calls.push('mutate');
                    return { kind: 'success', value: mutation };
                  },
                  appendWorkEvent: async () => {
                    calls.push('event');
                  },
                }),
            },
            idempotency: unfreezeBatchMembershipIdempotency,
            policy: productionRules,
            clock: { now: () => new Date('2026-08-21T15:00:00.000Z') },
          });
          await expect(execute(command)).resolves.toEqual({
            kind: 'success',
            value: mutation,
          });
          expect(calls).toEqual(['find', 'lock', 'find', 'mutate', 'event']);
        },
      },
    ],
  });

  it('signals queue conflict after rejection', async () => {
    const queueConflict = vi.fn();
    const execute = makeExecuteUnfreezeBatchMembership({
      repo: {
        transaction: async (work) =>
          work({
            findWorkEvent: async () => null,
            lockBatchMembershipContext: async () => ({
              ...facts,
              productionRun: { ...facts.productionRun, queueVersion: 5 },
            }),
            unfreezeBatchMembership: vi.fn(),
            appendWorkEvent: vi.fn(),
          }),
      },
      idempotency: unfreezeBatchMembershipIdempotency,
      policy: productionRules,
      clock: { now: () => new Date() },
      signals: { queueConflict },
    });
    await expect(execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_queue_version_conflict' },
    });
    expect(queueConflict).toHaveBeenCalledWith({
      operation: 'unfreeze_membership',
    });
  });
});
