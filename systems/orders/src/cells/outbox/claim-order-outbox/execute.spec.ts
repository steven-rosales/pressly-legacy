import { configError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteClaimOrderOutbox } from './execute.ts';

const now = new Date('2026-08-22T16:00:00.000Z');
const command = { workerId: 'worker-1', limit: 10, leaseMs: 30_000 };

describe('execute claim Order outbox', () => {
  it('reads the clock after validation and returns the claimed batch', async () => {
    const claim = vi.fn(async () => []);
    const clock = { now: vi.fn(() => now) };
    const execute = makeExecuteClaimOrderOutbox({ repo: { claim }, clock });

    await expect(execute(command)).resolves.toEqual({
      kind: 'success',
      value: [],
    });
    expect(clock.now).toHaveBeenCalledOnce();
    expect(claim).toHaveBeenCalledWith({ command, now });
  });

  it('returns validation as typed data without touching effects', async () => {
    const claim = vi.fn(async () => []);
    const clock = { now: vi.fn(() => now) };
    const execute = makeExecuteClaimOrderOutbox({ repo: { claim }, clock });

    await expect(execute({ ...command, limit: 0 })).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'validation',
        code: 'order_outbox_claim_invalid',
        message: 'The outbox claim request is invalid.',
      },
    });
    expect(clock.now).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it('maps unknown persistence errors and preserves explicit AppErrors', async () => {
    const unknown = makeExecuteClaimOrderOutbox({
      repo: {
        claim: async () => {
          throw { fault: 'database unavailable' };
        },
      },
      clock: { now: () => now },
    });
    await expect(unknown(command)).rejects.toMatchObject({
      kind: 'DatabaseError',
      code: 'order_outbox_claim_failed',
      status: 503,
    });

    const expected = configError({
      code: 'explicit_claim_fault',
      message: 'Explicit claim fault.',
    });
    const passThrough = makeExecuteClaimOrderOutbox({
      repo: {
        claim: async () => {
          throw expected;
        },
      },
      clock: { now: () => now },
    });
    await expect(passThrough(command)).rejects.toBe(expected);
  });
});
