import { describe, expect, it, vi } from 'vitest';
import {
  attemptAsyncObservation,
  attemptAsyncObservationValue,
  attemptObservation,
  attemptObservationValue,
} from '../src/observation-effect.js';

describe('attemptObservation', () => {
  it('describes successful observation effects', () => {
    const effect = vi.fn();

    expect(attemptObservation(effect)).toEqual({ tag: 'observed' });
    expect(effect).toHaveBeenCalledOnce();
  });

  it('captures sink failures as data instead of throwing', () => {
    const failure = new Error('sink unavailable');

    expect(
      attemptObservation(() => {
        throw failure;
      }),
    ).toEqual({ tag: 'failed', error: failure });
  });

  it('preserves non-authoritative observation values as data', () => {
    expect(attemptObservationValue(() => 42)).toEqual({
      tag: 'observed',
      value: 42,
    });
  });

  it('captures observation-value failures as data', () => {
    const failure = new Error('clock unavailable');

    expect(
      attemptObservationValue(() => {
        throw failure;
      }),
    ).toEqual({ tag: 'failed', error: failure });
  });

  it('preserves asynchronous observation values as data', async () => {
    await expect(attemptAsyncObservationValue(async () => 42)).resolves.toEqual(
      { tag: 'observed', value: 42 },
    );
  });

  it('captures asynchronous observation failures as data', async () => {
    const failure = new Error('flush unavailable');

    await expect(
      attemptAsyncObservation(async () => {
        throw failure;
      }),
    ).resolves.toEqual({ tag: 'failed', error: failure });
  });
});
