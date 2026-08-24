import { proveOperation } from '@pressly/testkit/operation-proof';
import {
  expectExactIngressInput,
  expectIngressRoundTrip,
} from '../../../testing/contract-proof.ts';
import { measureWebhookBacklogContract } from './contract.ts';
import { measureWebhookBacklogCellDeclaration } from './cell.ts';

proveOperation({
  operationId: 'ingress.measure-webhook-backlog.v1',
  declaration: measureWebhookBacklogCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'owns an empty query and bounded backlog measurement',
      proves: ['contract'],
      run: () => {
        expectExactIngressInput(measureWebhookBacklogContract, {});
        expectIngressRoundTrip(measureWebhookBacklogContract.output, {
          pendingCount: 2,
          oldestPendingAgeSeconds: 120,
        });
      },
    },
  ],
});
