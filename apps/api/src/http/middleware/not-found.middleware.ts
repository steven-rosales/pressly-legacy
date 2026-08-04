import { notFoundError } from '@pressly/errors/factories';
import type { RequestHandler } from 'express';

export const makeNotFoundHandler = (): RequestHandler => {
  return (req, _res, next): void => {
    next(
      notFoundError({
        code: 'route_not_found',
        message: `Route not found: ${req.method} ${req.originalUrl}`,
        safeMessage: 'The request route was not found.',
      }),
    );
  };
};
