import { describe, expect, it } from 'vitest';
import { systemClock } from '../src/clock.ts';

describe('systemClock', () => {
  it('reads the current system time through an immutable clock port', () => {
    const before = Date.now();
    const actual = systemClock.now();
    const after = Date.now();

    expect(Object.isFrozen(systemClock)).toBe(true);
    expect(actual).toBeInstanceOf(Date);
    expect(actual.getTime()).toBeGreaterThanOrEqual(before);
    expect(actual.getTime()).toBeLessThanOrEqual(after);
  });
});
