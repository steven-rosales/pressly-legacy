import { proveOperation } from '@pressly/testkit/operation-proof';
import {
  expectExactIngressInput,
  expectIngressRoundTrip,
} from '../../../testing/contract-proof.ts';
import { retryEventContract } from './contract.ts';
import { retryEventCellDeclaration } from './cell.ts';

proveOperation({
  operationId: 'ingress.retry-event.v1',
  declaration: retryEventCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'owns the fenced retry schedule and completion result',
      proves: ['contract'],
      run: () => {
        expectExactIngressInput(retryEventContract, {
          eventId: '81000000-0000-4000-8000-000000000001',
          workerId: 'worker-1',
          attempt: 1,
          availableAt: '2026-08-22T16:05:00.000Z',
          code: 'projection_pending',
          message: 'retry later',
        });
        expectIngressRoundTrip(retryEventContract.output, 'applied');
        expectIngressRoundTrip(retryEventContract.output, 'lease_lost');
      },
    },
  ],
});
