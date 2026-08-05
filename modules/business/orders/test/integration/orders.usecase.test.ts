import { describe, expect, it, vi } from 'vitest';
import type { ClaimOrderOutboxRepository } from '../../src/features/outbox/claim-order-outbox/claim-order-outbox.port.ts';
import { makeClaimOrderOutbox } from '../../src/features/outbox/claim-order-outbox/claim-order-outbox.usecase.ts';

const clock = { now: () => new Date('2026-07-21T12:00:00.000Z') };

describe('Orders use cases', () => {
  it('bounds outbox claims before persistence', async () => {
    const repo: ClaimOrderOutboxRepository = {
      claim: vi.fn(),
    };
    const claim = makeClaimOrderOutbox({ repo, clock });
    const outcome = await claim({
      workerId: 'worker-1',
      limit: 101,
      leaseMs: 30_000,
    });

    expect(outcome.tag).toBe('err');
    expect(repo.claim).not.toHaveBeenCalled();
  });
});
