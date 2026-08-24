import { proveOperation } from '@pressly/testkit/operation-proof';
import {
  expectExactIngressInput,
  expectIngressRoundTrip,
} from '../../../testing/contract-proof.ts';
import { captureWebhookReceiptContract } from './contract.ts';
import { captureWebhookReceiptCellDeclaration } from './cell.ts';

proveOperation({
  operationId: 'ingress.capture-webhook-receipt.v1',
  declaration: captureWebhookReceiptCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'owns the exact receipt boundary and durable acknowledgement',
      proves: ['contract'],
      run: () => {
        expectExactIngressInput(captureWebhookReceiptContract, {
          source: 'cents',
          rawBodySha256: 'a'.repeat(64),
          adapterVersion: 'cents-webhook-v1',
          eventType: 'order_updated',
          payloadCiphertext: 'v1.iv.ciphertext.tag',
          normalization: { outcome: 'accepted' },
        });
        expectIngressRoundTrip(captureWebhookReceiptContract.output, {
          receiptId: '81000000-0000-4000-8000-000000000001',
          duplicate: false,
        });
      },
    },
  ],
});
