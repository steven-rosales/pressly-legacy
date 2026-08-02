import { describe, expect, it, vi } from 'vitest';
import {
  isolateCounterSink,
  isolateMeasurementSink,
} from '../src/isolated-sinks.js';

describe('isolated observation sinks', () => {
  it('preserves counter calls while containing sink failures', () => {
    const increment = vi.fn(() => {
      throw new Error('counter unavailable');
    });
    const counters = isolateCounterSink({ increment });

    expect(() => counters.increment('worker.jobs_completed')).not.toThrow();
    expect(increment).toHaveBeenCalledWith('worker.jobs_completed');
  });

  it('preserves labeled counter calls', () => {
    const increment = vi.fn();
    const counters = isolateCounterSink({ increment });

    counters.increment('worker.jobs_failed', { reason: 'exhausted' });

    expect(increment).toHaveBeenCalledWith('worker.jobs_failed', {
      reason: 'exhausted',
    });
  });

  it('preserves measurement calls while containing sink failures', () => {
    const observe = vi.fn(() => {
      throw new Error('measurement unavailable');
    });
    const measurements = isolateMeasurementSink({ observe });

    expect(() =>
      measurements.observe('api.sse_active_connections', 2),
    ).not.toThrow();
    expect(observe).toHaveBeenCalledWith('api.sse_active_connections', 2);
  });
});
