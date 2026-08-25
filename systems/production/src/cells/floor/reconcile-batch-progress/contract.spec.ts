import { proveOperation } from '@pressly/testkit/operation-proof';
import { reconcileBatchProgressCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { reconcileBatchProgressContract } from './contract.ts';

describe('reconcile batch progress contract', () => {
  proveOperation({
    operationId: 'production.reconcile-batch-progress.v1',
    declaration: reconcileBatchProgressCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips the exact four-stage command and null optionals',
        proves: ['contract'],
        run: () => {
          const command = {
            locationId: 'location-1',
            productionRunId: '10000000-0000-4000-8000-000000000001',
            productionBatchId: '10000000-0000-4000-8000-000000000002',
            expectedQueueVersion: 1,
            expectedBatchVersion: 1,
            expectedStageVersions: [11, 12, 13, 14].map((suffix) => ({
              stageRunId: `10000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`,
              version: 1,
            })),
            target: 'sorting_started' as const,
            reason: 'updates_missed' as const,
            note: null,
            machineIds: [],
            confirmation: null,
            idempotencyKey: 'reconcile-1',
            actorId: 'actor-1',
          };
          expect(
            reconcileBatchProgressContract.input.decode(
              reconcileBatchProgressContract.input.encode(command),
            ),
          ).toEqual({ kind: 'valid', value: command });
        },
      },
    ],
  });

  it('rejects duplicate stage versions and machine-target mismatch', () => {
    const stage = '10000000-0000-4000-8000-000000000011';
    expect(
      reconcileBatchProgressContract.input.decode({
        params: {
          locationId: 'location-1',
          productionRunId: '10000000-0000-4000-8000-000000000001',
          productionBatchId: '10000000-0000-4000-8000-000000000002',
        },
        body: {
          expectedQueueVersion: 1,
          expectedBatchVersion: 1,
          expectedStageVersions: Array.from({ length: 4 }, () => ({
            stageRunId: stage,
            version: 1,
          })),
          target: 'washing_started',
          reason: 'updates_missed',
          machineIds: [],
          idempotencyKey: 'reconcile-1',
        },
        actorId: 'actor-1',
      }),
    ).toMatchObject({ kind: 'invalid' });
  });
});
