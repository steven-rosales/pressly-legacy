import type { CounterSink } from '@pressly/metrics';
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
        counters.increment('worker.inbox_receipts', { source: 'cents' });

      if (route.startsWith('/production/') && response.statusCode === 409) {
        counters.increment('api.command_conflicts', { route });
        counters.increment('product.invariant_failures', { route });
      }
    });

    next();
  };
