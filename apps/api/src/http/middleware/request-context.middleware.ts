import { uuidIdSource } from '@pressly/kernel/node';
import type { RequestHandler } from 'express';

export const makeRequestContext =
  (): RequestHandler =>
  (_request, response, next): void => {
    const requestId = uuidIdSource.next();

    response.locals['requestId'] = requestId;
    response.setHeader('X-Request-Id', requestId);

    next();
  };
