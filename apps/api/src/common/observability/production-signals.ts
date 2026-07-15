import type { Logger } from '@pressly/logging';
import type { CounterLabels, CounterName, CounterSink } from '@pressly/metrics';
import type { ProductionSignalsPort } from '@pressly/production';
import type { RequestHandler } from 'express';
import { normalizedApiRoute } from './api-route.ts';

export const makeLoggingCounterSink = (logger: Logger): CounterSink => ({
  increment: (name: CounterName, labels?: CounterLabels) =>
    logger.info('api counter incremented', {
      metric: name,
      labels,
      value: 1,
    }),
});

/**
 * Maps committed production-domain outcomes to the deployment's counter sink.
 * The application layer invokes these signals only after a transaction commits,
 * so retries and rejected HTTP requests cannot inflate business counters.
 */
export const makeProductionDomainSignals = (
  counters: CounterSink,
): ProductionSignalsPort => ({
  planSuperseded: () =>
    counters.increment('production.plan_supersessions', {
      operation: 'compute_replace_current',
    }),
  runStarted: () => counters.increment('production.runs_started'),
  placementOutcome: ({ status, mode, reason }) =>
    counters.increment('production.placement_outcomes', {
      status,
      mode,
      reason: reason ?? 'none',
    }),
  queueConflict: ({ operation }) =>
    counters.increment('production.queue_conflicts', { operation }),
  batchFrozen: ({ source }) =>
    counters.increment('production.batch_freezes', { source }),
  overtimeConfirmed: () =>
    counters.increment('production.overtime_confirmations', {
      status: 'placed',
    }),
});

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
