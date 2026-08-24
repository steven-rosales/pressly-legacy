import { proveOperation } from '@pressly/testkit/operation-proof';
import {
  expectExactIngressInput,
  expectIngressRoundTrip,
} from '../../../testing/contract-proof.ts';
import { deadLetterEventContract } from './contract.ts';
import { deadLetterEventCellDeclaration } from './cell.ts';

proveOperation({
  operationId: 'ingress.dead-letter-event.v1',
  declaration: deadLetterEventCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'owns the fenced terminal diagnostic boundary',
      proves: ['contract'],
      run: () => {
        expectExactIngressInput(deadLetterEventContract, {
          eventId: '81000000-0000-4000-8000-000000000001',
          workerId: 'worker-1',
          attempt: 1,
          code: 'projection_failed',
          message: 'terminal failure',
        });
        expectIngressRoundTrip(deadLetterEventContract.output, 'applied');
        expectIngressRoundTrip(deadLetterEventContract.output, 'lease_lost');
      },
    },
  ],
});
