import { describe, expect, it, vi } from 'vitest';
import { makeCaptureWebhookReceipt } from '../../../../src/features/quarantine/capture-webhook-receipt/capture-webhook-receipt.usecase.ts';
import type { WebhookReceiptQuarantineStore } from '../../../../src/foundations/ports/webhook-receipt-quarantine-store/webhook-receipt-quarantine-store.port.ts';

const now = new Date('2026-07-19T14:00:00.000Z');

const store = (
  overrides: Partial<WebhookReceiptQuarantineStore> = {},
): WebhookReceiptQuarantineStore => ({
  capture: vi.fn(async ({ receiptId }) => ({
    receiptId,
    duplicate: false,
  })),
  link: vi.fn(async () => 'linked' as const),
  purgeExpired: vi.fn(async () => 0),
  ...overrides,
});

describe('webhook receipt capture', () => {
  it('assigns a bounded expiry without interpreting encrypted payload data', async () => {
    const receiptStore = store();
    const capture = makeCaptureWebhookReceipt({
      store: receiptStore,
      clock: { now: () => now },
      ids: { next: () => '00000000-0000-4000-8000-000000000001' },
      retentionMs: 30 * 24 * 60 * 60 * 1_000,
    });

    await expect(
      capture({
        source: 'cents',
        rawBodySha256: 'a'.repeat(64),
        adapterVersion: 'cents-webhook-v1',
        eventType: 'order_updated',
        payloadCiphertext: 'v1.iv.ciphertext.tag',
        normalization: { outcome: 'accepted' },
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { duplicate: false },
    });
    expect(receiptStore.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        receivedAt: now,
        expiresAt: new Date('2026-08-18T14:00:00.000Z'),
      }),
    );
  });

  it('normalizes persistence failures to the capture error', async () => {
    const capture = makeCaptureWebhookReceipt({
      store: store({
        capture: vi.fn(async () => {
          throw new Error('database unavailable');
        }),
      }),
      clock: { now: () => now },
      ids: { next: () => '00000000-0000-4000-8000-000000000001' },
      retentionMs: 1_000,
    });

    await expect(
      capture({
        source: 'cents',
        rawBodySha256: 'a'.repeat(64),
        adapterVersion: 'cents-webhook-v1',
        eventType: null,
        payloadCiphertext: 'encrypted',
        normalization: {
          outcome: 'rejected',
          errorCode: 'invalid_cents_order_payload',
        },
      }),
    ).rejects.toMatchObject({
      code: 'webhook_quarantine_capture_failed',
      status: 503,
    });
  });
});
