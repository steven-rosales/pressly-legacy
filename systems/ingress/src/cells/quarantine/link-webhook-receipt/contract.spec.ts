import { proveOperation } from '@pressly/testkit/operation-proof';
import {
  expectExactIngressInput,
  expectIngressRoundTrip,
} from '../../../testing/contract-proof.ts';
import { linkWebhookReceiptContract } from './contract.ts';
import { linkWebhookReceiptCellDeclaration } from './cell.ts';

proveOperation({
  operationId: 'ingress.link-webhook-receipt.v1',
  declaration: linkWebhookReceiptCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'owns exact receipt-event linking and expected conflict data',
      proves: ['contract'],
      run: () => {
        expectExactIngressInput(linkWebhookReceiptContract, {
          receiptId: '81000000-0000-4000-8000-000000000001',
          eventId: '81000000-0000-4000-8000-000000000002',
        });
        expectIngressRoundTrip(linkWebhookReceiptContract.output, {
          linked: true,
        });
        expectIngressRoundTrip(linkWebhookReceiptContract.failure, {
          kind: 'conflict',
          code: 'webhook_quarantine_link_conflict',
          message: 'The webhook diagnostic receipt is linked to another event.',
          safeMessage:
            'The webhook diagnostic receipt is linked to another event.',
        });
      },
    },
  ],
});
