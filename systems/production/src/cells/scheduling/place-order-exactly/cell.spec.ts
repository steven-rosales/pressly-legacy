import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import {
  makePlaceOrderExactlyCell,
  placeOrderExactlyCellDeclaration,
} from './cell.ts';
import { placeOrderExactlyContract } from './contract.ts';
import { placeOrderExactlyIdempotency } from './idempotency.ts';
import type { PlaceOrderExactlyCommand } from './types.ts';

const command: PlaceOrderExactlyCommand = {
  locationId: 'location-1',
  productionRunId: '10000000-0000-4000-8000-000000000001',
  productionBatchId: '10000000-0000-4000-8000-000000000002',
  productionOrderId: '10000000-0000-4000-8000-000000000003',
  expectedQueueVersion: 4,
  expectedBatchVersion: 3,
  idempotencyKey: 'place-exact-1',
  actorId: '10000000-0000-4000-8000-000000000004',
  authorizedAction: 'production:override',
};

describe('production.place-order-exactly.v1 cell', () => {
  it('declares selected exact command ownership and optimistic fences', () => {
    expect(placeOrderExactlyCellDeclaration).toMatchObject({
      id: 'production.place-order-exactly.v1',
      kind: 'command',
      authentication: 'required',
      authorization: {
        capability: 'production:override',
        timing: 'after-input',
      },
      consistency: { transaction: 'required', concurrency: 'optimistic' },
      idempotency: { required: true },
      emits: [],
      consumes: [],
      observability: { operation: 'production.place_order_exactly' },
    });
    expect(placeOrderExactlyCellDeclaration.contract).toBe(
      placeOrderExactlyContract,
    );
    expect(
      placeOrderExactlyCellDeclaration.authorization?.timing === 'after-input'
        ? placeOrderExactlyCellDeclaration.authorization.scope(command)
        : null,
    ).toBe('location-1');
    expect(
      placeOrderExactlyCellDeclaration.consistency.concurrency === 'optimistic'
        ? placeOrderExactlyCellDeclaration.consistency.expectedVersion?.(
            command,
          )
        : null,
    ).toBe('4:3');
  });

  it('binds the injected exact proposal capability without assembly', async () => {
    const transaction = vi.fn(async (work) =>
      work({
        findWorkEvent: async () => null,
        loadContext: async () => null,
        savePendingOutcome: async () => undefined,
        commitPlacement: async () => ({
          kind: 'conflict' as const,
          failure: {
            kind: 'conflict' as const,
            code: 'unreachable',
            message: 'Unreachable.',
            safeMessage: 'Unreachable.',
          },
        }),
        appendWorkEvent: async () => undefined,
      }),
    );
    const cell = makePlaceOrderExactlyCell({
      repo: { transaction },
      idempotency: placeOrderExactlyIdempotency,
      policy: productionRules,
      proposeOnlinePlacement: () => ({
        kind: 'rejected',
        algorithmVersion: 'online-stable-insertion-v1',
        inputSnapshotHash: 'a'.repeat(64),
        reason: { code: 'fixture', message: 'Fixture.' },
      }),
      clock: { now: () => new Date('2026-08-22T14:00:00.000Z') },
    });
    await expect(cell.execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_placement_context_not_found' },
    });
    expect(transaction).toHaveBeenCalledOnce();
  });
});
