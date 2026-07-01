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

    res.once('finish', () => {
      if (res.statusCode < 500) return;

      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      logger.error('api.request.failed', {
        requestId,
        method: req.method,
        route,
        status: res.statusCode,
        durationMs,
        isHealthCheck,
      });
    });

    next();
  };
