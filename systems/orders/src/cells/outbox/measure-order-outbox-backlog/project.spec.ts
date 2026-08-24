import { describe, expect, it } from 'vitest';
import { projectOrderOutboxBacklog } from './project.ts';

const now = new Date('2026-08-22T16:00:00.000Z');

describe('project Order outbox backlog', () => {
  it('uses creation age for the oldest unfinished event', () => {
    expect(
      projectOrderOutboxBacklog({
        stored: {
          pendingCount: 3,
          oldestPendingAt: new Date('2026-08-22T15:58:30.000Z'),
        },
        now,
      }),
    ).toEqual({ pendingCount: 3, oldestPendingAgeSeconds: 90 });
  });

  it.each([
    ['an empty backlog', null],
    ['a future database timestamp', new Date('2026-08-22T16:00:01.000Z')],
  ])('clamps %s to zero age', (_, oldestPendingAt) => {
    expect(
      projectOrderOutboxBacklog({
        stored: { pendingCount: 0, oldestPendingAt },
        now,
      }).oldestPendingAgeSeconds,
    ).toBe(0);
  });
});
