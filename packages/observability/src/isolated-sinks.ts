import type { CounterSink } from './counter.js';
import type { MeasurementSink } from './measurement.js';
import { attemptObservation } from './observation-effect.js';

/**
 * Decorates a counter sink so a secondary observation cannot replace the
 * authoritative outcome being observed.
 */
export const isolateCounterSink = (sink: CounterSink): CounterSink => ({
  increment: (name, labels) => {
    attemptObservation(() =>
      labels === undefined
        ? sink.increment(name)
        : sink.increment(name, labels),
    );
  },
});

/**
 * Decorates a measurement sink so a secondary observation cannot replace the
 * authoritative outcome being observed.
 */
export const isolateMeasurementSink = (
  sink: MeasurementSink,
): MeasurementSink => ({
  observe: (name, value, labels) => {
    attemptObservation(() =>
      labels === undefined
        ? sink.observe(name, value)
        : sink.observe(name, value, labels),
    );
  },
});
