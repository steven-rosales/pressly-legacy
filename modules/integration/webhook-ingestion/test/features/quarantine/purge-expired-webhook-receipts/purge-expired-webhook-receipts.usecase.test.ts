import { describe, expect, it, vi } from 'vitest';
import { makePurgeExpiredWebhookReceipts } from '../../../../src/features/quarantine/purge-expired-webhook-receipts/purge-expired-webhook-receipts.usecase.ts';

const now = new Date('2026-07-19T14:00:00.000Z');

describe('expired webhook receipt purge', () => {
  it('purges only through the current retention boundary', async () => {
    const purgeExpired = vi.fn(async () => 3);
    const purge = makePurgeExpiredWebhookReceipts({
      repo: purgeExpired,
      clock: { now: () => now },
    });

    await expect(purge()).resolves.toEqual({
      tag: 'ok',
      value: { purgedCount: 3 },
    });
    expect(purgeExpired).toHaveBeenCalledWith(now);
  });
});
