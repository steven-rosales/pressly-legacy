import {
  decode,
  type BoundaryContract,
  type ContractIssue,
} from '@pressly/cells';
import { z } from 'zod';
import type { RequestPort } from '../capabilities/request.port.ts';

export type BrowserHttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

export type BrowserHttpSurface<Method extends BrowserHttpMethod> = Readonly<{
  method: Method;
  path: string;
}>;

export type GeneratedBrowserOperation<
  Id extends string,
  Http extends Readonly<Record<string, BrowserHttpSurface<BrowserHttpMethod>>>,
> = Readonly<{
  operationId: Id;
  contract: Readonly<{
    inputVersion: number;
    outputVersion: number;
    failureVersion: number;
  }>;
  http: Http;
}>;

export type BrowserResponseCodec<Output> = Pick<
  BoundaryContract<Output>,
  'decode'
>;

export type ProcessorBrowserRequest = Readonly<{
  method: BrowserHttpMethod;
  path: string;
  body?: unknown;
  signal?: AbortSignal;
}>;

export type ProcessorBrowserRequestTransport = <Output>(
  request: ProcessorBrowserRequest,
  output: BrowserResponseCodec<Output>,
) => Promise<Output>;

const issues = (
  values: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): readonly ContractIssue[] =>
  values.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
  }));

export const strictWireCodec = <Output>(
  schema: z.ZodType<Output>,
): BrowserResponseCodec<Output> =>
  Object.freeze({
    decode: (serialized: unknown) => {
      const parsed = z.safeDecode(schema, serialized);
      return parsed.success
        ? decode.valid(parsed.data)
        : decode.invalid(issues(parsed.error.issues));
    },
  });

const browserResponseSchema = <Output>(
  codec: BrowserResponseCodec<Output>,
): z.ZodType<Output> =>
  z.unknown().transform((serialized, context) => {
    const decoded = codec.decode(serialized);
    if (decoded.kind === 'valid') return decoded.value;

    for (const issue of decoded.issues)
      context.addIssue({
        code: 'custom',
        path: [...issue.path],
        message: issue.message,
        input: serialized,
      });

    return z.NEVER;
  });

export const makeProcessorBrowserRequestTransport = (
  request: RequestPort,
): ProcessorBrowserRequestTransport =>
  Object.freeze((input, output) =>
    request(input, browserResponseSchema(output)),
  );
