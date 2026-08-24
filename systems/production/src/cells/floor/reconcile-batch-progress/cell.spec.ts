import { describe, expect, it } from 'vitest';
import { reconcileBatchProgressCellDeclaration } from './cell.ts';

describe('reconcile batch progress cell', () => {
  it('declares the exact independently observable command', () => {
    expect(reconcileBatchProgressCellDeclaration).toMatchObject({
      id: 'production.reconcile-batch-progress.v1',
      authorization: { capability: 'production:stage', timing: 'after-input' },
      consistency: { transaction: 'required', concurrency: 'optimistic' },
      idempotency: { required: true },
      observability: { operation: 'production.reconcile_batch_progress' },
    });
    expect(reconcileBatchProgressCellDeclaration.surfaces[0]).toMatchObject({
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/progress-reconciliation',
    });
  });
});
