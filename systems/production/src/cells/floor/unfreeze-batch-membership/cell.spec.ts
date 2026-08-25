import { describe, expect, it } from 'vitest';
import { unfreezeBatchMembershipCellDeclaration } from './cell.ts';

describe('unfreeze batch membership cell', () => {
  it('is an independently named override command', () => {
    expect(unfreezeBatchMembershipCellDeclaration).toMatchObject({
      id: 'production.unfreeze-batch-membership.v1',
      authorization: {
        capability: 'production:override',
        timing: 'after-input',
      },
      consistency: { transaction: 'required', concurrency: 'optimistic' },
      idempotency: { required: true },
    });
    expect(unfreezeBatchMembershipCellDeclaration.surfaces[0]).toMatchObject({
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/unfreeze',
    });
  });
});
