import type { Logger } from '@pressly/logging';
import type { CounterLabels, CounterName, CounterSink } from '@pressly/metrics';

export const makeLoggingCounterSink = (logger: Logger): CounterSink => ({
  increment: (name: CounterName, labels?: CounterLabels) =>
    logger.info('api counter incremented', {
      metric: name,
      labels,
      value: 1,
    }),
});
