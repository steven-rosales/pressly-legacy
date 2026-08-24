import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect } from 'vitest';
import { linkWebhookReceiptCellDeclaration } from './cell.ts';
import { linkWebhookReceiptFailure } from './decide.ts';

describe('link-webhook-receipt decisions', () => {
  proveOperation({
    operationId: 'ingress.link-webhook-receipt.v1',
    declaration: linkWebhookReceiptCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'distinguishes missing receipt identity from divergent linking',
        proves: ['decision'],
        run: () => {
          expect(linkWebhookReceiptFailure.notFound()).toMatchObject({
            kind: 'not_found',
            code: 'webhook_quarantine_receipt_not_found',
          });
          expect(linkWebhookReceiptFailure.conflict()).toMatchObject({
            kind: 'conflict',
            code: 'webhook_quarantine_link_conflict',
          });
        },
      },
    ],
  });
});
