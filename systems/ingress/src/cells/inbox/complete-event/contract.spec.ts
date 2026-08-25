import { proveOperation } from '@pressly/testkit/operation-proof';
import {
  expectExactIngressInput,
  expectIngressRoundTrip,
} from '../../../testing/contract-proof.ts';
import { completeEventContract } from './contract.ts';
import { completeEventCellDeclaration } from './cell.ts';

proveOperation({
  operationId: 'ingress.complete-event.v1',
  declaration: completeEventCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'owns the fenced claim and completion outcome',
      proves: ['contract'],
      run: () => {
        expectExactIngressInput(completeEventContract, {
          eventId: '81000000-0000-4000-8000-000000000001',
          workerId: 'worker-1',
          attempt: 1,
        });
        expectIngressRoundTrip(completeEventContract.output, 'applied');
        expectIngressRoundTrip(completeEventContract.output, 'lease_lost');
      },
    },
  ],
});
