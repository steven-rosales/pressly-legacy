import {
  attemptObservation,
  type CounterSink,
  type MeasurementSink,
} from '@pressly/observability';
import type { RequestHandler } from 'express';
import { normalizedApiRoute } from './api-route.ts';

export const makeApiRequestMetrics = (input: {
  counters: CounterSink;
  measurements: MeasurementSink;
  now?: () => bigint;
}): RequestHandler => {
  const now = input.now ?? process.hrtime.bigint;

  return (req, res, next) => {
    const startedAt = now();
    let recorded = false;

    const record = (outcome: 'completed' | 'aborted') => {
      if (recorded) return;

      recorded = true;

      const route = normalizedApiRoute(req);
      const statusClass = `${Math.floor(res.statusCode / 100)}xx`;

      const labels = {
        method: req.method,
        route,
        status: statusClass,
        outcome,
      };

      attemptObservation(() =>
        input.counters.increment('api.http_requests', labels),
      );
      attemptObservation(() =>
        input.measurements.observe(
          'api.http_request_duration_seconds',
          Number(now() - startedAt) / 1_000_000_000,
          labels,
        ),
      );
    };

    res.once('finish', () => record('completed'));
    res.once('close', () => record('aborted'));

    next();
  };
};
