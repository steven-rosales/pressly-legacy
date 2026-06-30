import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from '@pressly/logging';

export const makeRequestContext =
  (logger: Logger): RequestHandler =>
  (req, res, next): void => {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    const route = req.path;
    const isHealthCheck = route.startsWith('/health/');

    res.locals['requestId'] = requestId;
    res.setHeader('X-Request-Id', requestId);

    if (!isHealthCheck)
      logger.info('api.request.started', {
        requestId,
        method: req.method,
        route,
      });

    res.once('finish', () => {
      if (isHealthCheck && res.statusCode < 400) return;

      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      logger.info('api.request.completed', {
        requestId,
        method: req.method,
        route,
        status: res.statusCode,
        durationMs,
      });
    });

    next();
  };
