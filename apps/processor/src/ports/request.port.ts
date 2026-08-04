import type { z } from 'zod';

export type RequestInput<T> = Readonly<{
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: T;
  signal?: AbortSignal;
}>;

export type RequestPort = <Input, Output>(
  input: RequestInput<Input>,
  outputSchema: z.ZodType<Output>,
) => Promise<Output>;
