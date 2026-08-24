import { describe, expect, it } from 'vitest';
import { freezeBatchMembershipCellDeclaration } from './cell.ts';

describe('freeze batch membership cell', () => {
  it('is an independently named queue command', () => {
    expect(freezeBatchMembershipCellDeclaration).toMatchObject({
      id: 'production.freeze-batch-membership.v1',
      authorization: { capability: 'production:queue', timing: 'after-input' },
      consistency: { transaction: 'required', concurrency: 'optimistic' },
      idempotency: { required: true },
    });
    expect(freezeBatchMembershipCellDeclaration.surfaces[0]).toMatchObject({
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/freeze',
    });
  });
});
