import type { ExecutableEventStreamCatalog } from '@pressly/cells';
import {
  mountEventStreamCatalog,
  type EventStreamHostDependencies,
  type EventStreamHostMetrics,
} from '../public.ts';
import {
  isolateCounterSink,
  isolateMeasurementSink,
  type CounterSink,
  type MeasurementSink,
} from '@pressly/observability';
import { systemClock } from '@pressly/time';
import express, {
  type RequestHandler,
  type Response,
  type Router,
} from 'express';
import { continueApiCatalogRequest } from './catalog-middleware.ts';

export type ApiEventStreamCatalogDependencies = Readonly<{
  catalog: ExecutableEventStreamCatalog;
  authenticate: RequestHandler;
  authorize: EventStreamHostDependencies['authorize'];
  readActorId: (response: Response) => string;
  counters: CounterSink;
  measurements: MeasurementSink;
  now?: () => number;
  heartbeatIntervalMs?: number;
  reauthorizeIntervalMs?: number;
}>;

const sessionExpiresAt = (response: Response): number | null => {
  const auth: unknown = response.locals['auth'];
  if (auth === null || typeof auth !== 'object') return null;
  const principal: unknown = Reflect.get(auth, 'principal');
  if (principal === null || typeof principal !== 'object') return null;
  const expiry: unknown = Reflect.get(principal, 'sessionExpiresAt');
  const parsed =
    expiry instanceof Date
      ? expiry.getTime()
      : typeof expiry === 'string'
        ? Date.parse(expiry)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const makeMetrics = (
  counters: CounterSink,
  measurements: MeasurementSink,
): EventStreamHostMetrics => {
  const { increment } = isolateCounterSink(counters);
  const { observe } = isolateMeasurementSink(measurements);

  return Object.freeze({
    connection: (outcome) => increment('api.sse_connections', { outcome }),
    activeConnections: (count) => observe('api.sse_active_connections', count),
    event: (type) => increment('api.sse_events', { type }),
    failure: (reason) => increment('api.sse_failures', { reason }),
  });
};

/**
 * Builds an event-stream route collection from an assembled catalog.
 * The surrounding API application remains the owner of request context,
 * request metrics, rate limiting, and final error observation.
 */
export const makeApiEventStreamCatalogRouter = (
  input: ApiEventStreamCatalogDependencies,
): Router => {
  const router = express.Router();

  mountEventStreamCatalog({
    router,
    catalog: input.catalog,
    dependencies: {
      requestContext: () => continueApiCatalogRequest,
      authentication: ({ required }) =>
        required ? input.authenticate : continueApiCatalogRequest,
      readCellContext: (_request, response) =>
        Object.freeze({ actorId: input.readActorId(response) }),
      authorize: input.authorize,
      sessionExpiresAt: (_request, response) => sessionExpiresAt(response),
      metrics: makeMetrics(input.counters, input.measurements),
      now: input.now ?? (() => systemClock.now().getTime()),
      ...(input.heartbeatIntervalMs === undefined
        ? {}
        : { heartbeatIntervalMs: input.heartbeatIntervalMs }),
      ...(input.reauthorizeIntervalMs === undefined
        ? {}
        : { reauthorizeIntervalMs: input.reauthorizeIntervalMs }),
    },
  });

  return router;
};
