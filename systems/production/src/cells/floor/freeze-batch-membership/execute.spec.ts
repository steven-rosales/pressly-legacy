import { proveOperation } from '@pressly/testkit/operation-proof';
import { freezeBatchMembershipCellDeclaration } from './cell.ts';
import { productionRules } from '../../../model/public.ts';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteFreezeBatchMembership } from './execute.ts';
import { freezeBatchMembershipIdempotency } from './idempotency.ts';

const command = {
  locationId: 'location-1',
  productionRunId: '10000000-0000-4000-8000-000000000001',
  productionBatchId: '10000000-0000-4000-8000-000000000002',
  expectedQueueVersion: 4,
  expectedBatchVersion: 7,
  idempotencyKey: 'freeze-1',
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
    membershipFrozenAt: null,
    membershipFrozenBy: null,
  },
};
const mutation = {
  productionRunId: command.productionRunId,
  productionBatchId: command.productionBatchId,
  queueVersion: 5,
  batchVersion: 8,
  membership: {
    state: 'frozen' as const,
    frozenAt: '2026-08-21T15:00:00.000Z',
    frozenBy: command.actorId,
  },
  replayed: false,
};

describe('freeze batch membership executor', () => {
  proveOperation({
    operationId: 'production.freeze-batch-membership.v1',
    declaration: freezeBatchMembershipCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'double-checks replay, commits one event, then signals',
        proves: ['executor-success'],
        run: async () => {
          const calls: string[] = [];
          const batchFrozen = vi.fn();
          const execute = makeExecuteFreezeBatchMembership({
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
                  freezeBatchMembership: async () => {
                    calls.push('mutate');
                    return { kind: 'success', value: mutation };
                  },
                  appendWorkEvent: async () => {
                    calls.push('event');
                  },
                }),
            },
            idempotency: freezeBatchMembershipIdempotency,
            policy: productionRules,
            clock: { now: () => new Date('2026-08-21T15:00:00.000Z') },
            signals: { batchFrozen, queueConflict: vi.fn() },
          });
          await expect(execute(command)).resolves.toEqual({
            kind: 'success',
            value: mutation,
          });
          expect(calls).toEqual(['find', 'lock', 'find', 'mutate', 'event']);
          expect(batchFrozen).toHaveBeenCalledWith({ source: 'explicit' });
        },
      },
    ],
  });

  it('does not signal or mutate a replay', async () => {
    const mutate = vi.fn();
    const batchFrozen = vi.fn();
    const execute = makeExecuteFreezeBatchMembership({
      repo: {
        transaction: async (work) =>
          work({
            findWorkEvent: async () => ({
              valid: true,
              command: {
                operation: 'batch_membership_frozen',
                locationId: command.locationId,
                actorId: command.actorId,
                target: {
                  entityType: 'production_batch',
                  entityId: command.productionBatchId,
                },
                expectedVersion: 7,
                payload: { action: 'freeze', expectedQueueVersion: 4 },
              },
              result: mutation,
            }),
            lockBatchMembershipContext: vi.fn(),
            freezeBatchMembership: mutate,
            appendWorkEvent: vi.fn(),
          }),
      },
      idempotency: freezeBatchMembershipIdempotency,
      policy: productionRules,
      clock: { now: () => new Date() },
      signals: { batchFrozen, queueConflict: vi.fn() },
    });
    await expect(execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: { replayed: true },
    });
    expect(mutate).not.toHaveBeenCalled();
    expect(batchFrozen).not.toHaveBeenCalled();
  });
});
