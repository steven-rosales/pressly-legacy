import { describe, expect, it } from 'vitest';
import type { Result } from '@pressly/cells/result';
import {
  calendarDateAt,
  calendarDayDistance,
  calendarDayRangeAt,
  instantFromUtcIso,
  toUtcIso,
  type CalendarDayRange,
  type TimeError,
} from '../src/index.ts';

const expectOk = <T>(actual: Result<T, TimeError>): T => {
  expect(actual.tag).toBe('ok');
  if (actual.tag === 'err')
    throw new Error(`Expected ok result, received ${actual.error.tag}.`);
  return actual.value;
};

const instant = (value: string) => expectOk(instantFromUtcIso(value));

describe('local calendar time', () => {
  it('keeps the local date on the correct side of a UTC rollover', () => {
    const zone = 'America/New_York';
    const now = instant('2026-07-20T15:09:00.000Z');
    const due = instant('2026-07-20T00:22:33.429Z');

    expect(calendarDateAt(zone, now)).toEqual({
      year: 2026,
      month: 7,
      day: 20,
    });
    expect(calendarDateAt(zone, due)).toEqual({
      year: 2026,
      month: 7,
      day: 19,
    });
    expect(
      calendarDayDistance({
        from: calendarDateAt(zone, now),
        to: calendarDateAt(zone, due),
      }),
    ).toBe(-1);
  });

  it('returns half-open local-day boundaries for ordinary days', () => {
    const range = expectOk(
      calendarDayRangeAt(
        'America/New_York',
        instant('2026-07-20T15:09:00.000Z'),
      ),
    );

    expect(rangeAsIso(range)).toEqual({
      startsAt: '2026-07-20T04:00:00.000Z',
      endsAt: '2026-07-21T04:00:00.000Z',
    });
  });

  it('preserves 23-hour and 25-hour days across DST transitions', () => {
    const spring = expectOk(
      calendarDayRangeAt(
        'America/New_York',
        instant('2026-03-08T16:00:00.000Z'),
      ),
    );
    const fall = expectOk(
      calendarDayRangeAt(
        'America/New_York',
        instant('2026-11-01T17:00:00.000Z'),
      ),
    );

    expect(spring.endsAt - spring.startsAt).toBe(23 * 60 * 60 * 1000);
    expect(fall.endsAt - fall.startsAt).toBe(25 * 60 * 60 * 1000);
  });
});

const rangeAsIso = (range: CalendarDayRange) => ({
  startsAt: toUtcIso(range.startsAt),
  endsAt: toUtcIso(range.endsAt),
});
