import { describe, expect, it, vi } from 'vitest';
import {
  checkWorkerHeartbeat,
  isHeartbeatFresh,
} from '../../src/healthcheck.ts';
import { makeFileHeartbeat } from '../../src/common/heartbeat.ts';

describe('worker heartbeat', () => {
  const now = new Date('2026-07-12T16:00:00.000Z');

  it('rejects missing, stale, and implausibly future heartbeats', async () => {
    expect(
      isHeartbeatFresh({
        modifiedAt: new Date(now.getTime() - 89_999),
        now,
        maxAgeMs: 90_000,
      }),
    ).toBe(true);
    expect(
      isHeartbeatFresh({
        modifiedAt: new Date(now.getTime() - 90_001),
        now,
        maxAgeMs: 90_000,
      }),
    ).toBe(false);
    expect(
      isHeartbeatFresh({
        modifiedAt: new Date(now.getTime() + 1_001),
        now,
        maxAgeMs: 90_000,
      }),
    ).toBe(false);
    await expect(
      checkWorkerHeartbeat({
        path: '/missing',
        maxAgeMs: 90_000,
        getModifiedAt: async () => {
          throw new Error('missing');
        },
      }),
    ).resolves.toBe(false);
  });

  it('writes a timestamp used by the private healthcheck', async () => {
    const write = vi.fn(async () => undefined);
    const heartbeat = makeFileHeartbeat({
      path: '/tmp/worker-heartbeat',
      clock: { now: () => now },
      write,
    });

    await heartbeat.beat();

    expect(write).toHaveBeenCalledWith(
      '/tmp/worker-heartbeat',
      '2026-07-12T16:00:00.000Z\n',
    );
  });
});
