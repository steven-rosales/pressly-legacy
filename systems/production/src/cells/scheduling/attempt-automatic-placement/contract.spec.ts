import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it } from 'vitest';
import { attemptAutomaticPlacementCellDeclaration } from './cell.ts';
import { attemptAutomaticPlacementContract } from './contract.ts';
import type { AttemptAutomaticPlacementCommand } from './types.ts';

const command: AttemptAutomaticPlacementCommand = {
  locationId: 'location-1',
  productionOrderId: 'order-1',
  idempotencyKey: 'attempt-1',
  actorId: 'actor-1',
  authorizedAction: 'production:queue',
};

describe('attempt automatic placement contract', () => {
  proveOperation({
    operationId: 'production.attempt-automatic-placement.v1',
    declaration: attemptAutomaticPlacementCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips both internal Production capabilities and rejects unknown fields',
        proves: ['contract'],
        run: () => {
          for (const authorizedAction of [
            'production:queue',
            'production:override',
          ] as const) {
            const value = { ...command, authorizedAction };
            expect(
              attemptAutomaticPlacementContract.input.decode(
                attemptAutomaticPlacementContract.input.encode(value),
              ),
            ).toEqual({ kind: 'valid', value });
          }
          expect(
            attemptAutomaticPlacementContract.input.decode({
              ...command,
              authorizedAction: 'production:schedule',
            }),
          ).toMatchObject({ kind: 'invalid' });
        },
      },
    ],
  });

  it('round-trips null and the confirmation replay quirk', () => {
    expect(
      attemptAutomaticPlacementContract.output.decode(
        attemptAutomaticPlacementContract.output.encode(null),
      ),
    ).toEqual({ kind: 'valid', value: null });
    const confirmationReplay = {
      status: 'confirmation_required' as const,
      mode: 'automatic' as const,
      productionRunId: '10000000-0000-4000-8000-000000000001',
      productionOrderId: '10000000-0000-4000-8000-000000000002',
      target: { kind: 'new_batch' as const, sequence: 2 },
      affectedBatchIds: [],
      queueVersion: 4,
      proposalHash: 'a'.repeat(64),
      projectedCompletionAt: '2026-08-22T20:00:00.000Z',
      overtimeMinutes: 15,
      replayed: true,
    };
    expect(
      attemptAutomaticPlacementContract.output.decode(
        attemptAutomaticPlacementContract.output.encode(confirmationReplay),
      ),
    ).toEqual({ kind: 'valid', value: confirmationReplay });
  });

  it('accepts only the delegated automatic-placement failure language', () => {
    const expected = {
      kind: 'not_found' as const,
      code: 'production_placement_context_not_found' as const,
      message: 'Not found.',
      safeMessage: 'Not found.',
    };
    expect(
      attemptAutomaticPlacementContract.failure.decode(
        attemptAutomaticPlacementContract.failure.encode(expected),
      ),
    ).toEqual({ kind: 'valid', value: expected });
    expect(
      attemptAutomaticPlacementContract.failure.decode({
        ...expected,
        code: 'unknown',
      }),
    ).toMatchObject({ kind: 'invalid' });
  });
});
