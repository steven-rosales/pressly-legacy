import { proveOperation } from '@pressly/testkit/operation-proof';
import {
  expectExactIngressInput,
  expectIngressRoundTrip,
} from '../../../testing/contract-proof.ts';
import { ingestEventContract } from './contract.ts';
import { ingestEventCellDeclaration } from './cell.ts';

proveOperation({
  operationId: 'ingress.ingest-event.v1',
  declaration: ingestEventCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'owns the normalized inbox command and durable receipt result',
      proves: ['contract'],
      run: () => {
        expectExactIngressInput(ingestEventContract, {
          source: 'cents',
          eventType: 'order_updated',
          deduplicationKey: 'a'.repeat(64),
          subjectType: 'order',
          subjectId: 'order-1',
          sourceLocationId: 'store-1',
          sourceOccurredAt: '2026-08-22T16:00:00.000Z',
          payload: { orderId: 'order-1' },
          rawBodySha256: 'b'.repeat(64),
          disposition: 'process',
        });
        expectIngressRoundTrip(ingestEventContract.output, {
          eventId: '81000000-0000-4000-8000-000000000001',
          duplicate: false,
          status: 'pending',
        });
      },
    },
  ],
});
