import { describe, expect, it } from 'vitest';
import { toProductionBatchMembershipMutationResult } from '../../../../src/features/floor/manage-batch-membership/manage-batch-membership.contract.mapper.ts';

describe('manage Production batch membership mapper', () => {
  it.each([
    { state: 'mutable' as const },
    {
      state: 'frozen' as const,
      frozenAt: '2026-08-02T15:00:00.000Z',
      frozenBy: '11111111-1111-4111-8111-111111111111',
    },
  ])('maps $state membership to the serialized response', (membership) => {
    const result = {
      productionRunId: '22222222-2222-4222-8222-222222222222',
      productionBatchId: '33333333-3333-4333-8333-333333333333',
      queueVersion: 2,
      batchVersion: 3,
      membership,
      replayed: false,
    };

    expect(toProductionBatchMembershipMutationResult(result)).toEqual(result);
  });
});
