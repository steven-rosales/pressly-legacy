import type { Logger } from '@pressly/logging';
import type { CounterLabels, CounterName, CounterSink } from '@pressly/metrics';
import type { RequestHandler } from 'express';

export const makeLoggingCounterSink = (logger: Logger): CounterSink => ({
  increment: (name: CounterName, labels?: CounterLabels) =>
    logger.info('api counter incremented', {
      metric: name,
      labels,
      value: 1,
    }),
});

export const makeProductionSignals =
  (counters: CounterSink): RequestHandler =>
  (request, response, next) => {
    response.once('finish', () => {
      const route = request.originalUrl.split('?')[0] ?? request.path;

      if (
        route === '/webhooks/cents' &&
        response.statusCode >= 200 &&
        response.statusCode < 300
      )
        counters.increment('worker.inbox_receipts', { source: 'cents' });

      if (route.startsWith('/production/') && response.statusCode === 409) {
        counters.increment('api.command_conflicts', { route });
        counters.increment('product.invariant_failures', { route });
      }
    });

    next();
  };
