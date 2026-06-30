import { describe, expect, it } from 'vitest';

import type { Result } from '@pressly/kernel';
import type { TimeError } from '../src/types.ts';
import {
  formatUtcIsoInNewYork,
  newYorkWallToUtcIso,
  utcIsoToNewYorkWall,
} from '../src/new-york.ts';

const expectOk = <A>(actual: Result<A, TimeError>): A => {
  expect(actual.tag).toBe('ok');

  if (actual.tag === 'err')
    throw new Error(`Expected ok result, received ${actual.error.tag}.`);

  return actual.value;
};

const expectErr = <A>(actual: Result<A, TimeError>): TimeError => {
  expect(actual.tag).toBe('err');

  if (actual.tag === 'ok') throw new Error('Expected err result, received ok.');

  return actual.error;
};

describe('pressly time New York <-> UTC', () => {
  it('converts winter UTC to New York wall time', () => {
    expect(expectOk(utcIsoToNewYorkWall('2024-01-15T15:30:00.000Z'))).toEqual({
      year: 2024,
      month: 1,
      day: 15,
      hour: 10,
      minute: 30,
      second: 0,
      millisecond: 0,
    });
  });

  it('converts summer UTC to New York wall time', () => {
    expect(expectOk(utcIsoToNewYorkWall('2024-07-15T14:30:00.000Z'))).toEqual({
      year: 2024,
      month: 7,
      day: 15,
      hour: 10,
      minute: 30,
      second: 0,
      millisecond: 0,
    });
  });

  it('rejects nonexistent spring-forward wall time', () => {
    const utcTimeResult = newYorkWallToUtcIso({
      year: 2024,
      month: 3,
      day: 10,
      hour: 2,
      minute: 30,
    });

    expect(expectErr(utcTimeResult)).toEqual({
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

  it('rejects ambiguous fall-back wall time by default', () => {
    const isoTimeResult = newYorkWallToUtcIso({
      year: 2024,
      month: 11,
      day: 3,
      hour: 1,
      minute: 30,
    });

    expect(expectErr(isoTimeResult)).toEqual({
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

  it('can choose the later ambiguous fall-back instant', () => {
    const utcIsoResult = newYorkWallToUtcIso(
      {
        year: 2024,
        month: 11,
        day: 3,
        hour: 1,
        minute: 30,
      },
      'later',
    );

    expect(expectOk(utcIsoResult)).toBe('2024-11-03T06:30:00.000Z');
  });

  it('formats UTC for New York presentation', () => {
    const result = formatUtcIsoInNewYork('2024-01-15T15:30:00.000Z');

    expect(expectOk(result)).toContain('Jan');
  });
});
