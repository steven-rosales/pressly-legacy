import { productionLocationParamsSchema } from '@pressly/contracts/production';
import { notFoundError } from '@pressly/errors/factories';
import { defineValidatedController } from '@pressly/http/express';
import {
  isolateCounterSink,
  isolateMeasurementSink,
  type CounterSink,
  type MeasurementSink,
} from '@pressly/observability';
import { systemClock } from '@pressly/time';
import { Router, type RequestHandler, type Response } from 'express';
import type {
  ProductionChange,
  ProductionChangeFeed,
} from './postgres-production-change-feed.adapter.ts';

const writeEvent = (
  response: Response,
  event: 'ready' | 'change' | 'resync',
  data: Readonly<Record<string, unknown>>,
  id?: number,
): void => {
  if (id !== undefined) response.write(`id: ${id}\n`);
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
};

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

export const makeProductionChangeRoutes = (input: {
  feed: ProductionChangeFeed;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  counters: CounterSink;
  measurements: MeasurementSink;
  heartbeatIntervalMs?: number;
  reauthorizeIntervalMs?: number;
}): Router => {
  const router = Router();
  const heartbeatIntervalMs = input.heartbeatIntervalMs ?? 20_000;
  const reauthorizeIntervalMs = input.reauthorizeIntervalMs ?? 5 * 60_000;
  let activeConnections = 0;
  const { increment } = isolateCounterSink(input.counters);
  const { observe: measure } = isolateMeasurementSink(input.measurements);

  const changeController = defineValidatedController({
    request: { params: productionLocationParamsSchema },
    handle: async ({ params }, { request, response }) => {
      const { locationId } = params;
      let bufferedRevision: number | null = null;
      let bufferedResync = false;
      let ready = false;
      let closed = false;
      let counted = false;
      let heartbeat: NodeJS.Timeout | null = null;
      let reauthorize: NodeJS.Timeout | null = null;
      let unsubscribe = (): void => undefined;

      const close = (): void => {
        if (closed) return;
        closed = true;
        if (heartbeat !== null) clearInterval(heartbeat);
        if (reauthorize !== null) clearTimeout(reauthorize);
        unsubscribe();
        if (!counted) return;
        counted = false;
        activeConnections = Math.max(0, activeConnections - 1);
        increment('api.sse_connections', { outcome: 'closed' });
        measure('api.sse_active_connections', activeConnections);
      };

      response.once('close', close);
      response.once('finish', close);
      response.once('error', close);
      request.once('aborted', close);

      const send = (change: ProductionChange): void => {
        if (closed) return;
        if (change.kind === 'shutdown') {
          response.end();
          close();
          return;
        }
        if (!ready) {
          if (change.kind === 'resync') bufferedResync = true;
          else
            bufferedRevision = Math.max(
              bufferedRevision ?? change.revision,
              change.revision,
            );
          return;
        }
        try {
          if (change.kind === 'revision') {
            writeEvent(
              response,
              'change',
              { revision: change.revision },
              change.revision,
            );
            increment('api.sse_events', { type: 'change' });
            return;
          }
          writeEvent(response, 'resync', { reason: 'upstream_reconnected' });
          increment('api.sse_events', { type: 'resync' });
        } catch {
          close();
        }
      };

      unsubscribe = input.feed.subscribe(locationId, send);
      let revision: number | null;
      try {
        revision = await input.feed.currentRevision(locationId);
      } catch (error: unknown) {
        close();
        throw error;
      }
      if (closed) return;
      if (revision === null) {
        close();
        throw notFoundError({
          code: 'production_location_not_found',
          message: `Production location ${locationId} was not found.`,
          safeMessage: 'The production location was not found.',
        });
      }

      response.status(200);
      response.setHeader('Content-Type', 'text/event-stream');
      response.setHeader(
        'Cache-Control',
        'no-store, no-cache, private, no-transform',
      );
      response.setHeader('Connection', 'keep-alive');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders();
      response.write('retry: 3000\n\n');

      activeConnections += 1;
      counted = true;
      increment('api.sse_connections', { outcome: 'opened' });
      measure('api.sse_active_connections', activeConnections);
      ready = true;
      writeEvent(response, 'ready', { revision }, revision);
      increment('api.sse_events', { type: 'ready' });
      if (bufferedResync) send({ kind: 'resync' });
      else if (bufferedRevision !== null && bufferedRevision > revision)
        send({ kind: 'revision', revision: bufferedRevision });

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          response.write(': heartbeat\n\n');
        } catch {
          close();
        }
      }, heartbeatIntervalMs);
      heartbeat.unref();

      const absoluteExpiry = sessionExpiresAt(response);
      const untilExpiry =
        absoluteExpiry === null
          ? reauthorizeIntervalMs
          : Math.max(1, absoluteExpiry - systemClock.now().getTime());
      reauthorize = setTimeout(
        () => {
          if (!closed) response.end();
        },
        Math.min(reauthorizeIntervalMs, untilExpiry),
      );
      reauthorize.unref();
    },
  });

  router.get(
    '/production/locations/:locationId/events',
    input.authenticate,
    changeController.validate,
    input.authorize,
    changeController.handle,
  );

  return router;
};
