import type { HttpResponseHeaderValue } from '@pressly/cells';
import type { Response } from 'express';

export const setHttpResponseHeaders = (
  response: Response,
  headers: Readonly<Record<string, HttpResponseHeaderValue>>,
): void => {
  for (const [name, value] of Object.entries(headers))
    response.setHeader(name, Array.isArray(value) ? [...value] : value);
};
