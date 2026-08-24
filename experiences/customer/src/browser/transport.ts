import {
  decode,
  type BoundaryContract,
  type ContractIssue,
} from '@pressly/cells';
import * as result from '@pressly/cells/result';
import { z } from 'zod';
import type { RequestClient } from '../web/transport/model/request-client.ts';

export type BrowserResponseCodec<Output> = Pick<
  BoundaryContract<Output>,
  'decode'
>;

export type CustomerBrowserRequest = Readonly<{
  method: 'GET';
  path: string;
}>;

export type CustomerBrowserRequestTransport = <Output>(
  request: CustomerBrowserRequest,
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

export const makeCustomerBrowserRequestTransport = (
  input: Readonly<{
    request: RequestClient;
    next?: Readonly<{ revalidate?: number; tags?: string[] }>;
  }>,
): CustomerBrowserRequestTransport =>
  Object.freeze(async (request, output) => {
    const response = await input.request.send({
      ...request,
      response: browserResponseSchema(output),
      ...(input.next === undefined ? {} : { next: input.next }),
    });
    if (result.isErr(response)) throw response.error;
    return response.value;
  });
