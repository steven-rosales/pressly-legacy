import {
  attemptObservation,
  type CounterSink,
  type MeasurementSink,
} from '@pressly/metrics';
import type { RequestHandler } from 'express';
import { normalizedApiRoute } from './api-route.ts';

export const makeApiRequestMetrics = (input: {
  counters: CounterSink;
  measurements: MeasurementSink;
  now?: () => bigint;
}): RequestHandler => {
  const now = input.now ?? process.hrtime.bigint;
  return (request, response, next) => {
    const startedAt = now();
    let recorded = false;
    const record = (outcome: 'completed' | 'aborted') => {
      if (recorded) return;
      recorded = true;
      const route = normalizedApiRoute(request);
      const statusClass = `${Math.floor(response.statusCode / 100)}xx`;
      const labels = {
        method: request.method,
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
    response.once('finish', () => record('completed'));
    response.once('close', () => record('aborted'));
    next();
  };
};
