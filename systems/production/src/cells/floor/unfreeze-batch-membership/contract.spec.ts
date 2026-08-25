import { proveOperation } from '@pressly/testkit/operation-proof';
import { unfreezeBatchMembershipCellDeclaration } from './cell.ts';
import { describe, expect } from 'vitest';
import { unfreezeBatchMembershipContract } from './contract.ts';

describe('unfreeze batch membership contract', () => {
  proveOperation({
    operationId: 'production.unfreeze-batch-membership.v1',
    declaration: unfreezeBatchMembershipCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips the exact command',
        proves: ['contract'],
        run: () => {
          const command = {
            locationId: 'location-1',
            productionRunId: '10000000-0000-4000-8000-000000000001',
            productionBatchId: '10000000-0000-4000-8000-000000000002',
            expectedQueueVersion: 4,
            expectedBatchVersion: 7,
            idempotencyKey: 'unfreeze-1',
            actorId: 'actor-1',
          };
          expect(
            unfreezeBatchMembershipContract.input.decode(
              unfreezeBatchMembershipContract.input.encode(command),
            ),
          ).toEqual({ kind: 'valid', value: command });
        },
      },
    ],
  });
});
