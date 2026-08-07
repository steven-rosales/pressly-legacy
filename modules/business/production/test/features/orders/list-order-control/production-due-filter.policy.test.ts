import { describe, expect, it } from 'vitest';
import {
  productionDueBucket,
  productionDueFilter,
} from '../../../../src/foundations/language/due-dates/production-due-bucket.policy.ts';

const now = new Date('2026-07-20T15:09:00.000Z');
const timezone = 'America/New_York';

describe('production due-date policy', () => {
  it('classifies the due instant by the production location calendar', () => {
    expect(
      productionDueBucket(new Date('2026-07-20T00:22:33.429Z'), now, timezone),
    ).toBe('overdue');
    expect(
      productionDueBucket(new Date('2026-07-20T04:00:00.000Z'), now, timezone),
    ).toBe('today');
  });

  it('creates matching half-open database windows from the same calendar', () => {
    expect(productionDueFilter('overdue', now, timezone)).toEqual({
      dueAtOrAfter: null,
      dueBefore: new Date('2026-07-20T04:00:00.000Z'),
    });
    expect(productionDueFilter('today', now, timezone)).toEqual({
      dueAtOrAfter: new Date('2026-07-20T04:00:00.000Z'),
      dueBefore: new Date('2026-07-21T04:00:00.000Z'),
    });
    expect(productionDueFilter('tomorrow', now, timezone)).toEqual({
      dueAtOrAfter: new Date('2026-07-21T04:00:00.000Z'),
      dueBefore: new Date('2026-07-22T04:00:00.000Z'),
    });
    expect(productionDueFilter('later', now, timezone)).toEqual({
      dueAtOrAfter: new Date('2026-07-22T04:00:00.000Z'),
      dueBefore: null,
    });
  });
});
