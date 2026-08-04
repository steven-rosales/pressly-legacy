import { attemptObservation, type CounterSink } from '@pressly/observability';
import type { RequestHandler } from 'express';
import { normalizedApiRoute } from './api-route.ts';

export const makeProductionSignals =
  (counters: CounterSink): RequestHandler =>
  (request, response, next) => {
    response.once('finish', () => {
      const route = normalizedApiRoute(request);
      const successful =
        response.statusCode >= 200 && response.statusCode < 300;
      if (route === '/webhooks/cents' && successful)
        attemptObservation(() =>
          counters.increment('worker.inbox_receipts', { source: 'cents' }),
        );

      if (route.startsWith('/production/') && response.statusCode === 409) {
        attemptObservation(() =>
          counters.increment('api.command_conflicts', { route }),
        );
        attemptObservation(() =>
          counters.increment('product.invariant_failures', { route }),
        );
      }
    });

    next();
  };
