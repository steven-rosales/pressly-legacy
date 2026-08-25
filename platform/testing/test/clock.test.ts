import { describe, expect, it } from 'vitest';
import { makeFixedClock, makeMutableClock } from '../src/clock.ts';

describe('test clocks', () => {
  it('returns defensive Date values from a fixed clock', () => {
    const initial = new Date('2026-08-03T12:00:00.000Z');
    const clock = makeFixedClock(initial);

    initial.setUTCFullYear(2000);
    const first = clock.now();
    first.setUTCFullYear(2001);

    expect(clock.now().toISOString()).toBe('2026-08-03T12:00:00.000Z');
  });

  it('sets and advances a mutable clock without exposing its internal Date', () => {
    const clock = makeMutableClock(new Date('2026-08-03T12:00:00.000Z'));

    clock.advanceBy(90_000);
    expect(clock.now().toISOString()).toBe('2026-08-03T12:01:30.000Z');

    const replacement = new Date('2026-08-04T09:30:00.000Z');
    clock.set(replacement);
    replacement.setUTCFullYear(2000);

    expect(clock.now().toISOString()).toBe('2026-08-04T09:30:00.000Z');
  });
});
