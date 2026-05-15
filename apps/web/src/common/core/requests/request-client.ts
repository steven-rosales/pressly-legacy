import type { AppError, Result } from '@pressly/errors';
import type { z } from 'zod';

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RequestInput<A> = Readonly<{
  method: RequestMethod;
  path: string | URL;
  response: z.ZodType<A>;
  query?: Readonly<Record<string, string | number | boolean>>;
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  timeoutMs?: number;
  cache?: RequestCache;
  next?: { revalidate?: number; tags?: string[] };
}>;

export type RequestClient = Readonly<{
  send: <A>(input: RequestInput<A>) => Promise<Result<A, AppError>>;
}>;
