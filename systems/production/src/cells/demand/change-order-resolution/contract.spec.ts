import { proveOperation } from '@pressly/testkit/operation-proof';
import { changeOrderResolutionCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { changeOrderResolutionContract } from './contract.ts';
import type { ChangeOrderResolutionCommand } from './types.ts';

const scope = {
  locationId: 'location-1',
  productionOrderId: '10000000-0000-4000-8000-000000000001',
  actorId: '10000000-0000-4000-8000-000000000002',
  expectedVersion: 4,
};

describe('change order resolution contract', () => {
  proveOperation({
    operationId: 'production.change-order-resolution.v1',
    declaration: changeOrderResolutionCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips resolve including the trusted source precondition',
        proves: ['contract'],
        run: () => {
          const input: ChangeOrderResolutionCommand = {
            ...scope,
            action: 'resolve_without_production',
            reason: 'order_will_not_be_produced',
            note: null,
            confirmReviewedFacts: false,
            sourceStatePrecondition: {
              commercialState: 'open',
              admissionState: 'unreleased',
            },
            idempotencyKey: 'resolve-order-command-1',
          };
          expect(
            changeOrderResolutionContract.input.decode(
              changeOrderResolutionContract.input.encode(input),
            ),
          ).toEqual({ kind: 'valid', value: input });
        },
      },
    ],
  });

  it('round-trips restore without a resolve-only field', () => {
    const input: ChangeOrderResolutionCommand = {
      ...scope,
      action: 'restore',
      reason: 'manager_correction',
      note: null,
      idempotencyKey: 'restore-order-command-1',
    };
    expect(
      changeOrderResolutionContract.input.decode(
        changeOrderResolutionContract.input.encode(input),
      ),
    ).toEqual({ kind: 'valid', value: input });
  });

  it('round-trips the exact result and rejects malformed input', () => {
    const output = {
      locationId: scope.locationId,
      orderId: scope.productionOrderId,
      action: 'resolve_without_production' as const,
      resolutionState: 'resolved_without_production' as const,
      transitionedAt: '2026-08-21T15:00:00.000Z',
      version: 5,
      replayed: false,
    };
    expect(
      changeOrderResolutionContract.output.decode(
        changeOrderResolutionContract.output.encode(output),
      ),
    ).toEqual({ kind: 'valid', value: output });
    expect(
      changeOrderResolutionContract.input.decode({
        body: {
          action: 'resolve_without_production',
          reason: 'other',
          note: null,
          expectedVersion: 4,
          idempotencyKey: 'resolve-order-command-1',
        },
        params: {
          locationId: scope.locationId,
          productionOrderId: scope.productionOrderId,
        },
        actorId: scope.actorId,
      }),
    ).toMatchObject({ kind: 'invalid' });
  });
});
