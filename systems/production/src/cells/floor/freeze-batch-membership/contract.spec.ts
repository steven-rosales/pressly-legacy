import { proveOperation } from '@pressly/testkit/operation-proof';
import { freezeBatchMembershipCellDeclaration } from './cell.ts';
import { describe, expect } from 'vitest';
import { freezeBatchMembershipContract } from './contract.ts';

describe('freeze batch membership contract', () => {
  proveOperation({
    operationId: 'production.freeze-batch-membership.v1',
    declaration: freezeBatchMembershipCellDeclaration,
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
            idempotencyKey: 'freeze-1',
            actorId: 'actor-1',
          };
          expect(
            freezeBatchMembershipContract.input.decode(
              freezeBatchMembershipContract.input.encode(command),
            ),
          ).toEqual({ kind: 'valid', value: command });
        },
      },
    ],
  });
});
