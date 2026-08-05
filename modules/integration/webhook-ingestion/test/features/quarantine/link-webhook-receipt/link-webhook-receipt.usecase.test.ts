import { describe, expect, it, vi } from 'vitest';
import { makeLinkWebhookReceipt } from '../../../../src/features/quarantine/link-webhook-receipt/link-webhook-receipt.usecase.ts';

const now = new Date('2026-07-19T14:00:00.000Z');

describe('webhook receipt linking', () => {
  it('returns a typed conflict when the receipt belongs to another event', async () => {
    const link = makeLinkWebhookReceipt({
      repo: vi.fn(async () => 'conflict' as const),
      clock: { now: () => now },
    });

    await expect(
      link({
        receiptId: '00000000-0000-4000-8000-000000000001',
        eventId: '00000000-0000-4000-8000-000000000002',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'webhook_quarantine_link_conflict' },
    });
  });
});
