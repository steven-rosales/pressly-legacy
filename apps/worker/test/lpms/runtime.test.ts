import { describe, expect, it, vi } from 'vitest';
import { loopRetryDelayMs, runInboxLoop } from '../../src/lpms/runtime.ts';

describe('LPMS worker loop', () => {
  it('uses bounded backoff and becomes healthy only after a successful pass', async () => {
    const controller = new AbortController();
    const failure = new Error('database unavailable');
    const runOnce = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce(async () => {
        controller.abort();
        return 0;
      });
    const beat = vi.fn(async () => undefined);
    const onError = vi.fn();
    const sleep = vi.fn(
      async (_milliseconds: number, _signal: AbortSignal) => undefined,
    );

    await runInboxLoop({
      processor: { runOnce },
      pollIntervalMs: 1_000,
      retryBaseMs: 500,
      retryMaxMs: 800,
      signal: controller.signal,
      heartbeat: { beat },
      onError,
      sleep,
    });

    expect(onError.mock.calls).toEqual([
      [{ error: failure, consecutiveFailures: 1, retryDelayMs: 500 }],
      [{ error: failure, consecutiveFailures: 2, retryDelayMs: 800 }],
    ]);
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([500, 800]);
    expect(beat).toHaveBeenCalledOnce();
  });

  it('bounds exponential retry delay', () => {
    expect(
      loopRetryDelayMs({ consecutiveFailures: 1, baseMs: 500, maxMs: 2_000 }),
    ).toBe(500);
    expect(
      loopRetryDelayMs({ consecutiveFailures: 12, baseMs: 500, maxMs: 2_000 }),
    ).toBe(2_000);
  });

  it('honors shutdown while the idle poll is waiting', async () => {
    const controller = new AbortController();
    const runOnce = vi.fn(async () => 0);
    const sleep = vi.fn(async (_milliseconds: number) => {
      controller.abort();
    });

    await runInboxLoop({
      processor: { runOnce },
      pollIntervalMs: 1_000,
      retryBaseMs: 500,
      retryMaxMs: 2_000,
      signal: controller.signal,
      heartbeat: { beat: async () => undefined },
      onError: vi.fn(),
      sleep,
    });

    expect(runOnce).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(1_000, controller.signal);
  });
});
