import { configError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteMeasureOrderOutboxBacklog } from './execute.ts';

const now = new Date('2026-08-22T16:00:00.000Z');

describe('execute measure Order outbox backlog', () => {
  it('samples time before reading the unfinished aggregate', async () => {
    const order: string[] = [];
    const execute = makeExecuteMeasureOrderOutboxBacklog({
      clock: {
        now: () => {
          order.push('clock');
          return now;
        },
      },
      repo: {
        measure: async () => {
          order.push('repo');
          return {
            pendingCount: 2,
            oldestPendingAt: new Date('2026-08-22T15:55:00.000Z'),
          };
        },
      },
    });

    await expect(execute({})).resolves.toEqual({
      kind: 'success',
      value: { pendingCount: 2, oldestPendingAgeSeconds: 300 },
    });
    expect(order).toEqual(['clock', 'repo']);
  });

  it('maps unknown failures and preserves explicit AppErrors', async () => {
    const clock = { now: vi.fn(() => now) };
    const unknown = makeExecuteMeasureOrderOutboxBacklog({
      clock,
      repo: {
        measure: async () => {
          throw { fault: 'database unavailable' };
        },
      },
    });
    await expect(unknown({})).rejects.toMatchObject({
      kind: 'DatabaseError',
      code: 'order_outbox_backlog_measurement_failed',
      status: 503,
    });

    const expected = configError({
      code: 'explicit_backlog_fault',
      message: 'Explicit backlog fault.',
    });
    const passThrough = makeExecuteMeasureOrderOutboxBacklog({
      clock,
      repo: {
        measure: async () => {
          throw expected;
        },
      },
    });
    await expect(passThrough({})).rejects.toBe(expected);
  });
});
