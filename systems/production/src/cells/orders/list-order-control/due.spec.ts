import { describe, expect, it } from 'vitest';
import { productionDueBucket, productionDueFilter } from './due.ts';

describe('order control local calendar', () => {
  it('classifies local production dates', () => {
    const now = new Date('2026-07-20T15:09:00.000Z');
    expect(
      productionDueBucket(
        new Date('2026-07-20T00:22:33.429Z'),
        now,
        'America/New_York',
      ),
    ).toBe('overdue');
    expect(
      productionDueBucket(
        new Date('2026-07-20T04:00:00.000Z'),
        now,
        'America/New_York',
      ),
    ).toBe('today');
  });

  it('creates DST-length half-open windows', () => {
    expect(
      productionDueFilter(
        'today',
        new Date('2026-03-08T16:00:00.000Z'),
        'America/New_York',
      ),
    ).toEqual({
      dueAtOrAfter: new Date('2026-03-08T05:00:00.000Z'),
      dueBefore: new Date('2026-03-09T04:00:00.000Z'),
    });
    expect(
      productionDueFilter(
        'today',
        new Date('2026-11-01T17:00:00.000Z'),
        'America/New_York',
      ),
    ).toEqual({
      dueAtOrAfter: new Date('2026-11-01T04:00:00.000Z'),
      dueBefore: new Date('2026-11-02T05:00:00.000Z'),
    });
  });
});
