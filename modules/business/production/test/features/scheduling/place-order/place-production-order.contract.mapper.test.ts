import { describe, expect, it } from 'vitest';
import {
  toAutomaticProductionOrderPlacementResult,
  toConfirmProductionOrderOvertimeCommand,
  toConfirmProductionOrderOvertimeResult,
  toExactProductionOrderPlacementResult,
  toPlaceProductionOrderAutomaticallyCommand,
  toPlaceProductionOrderExactlyCommand,
} from '../../../../src/features/scheduling/place-order/place-production-order.contract.mapper.ts';

const identity = {
  locationId: 'location-1',
  productionRunId: '11111111-1111-4111-8111-111111111111',
  productionOrderId: '22222222-2222-4222-8222-222222222222',
  actorId: '33333333-3333-4333-8333-333333333333',
  authorizedAction: 'production:override' as const,
};

describe('place Production order mapper', () => {
  it('combines parsed automatic-placement input with route and actor scope', () => {
    expect(
      toPlaceProductionOrderAutomaticallyCommand(identity, {
        expectedQueueVersion: 4,
        idempotencyKey: 'place-automatic-123',
      }),
    ).toEqual({
      ...identity,
      expectedQueueVersion: 4,
      idempotencyKey: 'place-automatic-123',
    });
  });

  it('combines exact-placement input with its batch scope', () => {
    const batchIdentity = {
      ...identity,
      productionBatchId: '44444444-4444-4444-8444-444444444444',
    };

    expect(
      toPlaceProductionOrderExactlyCommand(batchIdentity, {
        expectedQueueVersion: 4,
        expectedBatchVersion: 2,
        idempotencyKey: 'place-exact-123',
      }),
    ).toEqual({
      ...batchIdentity,
      expectedQueueVersion: 4,
      expectedBatchVersion: 2,
      idempotencyKey: 'place-exact-123',
    });
  });

  it('combines overtime confirmation input with route and actor scope', () => {
    expect(
      toConfirmProductionOrderOvertimeCommand(identity, {
        expectedQueueVersion: 4,
        proposalHash:
          'a6da4f7659bca9627f63969bc4d5d413665fda2aaec6c94ae0837ea03e075d98',
        idempotencyKey: 'confirm-overtime-123',
      }),
    ).toEqual({
      ...identity,
      expectedQueueVersion: 4,
      proposalHash:
        'a6da4f7659bca9627f63969bc4d5d413665fda2aaec6c94ae0837ea03e075d98',
      idempotencyKey: 'confirm-overtime-123',
    });
  });

  it('copies automatic and exact placement arrays into wire results', () => {
    const automatic = {
      status: 'placed' as const,
      mode: 'automatic' as const,
      productionRunId: identity.productionRunId,
      productionOrderId: identity.productionOrderId,
      productionBatchId: '44444444-4444-4444-8444-444444444444',
      createdBatch: true,
      affectedBatchIds: Object.freeze(['44444444-4444-4444-8444-444444444444']),
      queueVersion: 5,
      proposalHash:
        'a6da4f7659bca9627f63969bc4d5d413665fda2aaec6c94ae0837ea03e075d98',
      plannedCompletionAt: '2026-08-02T21:00:00.000Z',
      overtimeMinutes: 0,
      replayed: false,
    };
    const exact = {
      status: 'confirmation_required' as const,
      mode: 'manager_exact' as const,
      productionRunId: identity.productionRunId,
      productionOrderId: identity.productionOrderId,
      target: {
        kind: 'existing_batch' as const,
        productionBatchId: '44444444-4444-4444-8444-444444444444',
        sequence: 1,
      },
      affectedBatchIds: Object.freeze(['44444444-4444-4444-8444-444444444444']),
      queueVersion: 4,
      proposalHash:
        'a6da4f7659bca9627f63969bc4d5d413665fda2aaec6c94ae0837ea03e075d98',
      projectedCompletionAt: '2026-08-02T21:15:00.000Z',
      overtimeMinutes: 15,
      replayed: false as const,
    };

    const automaticResult =
      toAutomaticProductionOrderPlacementResult(automatic);
    const exactResult = toExactProductionOrderPlacementResult(exact);

    expect(automaticResult).toEqual(automatic);
    expect(exactResult).toEqual(exact);
    if (automaticResult.status === 'placed')
      expect(automaticResult.affectedBatchIds).not.toBe(
        automatic.affectedBatchIds,
      );
    if (exactResult.status === 'confirmation_required') {
      expect(exactResult.affectedBatchIds).not.toBe(exact.affectedBatchIds);
      expect(exactResult.target).not.toBe(exact.target);
    }
  });

  it('maps the terminal overtime result without admitting confirmation-required', () => {
    const result = {
      status: 'not_placed' as const,
      mode: 'automatic' as const,
      productionRunId: identity.productionRunId,
      productionOrderId: identity.productionOrderId,
      reason: 'proposal_stale' as const,
      message: 'The overtime proposal is stale.',
      queueVersion: 5,
      replayed: false,
    };

    expect(toConfirmProductionOrderOvertimeResult(result)).toEqual(result);
  });
});
