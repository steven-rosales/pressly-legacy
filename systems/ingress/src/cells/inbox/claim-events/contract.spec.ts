import { proveOperation } from '@pressly/testkit/operation-proof';
import {
  expectExactIngressInput,
  expectIngressRoundTrip,
} from '../../../testing/contract-proof.ts';
import { claimEventsContract } from './contract.ts';
import { claimEventsCellDeclaration } from './cell.ts';

proveOperation({
  operationId: 'ingress.claim-events.v1',
  declaration: claimEventsCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'owns lease commands and the exact claimed payload envelope',
      proves: ['contract'],
      run: () => {
        expectExactIngressInput(claimEventsContract, {
          workerId: 'worker-1',
          leaseMs: 30_000,
          limit: 10,
        });
        const at = new Date('2026-08-22T16:00:00.000Z');
        expectIngressRoundTrip(claimEventsContract.output, [
          {
            eventId: '81000000-0000-4000-8000-000000000001',
            workerId: 'worker-1',
            attempt: 1,
            source: 'cents',
            eventType: 'order_updated',
            subjectType: 'order',
            subjectId: 'order-1',
            sourceLocationId: 'store-1',
            sourceOccurredAt: at,
            receivedAt: at,
            payload: { orderId: 'order-1' },
            payloadHash: 'a'.repeat(64),
            recoveredLease: false,
          },
        ]);
      },
    },
  ],
});
