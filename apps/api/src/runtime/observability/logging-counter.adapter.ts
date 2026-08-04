import type { Logger } from '@pressly/logging';
import {
  attemptObservation,
  type CounterLabels,
  type CounterName,
  type CounterSink,
} from '@pressly/observability';

export const makeLoggingCounterSink = (logger: Logger): CounterSink => ({
  increment: (name: CounterName, labels?: CounterLabels) => {
    attemptObservation(() =>
      logger.info('api counter incremented', {
        metric: name,
        labels,
        value: 1,
      }),
    );
  },
});
