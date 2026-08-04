import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it, vi } from 'vitest';
import { makeSequentialJob } from '../../src/runtime/job.ts';

describe('sequential worker job', () => {
  it('runs later independent jobs before propagating the first failure', async () => {
    const failure = new Error('first job failed');
    const later = vi.fn(async () => 2);
    const job = makeSequentialJob([
      { runOnce: async () => Promise.reject(failure) },
      { runOnce: later },
    ]);

    await expect(job.runOnce()).rejects.toBe(failure);
    expect(later).toHaveBeenCalledOnce();
  });

  it('sums successful jobs', async () => {
    const job = makeSequentialJob([
      { runOnce: async () => 2 },
      { runOnce: async () => 3 },
    ]);

    await expect(job.runOnce()).resolves.toBe(5);
  });

  it('preserves every independent failure from the same pass', async () => {
    const first = new Error('first job failed');
    const second = new Error('second job failed');
    const job = makeSequentialJob([
      { runOnce: async () => Promise.reject(first) },
      { runOnce: async () => Promise.reject(second) },
    ]);

    const failure = await job.runOnce().catch((error: unknown) => error);

    expect(isAppError(failure)).toBe(true);
    expect(failure).toMatchObject({
      code: 'worker_peer_jobs_failed',
      details: { failureCount: 2 },
      cause: expect.any(AggregateError),
    });
    expect((failure as Error & { cause: AggregateError }).cause.errors).toEqual(
      [first, second],
    );
  });
});
