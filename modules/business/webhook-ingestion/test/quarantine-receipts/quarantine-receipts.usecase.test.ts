import { describe, expect, it, vi } from 'vitest';
import type { QuarantineWebhookReceiptsRepository } from '../../src/quarantine-receipts/quarantine-receipts.port.ts';
import {
  makeCaptureWebhookReceipt,
  makeLinkWebhookReceipt,
  makePurgeExpiredWebhookReceipts,
} from '../../src/quarantine-receipts/quarantine-receipts.usecase.ts';

const now = new Date('2026-07-19T14:00:00.000Z');

const repo = (
  overrides: Partial<QuarantineWebhookReceiptsRepository> = {},
): QuarantineWebhookReceiptsRepository => ({
  capture: vi.fn(async ({ receiptId }) => ({
    receiptId,
    duplicate: false,
  })),
  link: vi.fn(async () => 'linked' as const),
  purgeExpired: vi.fn(async () => 0),
  ...overrides,
});

describe('webhook receipt quarantine', () => {
  it('assigns a bounded expiry without interpreting encrypted payload data', async () => {
    const repository = repo();
    const capture = makeCaptureWebhookReceipt({
      repo: repository,
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
    expect(repository.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        receivedAt: now,
        expiresAt: new Date('2026-08-18T14:00:00.000Z'),
      }),
    );
  });

  it('returns stable errors for capture and link persistence failures', async () => {
    const capture = makeCaptureWebhookReceipt({
      repo: repo({
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
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'webhook_quarantine_capture_failed', status: 503 },
    });

    const link = makeLinkWebhookReceipt({
      repo: repo({ link: vi.fn(async () => 'conflict' as const) }),
      clock: { now: () => now },
    });
    await expect(
      link({
        receiptId: '00000000-0000-4000-8000-000000000001',
        eventId: '00000000-0000-4000-8000-000000000002',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'webhook_quarantine_link_conflict', status: 503 },
    });
  });

  it('purges only through the current retention boundary', async () => {
    const repository = repo({ purgeExpired: vi.fn(async () => 3) });
    const purge = makePurgeExpiredWebhookReceipts({
      repo: repository,
      clock: { now: () => now },
    });

    await expect(purge()).resolves.toEqual({
      tag: 'ok',
      value: { purgedCount: 3 },
    });
    expect(repository.purgeExpired).toHaveBeenCalledWith(now);
  });
});
