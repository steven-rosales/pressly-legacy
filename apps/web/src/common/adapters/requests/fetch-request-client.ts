import { result, type Result } from '@pressly/kernel';
import {
  externalServiceError,
  validationError,
  type AppError,
  type ExternalServiceErrorStatus,
} from '@pressly/errors';
import {
  appErrorFromApiFailure,
  decodeApiResponse,
  encodeJsonBody,
  responseTraceId,
} from '@pressly/http';
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

const appendQuery = (url: URL, query: RequestInput<unknown>['query']): URL => {
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, String(value));
  }

  return url;
};

const readJson = async (
  response: Response,
): Promise<Result<unknown, AppError>> => {
  const text = await response.text();

  if (text.trim().length === 0) return result.ok(null);

  try {
    return result.ok(JSON.parse(text));
  } catch (error) {
    return result.err(
      makeRequestError({
        code: 'invalid_json_response',
        message: 'API response body was not valid JSON.',
        safeMessage: 'The server returned an unexpected response.',
        status: 502,
        traceId: responseTraceId(response.headers),
        cause: error,
      }),
    );
  }
};

const makeRequestError = (input: {
  code: string;
  message: string;
  safeMessage: string;
  status: ExternalServiceErrorStatus;
  traceId?: string | undefined;
  details?: unknown;
  cause?: unknown;
}): AppError =>
  externalServiceError({
    code: input.code,
    message: input.message,
    safeMessage: input.safeMessage,
    status: input.status,
    ...(input.traceId === undefined ? {} : { traceId: input.traceId }),
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

/**
 * Creates a fetch request and handles:
 * - transport failed
 * - response body not JSON
 * - known API error envelope
 * - unknown non-2xx response
 * - known success envelope + valid data
 * - known/unknown success-shapes response with invalid data
 */
export const makeFetchRequestClient = ({
  baseUrl,
  getContext,
}: MakeFetchRequestClientInput): RequestClient => ({
  send: async <A>(input: RequestInput<A>): Promise<Result<A, AppError>> => {
    const encodedBody =
      input.body === undefined ? undefined : encodeJsonBody(input.body);
    if (encodedBody?.tag === 'rejected')
      return result.err(
        validationError({
          code: 'request_body_not_serializable',
          message: 'The Web request body cannot be encoded as JSON.',
          safeMessage: 'The request contains unsupported data.',
          details: { reason: encodedBody.reason },
          ...(encodedBody.cause === undefined
            ? {}
            : { cause: encodedBody.cause }),
        }),
      );

    const timeout = createAbortSignal(input.timeoutMs ?? 15_000, input.signal);
    const context = getContext();

    try {
      const url = appendQuery(new URL(input.path, baseUrl), input.query);

      const headers = new Headers(input.headers);

      headers.set('accept', 'application/json');
      headers.set('x-pressly-route', context.route ?? 'unknown');
      headers.set('x-pressly-session-id', context.sessionId ?? 'unknown');

      const hasBody = encodedBody?.tag === 'encoded';

      if (hasBody) headers.set('content-type', 'application/json');

      const response = await fetch(url, {
        method: input.method,
        headers,
        signal: timeout.signal,
        ...(input.cache === undefined ? {} : { cache: input.cache }),
        ...(input.next === undefined ? {} : { next: input.next }),
        ...(hasBody ? { body: encodedBody.body } : {}),
      });

      const jsonResult = await readJson(response);
      if (result.isErr(jsonResult)) return jsonResult;

      const json = jsonResult.value;

      const decoded = decodeApiResponse(json, input.response);

      if (!decoded.success)
        return result.err(
          makeRequestError({
            code: 'invalid_api_response',
            message: 'API response did not match the expected contract.',
            safeMessage: 'The server returned an unexpected response.',
            status: 502,
            traceId: responseTraceId(response.headers),
            details: decoded.error.issues,
            cause: decoded.error,
          }),
        );

      const envelope = decoded.data;

      if (envelope.ok === false)
        return result.err(
          appErrorFromApiFailure({
            failure: envelope,
            responseStatus: response.status,
            headers: response.headers,
          }),
        );

      if (!response.ok)
        return result.err(
          makeRequestError({
            code: 'http_error_response',
            message: `API returned HTTP ${response.status} with a success envelope.`,
            safeMessage: 'The server returned an unsuccessful response.',
            status: 502,
            traceId: responseTraceId(response.headers),
            details: { receivedStatus: response.status, envelope },
          }),
        );

      return result.ok(envelope.data);
    } catch (error) {
      const callerCancelled = input.signal?.aborted === true;
      const timedOut =
        !callerCancelled &&
        timeout.signal.aborted &&
        timeout.signal.reason instanceof DOMException &&
        timeout.signal.reason.name === 'TimeoutError';
      return result.err(
        makeRequestError({
          code: callerCancelled
            ? 'request_cancelled'
            : timedOut
              ? 'request_timed_out'
              : 'request_failed',
          message: callerCancelled
            ? 'Request was cancelled by its caller.'
            : timedOut
              ? 'Request timed out.'
              : 'Request failed.',
          safeMessage: callerCancelled
            ? 'The request was cancelled.'
            : timedOut
              ? 'The request timed out.'
              : 'The request could not be completed.',
          status: callerCancelled ? 408 : timedOut ? 504 : 503,
          cause: error,
        }),
      );
    } finally {
      timeout.dispose();
    }
  },
});
