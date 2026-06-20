import { describe, expect, it } from 'vitest';
import type { Result } from '@pressly/kernel';
import {
  isUtcIso,
  utcIsoFromDate,
  instantFromUtcIso,
  instantFromWall,
  possibleInstantsFromWall,
  toUtcIso,
} from '../src/convert.ts';
import type { InstantMs, TimeError } from '../src/types.ts';

const expectOk = <T>(actual: Result<T, TimeError>): T => {
  expect(actual.tag).toBe('ok');

  if (actual.tag === 'err')
    throw new Error(`Expected ok result, received ${actual.error.tag}.`);

  return actual.value;
};

const expectErr = <T>(actual: Result<T, TimeError>): TimeError => {
  expect(actual.tag).toBe('err');

  if (actual.tag === 'ok') throw new Error('Expected err result, received ok.');

  return actual.error;
};

describe('time conversion', () => {
  it('parses UTC ISO instants', () => {
    const instant = expectOk(instantFromUtcIso('2026-06-19T12:30:45.123Z'));

    expect(toUtcIso(instant)).toBe('2026-06-19T12:30:45.123Z');
  });

  it('formats trusted Date objects as branded UTC ISO values', () => {
    expect(
      utcIsoFromDate(new Date(Date.UTC(2026, 5, 19, 12, 30, 45, 123))),
    ).toBe('2026-06-19T12:30:45.123Z');
  });

  it('checks strict UTC ISO strings', () => {
    expect(isUtcIso('2026-06-19T12:30:45.123Z')).toBe(true);
    expect(isUtcIso('2026-06-19T12:30:45.123-04:00')).toBe(false);
  });

  it('parses UTC ISO instants without fractional milliseconds', () => {
    const instant = expectOk(instantFromUtcIso('2026-06-19T12:30:45Z'));

    expect(toUtcIso(instant)).toBe('2026-06-19T12:30:45.000Z');
  });

  it('pads partial UTC ISO milliseconds', () => {
    const instant = expectOk(instantFromUtcIso('2026-06-19T12:30:45.7Z'));

    expect(toUtcIso(instant)).toBe('2026-06-19T12:30:45.700Z');
  });

  it('rejects invalid UTC ISO values', () => {
    expect(expectErr(instantFromUtcIso('2026-02-31T12:30:45Z'))).toEqual({
      tag: 'InvalidUtcIso',
      value: '2026-02-31T12:30:45Z',
    });
  });

  it('finds the single UTC instant for an ordinary wall time', () => {
    const candidates = expectOk(
      possibleInstantsFromWall('UTC', {
        year: 2026,
        month: 6,
        day: 19,
        hour: 12,
        minute: 30,
      }),
    );

    expect(candidates.map(toUtcIso)).toEqual(['2026-06-19T12:30:00.000Z']);
  });

  it('rejects invalid wall dates', () => {
    expect(
      expectErr(
        instantFromWall('UTC', {
          year: 2026,
          month: 2,
          day: 31,
          hour: 12,
          minute: 30,
        }),
      ),
    ).toEqual({
      tag: 'InvalidWallDateTime',
      value: {
        year: 2026,
        month: 2,
        day: 31,
        hour: 12,
        minute: 30,
      },
    });
  });

  it('reports nonexistent New York spring-forward wall times', () => {
    expect(
      expectErr(
        instantFromWall('America/New_York', {
          year: 2024,
          month: 3,
          day: 10,
          hour: 2,
          minute: 30,
        }),
      ),
    ).toEqual({
      tag: 'NonexistentWallDateTime',
      zone: 'America/New_York',
      value: {
        year: 2024,
        month: 3,
        day: 10,
        hour: 2,
        minute: 30,
        second: 0,
        millisecond: 0,
      },
    });
  });

  it('reports ambiguous New York fall-back wall times', () => {
    expect(
      expectErr(
        instantFromWall('America/New_York', {
          year: 2024,
          month: 11,
          day: 3,
          hour: 1,
          minute: 30,
        }),
      ),
    ).toEqual({
      tag: 'AmbiguousWallDateTime',
      zone: 'America/New_York',
      value: {
        year: 2024,
        month: 11,
        day: 3,
        hour: 1,
        minute: 30,
        second: 0,
        millisecond: 0,
      },
      candidates: ['2024-11-03T05:30:00.000Z', '2024-11-03T06:30:00.000Z'],
    });
  });

  it('chooses earlier or later candidates for ambiguous wall times', () => {
    const wallTime = {
      year: 2024,
      month: 11,
      day: 3,
      hour: 1,
      minute: 30,
    };

    const earlier = expectOk(
      instantFromWall('America/New_York', wallTime, 'earlier'),
    );
    const later = expectOk(
      instantFromWall('America/New_York', wallTime, 'later'),
    );

    expect(
      [earlier, later].map((instant: InstantMs) => toUtcIso(instant)),
    ).toEqual(['2024-11-03T05:30:00.000Z', '2024-11-03T06:30:00.000Z']);
  });
});
