import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, vi } from 'vitest';
import { captureWebhookReceiptCellDeclaration } from './cell.ts';
import { makeExecuteCaptureWebhookReceipt } from './execute.ts';

describe('capture-webhook-receipt execution', () => {
  proveOperation({
    operationId: 'ingress.capture-webhook-receipt.v1',
    declaration: captureWebhookReceiptCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'assigns bounded expiry while treating ciphertext as opaque',
        proves: ['executor-success'],
        run: async () => {
          const now = new Date('2026-08-22T16:00:00.000Z');
          const capture = vi.fn(
            async ({ receiptId }: { receiptId: string }) => ({
              receiptId,
              duplicate: false,
            }),
          );
          const execute = makeExecuteCaptureWebhookReceipt({
            repo: { capture },
            clock: { now: () => now },
            ids: { next: () => '81000000-0000-4000-8000-000000000001' },
            retentionMs: 1_000,
          });
          const receipt = {
            source: 'cents',
            rawBodySha256: 'a'.repeat(64),
            adapterVersion: 'cents-webhook-v1',
            eventType: 'order_updated',
            payloadCiphertext: 'v1.iv.ciphertext.tag',
            normalization: { outcome: 'accepted' as const },
          };

          await expect(execute(receipt)).resolves.toMatchObject({
            kind: 'success',
            value: { duplicate: false },
          });
          expect(capture).toHaveBeenCalledWith({
            receiptId: '81000000-0000-4000-8000-000000000001',
            receipt,
            receivedAt: now,
            expiresAt: new Date('2026-08-22T16:00:01.000Z'),
          });
        },
      },
    ],
  });
});
