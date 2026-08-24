import { proveOperation } from '@pressly/testkit/operation-proof';
import {
  expectExactIngressInput,
  expectIngressRoundTrip,
} from '../../../testing/contract-proof.ts';
import { purgeExpiredWebhookReceiptsContract } from './contract.ts';
import { purgeExpiredWebhookReceiptsCellDeclaration } from './cell.ts';

proveOperation({
  operationId: 'ingress.purge-expired-webhook-receipts.v1',
  declaration: purgeExpiredWebhookReceiptsCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'owns an empty command and exact purge count',
      proves: ['contract'],
      run: () => {
        expectExactIngressInput(purgeExpiredWebhookReceiptsContract, {});
        expectIngressRoundTrip(purgeExpiredWebhookReceiptsContract.output, {
          purgedCount: 2,
        });
      },
    },
  ],
});
