import {
  err,
  makeAppError,
  ok,
  type AppError,
  type HttpStatusCode,
  type Result,
} from '@pressly/errors';
import { z } from 'zod';
import type {
  RequestClient,
  RequestInput,
} from '@/common/core/requests/request-client';

export type MakeFetchRequestClientInput = Readonly<{
  baseUrl: string;
  getContext: () => Readonly<{
    route?: string;
    sessionId?: string;
    distinctId?: string;
  }>;
}>;

const apiFailureSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    traceId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

const apiSuccessSchema = <A>(data: z.ZodType<A>) =>
  z.object({
    ok: z.literal(true),
    data,
    meta: z.record(z.string(), z.unknown()).optional(),
  });

const appendQuery = (url: URL, query: RequestInput<unknown>['query']): URL => {
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, String(value));
  }

  return url;
};

const statusFromResponse = (status: number): HttpStatusCode => {
  switch (status) {
    case 400:
    case 401:
    case 403:
    case 404:
    case 409:
    case 422:
    case 429:
    case 500:
    case 502:
    case 503:
      return status;
    default:
      return 500;
  }
};

const readJson = async (
  response: Response,
): Promise<Result<unknown, AppError>> => {
  const text = await response.text();

  if (text.trim().length === 0) return ok(null);

  try {
    return ok(JSON.parse(text));
  } catch (error) {
    return err(
      makeRequestError({
        code: 'invalid_json_response',
        message: 'API response body was not valid JSON.',
        safeMessage: 'The server returned an unexpected response.',
        status: 502,
        cause: error,
      }),
    );
  }
};

const makeRequestError = (input: {
  code: string;
  message: string;
  safeMessage: string;
  status: HttpStatusCode;
  details?: unknown;
  cause?: unknown;
}): AppError =>
  makeAppError({
    kind: 'ExternalServiceError',
    code: input.code,
    message: input.message,
    safeMessage: input.safeMessage,
    status: input.status,
    ...(input.details === undefined ? {} : { details: input.details }),
    ...(input.cause === undefined ? {} : { cause: input.cause }),
  });

const createAbortSignal = (
  timeoutMs: number,
  externalSignal: AbortSignal | undefined,
): Readonly<{ signal: AbortSignal; dispose: () => void }> => {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, timeoutMs);

  const abort = () => controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted === true) {
    abort();
  } else {
    externalSignal?.addEventListener('abort', abort, { once: true });
  }

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abort);
    },
  };
};

export const makeFetchRequestClient = ({
  baseUrl,
  getContext,
}: MakeFetchRequestClientInput): RequestClient => ({
  send: async <A>(input: RequestInput<A>): Promise<Result<A, AppError>> => {
    const timeout = createAbortSignal(input.timeoutMs ?? 15_000, input.signal);
    const context = getContext();

    try {
      const url = appendQuery(new URL(input.path, baseUrl), input.query);

      const headers = new Headers(input.headers);

      headers.set('accept', 'application/json');
      headers.set('x-pressly-route', context.route ?? 'unknown');
      headers.set('x-pressly-session-id', context.sessionId ?? 'unknown');

      const hasBody = input.body !== undefined;

      if (hasBody) headers.set('content-type', 'application/json');

      const response = await fetch(url, {
        method: input.method,
        headers,
        signal: timeout.signal,
        ...(hasBody ? { body: JSON.stringify(input.body) } : {}),
      });

      const jsonResult = await readJson(response);
      if (!jsonResult.ok) return jsonResult;

      const json = jsonResult.value;

      const failureResult = apiFailureSchema.safeParse(json);

      if (failureResult.success)
        return err(
          makeRequestError({
            code: failureResult.data.error.code,
            message: failureResult.data.error.message,
            safeMessage: failureResult.data.error.message,
            status: statusFromResponse(response.status),
            details: failureResult.data.error.details,
          }),
        );

      const successResult = apiSuccessSchema(input.response).safeParse(json);

      if (!successResult.success)
        return err(
          makeRequestError({
            code: 'invalid_api_response',
            message: 'API response did not match the expected contract.',
            safeMessage: 'The server returned an unexpected response.',
            status: 502,
            details: successResult.error.issues,
            cause: successResult.error,
          }),
        );

      return ok(successResult.data.data);
    } catch (error) {
      return err(
        makeRequestError({
          code: 'request_failed',
          message: 'Request failed.',
          safeMessage: 'The request could not be completed',
          status: 503,
          cause: error,
        }),
      );
    } finally {
      timeout.dispose();
    }
  },
});
