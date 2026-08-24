import { describe, expect, it, vi } from 'vitest';
import { invariantViolationError } from '@pressly/errors/factories';
import { productionRules } from '../../../model/public.ts';
import {
  commitOrderRouteCellDeclaration,
  makeCommitOrderRouteCell,
} from './cell.ts';
import { commitOrderRouteContract } from './contract.ts';
import { commitOrderRouteIdempotency } from './idempotency.ts';
import type { CommitOrderRouteCommand } from './types.ts';

const command: CommitOrderRouteCommand = {
  locationId: 'location-1',
  productionRunId: '10000000-0000-4000-8000-000000000001',
  productionOrderId: '10000000-0000-4000-8000-000000000002',
  actorId: '10000000-0000-4000-8000-000000000003',
  authorizedAction: 'production:stage',
  kind: 'queued_move',
  reason: 'manual_rebatch',
  targetProductionBatchId: '10000000-0000-4000-8000-000000000004',
  restartStage: 'sorting',
  expectedQueueVersion: 4,
  expectedOrderVersion: 3,
  expectedSourceBatchVersion: 2,
  proposalHash: 'a'.repeat(64),
  idempotencyKey: 'commit-route-1',
};

describe('production.commit-order-route.v1 cell', () => {
  it('declares selected command ownership, staged auth, optimistic fence, and idempotency', () => {
    expect(commitOrderRouteCellDeclaration).toMatchObject({
      id: 'production.commit-order-route.v1',
      kind: 'command',
      authentication: 'required',
      authorization: {
        capability: 'production:stage',
        timing: 'after-input',
      },
      consistency: { transaction: 'required', concurrency: 'optimistic' },
      idempotency: { required: true },
      emits: [],
      consumes: [],
      retry: null,
      timeoutMs: null,
      observability: { operation: 'production.commit_order_route' },
    });
    expect(commitOrderRouteCellDeclaration.contract).toBe(
      commitOrderRouteContract,
    );
    expect(
      commitOrderRouteCellDeclaration.authorization?.timing === 'after-input'
        ? commitOrderRouteCellDeclaration.authorization.scope(command)
        : null,
    ).toBe('location-1');
    expect(
      commitOrderRouteCellDeclaration.consistency.concurrency === 'optimistic'
        ? commitOrderRouteCellDeclaration.consistency.expectedVersion?.(command)
        : null,
    ).toBe(`4:3:2:${command.proposalHash}`);
  });

  it('binds only operation-owned commit dependencies', async () => {
    const transaction = vi.fn(async (work) =>
      work({
        findWorkEvent: async () => null,
        loadContextForUpdate: async () => null,
        commit: async () => {
          throw invariantViolationError({
            code: 'unreachable_commit_fixture',
            message: 'Unreachable commit fixture.',
            safeMessage: 'Unreachable commit fixture.',
          });
        },
        appendWorkEvent: async () => undefined,
      }),
    );
    const cell = makeCommitOrderRouteCell({
      repo: { transaction },
      idempotency: commitOrderRouteIdempotency,
      policy: productionRules,
      clock: { now: () => new Date('2026-08-22T14:00:00.000Z') },
    });

    await expect(cell.execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_route_not_found' },
    });
    expect(transaction).toHaveBeenCalledOnce();
  });
});
