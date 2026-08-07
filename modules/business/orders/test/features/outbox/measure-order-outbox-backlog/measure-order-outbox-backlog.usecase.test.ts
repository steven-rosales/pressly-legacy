import { describe, expect, it, vi } from 'vitest';
import type { MeasureOrderOutboxBacklogRepository } from '../../../../src/features/outbox/measure-order-outbox-backlog/measure-order-outbox-backlog.port.ts';
import { makeMeasureOrderOutboxBacklog } from '../../../../src/features/outbox/measure-order-outbox-backlog/measure-order-outbox-backlog.usecase.ts';

const now = new Date('2026-08-06T16:00:00.000Z');
const clock = { now: () => now };

describe('measure Order outbox backlog', () => {
  it('derives nonnegative age from the oldest unfinished event', async () => {
    const repo = vi.fn<MeasureOrderOutboxBacklogRepository>(async () => ({
      pendingCount: 3,
      oldestPendingAt: new Date('2026-08-06T15:58:30.000Z'),
    }));
    const measure = makeMeasureOrderOutboxBacklog({ repo, clock });

    await expect(measure()).resolves.toEqual({
      pendingCount: 3,
      oldestPendingAgeSeconds: 90,
    });
    expect(repo).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: 'an empty backlog',
      oldestPendingAt: null,
    },
    {
      name: 'a database timestamp ahead of the sample clock',
      oldestPendingAt: new Date('2026-08-06T16:00:01.000Z'),
    },
  ])('reports zero age for $name', async ({ oldestPendingAt }) => {
    const measure = makeMeasureOrderOutboxBacklog({
      repo: async () => ({ pendingCount: 0, oldestPendingAt }),
      clock,
    });

    await expect(measure()).resolves.toEqual({
      pendingCount: 0,
      oldestPendingAgeSeconds: 0,
    });
  });

  it('maps persistence failures to one stable unavailable error', async () => {
    const measure = makeMeasureOrderOutboxBacklog({
      repo: async () => {
        throw new Error('database unavailable');
      },
      clock,
    });

    await expect(measure()).rejects.toMatchObject({
      code: 'order_outbox_backlog_measurement_failed',
      kind: 'DatabaseError',
      status: 503,
    });
  });
});
