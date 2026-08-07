import { describe, expect, it, vi } from 'vitest';
import { makeCaptureWebhookReceipt } from '../../../../src/features/quarantine/capture-webhook-receipt/capture-webhook-receipt.usecase.ts';
import type { CaptureWebhookReceiptRepository } from '../../../../src/features/quarantine/capture-webhook-receipt/capture-webhook-receipt.port.ts';

const now = new Date('2026-07-19T14:00:00.000Z');

const repository = (): CaptureWebhookReceiptRepository =>
  vi.fn(async ({ receiptId }) => ({
    receiptId,
    duplicate: false,
  }));

describe('webhook receipt capture', () => {
  it('assigns a bounded expiry without interpreting encrypted payload data', async () => {
    const repo = repository();
    const capture = makeCaptureWebhookReceipt({
      repo,
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
    expect(repo).toHaveBeenCalledWith(
      expect.objectContaining({
        receivedAt: now,
        expiresAt: new Date('2026-08-18T14:00:00.000Z'),
      }),
    );
  });

  it('normalizes persistence failures to the capture error', async () => {
    const capture = makeCaptureWebhookReceipt({
      repo: vi.fn(async () => {
        throw new Error('database unavailable');
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
