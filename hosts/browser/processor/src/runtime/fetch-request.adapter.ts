import type { z } from 'zod';
import { validationError } from '@pressly/errors/factories';
import {
  appErrorKindForHttpStatus,
  appErrorFromApiFailure,
  decodeApiResponse,
  encodeJsonBody,
  responseTraceId,
  type HttpAppErrorKind,
} from '@pressly/http';
import {
  requestFailure,
  type RequestFailure,
  type RequestFailureKind,
  type RequestInput,
  type RequestPort,
} from '@pressly/generated-runtime/browser/processor';

export type RequestFailureContext = Readonly<{
  method: string;
  path: string;
}>;

const failureKind = (kind: HttpAppErrorKind): RequestFailureKind => {
  switch (kind) {
    case 'AuthError':
      return 'unauthorized';
    case 'PermissionError':
      return 'forbidden';
    case 'ValidationError':
      return 'invalid_request';
    case 'NotFoundError':
      return 'not_found';
    case 'ConflictError':
      return 'conflict';
    case 'RateLimitError':
      return 'rate_limited';
    case 'ExternalServiceError':
      return 'unavailable';
  }
};

const isUnsafe = (method: string): boolean =>
  !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());

const joinUrl = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

export const makeFetchRequestAdapter = (input: {
  baseUrl: string;
  readCsrfToken: () => string | null;
  onUnauthorized?: () => void;
  onFailure?: (failure: RequestFailure, context: RequestFailureContext) => void;
  fetch: typeof globalThis.fetch;
}): RequestPort => {
  const fetcher = input.fetch;

  return async <Input, Output>(
    request: RequestInput<Input>,
    outputSchema: z.ZodType<Output>,
  ): Promise<Output> => {
    const method = request.method ?? 'GET';
    const csrfToken = isUnsafe(method) ? input.readCsrfToken() : null;

    const observed = (failure: RequestFailure): RequestFailure => {
      try {
        input.onFailure?.(failure, { method, path: request.path });
      } catch {
        // Telemetry must never replace the request failure seen by the operator.
      }
      return failure;
    };

    const encodedBody =
      request.body === undefined ? undefined : encodeJsonBody(request.body);
    if (encodedBody?.tag === 'rejected') {
      const appError = validationError({
        code: 'processor_request_body_not_serializable',
        message: 'The Processor request body cannot be encoded as JSON.',
        safeMessage: 'The request contains unsupported data.',
        details: { reason: encodedBody.reason },
        ...(encodedBody.cause === undefined
          ? {}
          : { cause: encodedBody.cause }),
      });

      throw observed(
        requestFailure({
          requestKind: 'invalid_request',
          code: appError.code,
          message: appError.safeMessage,
          cause: appError,
        }),
      );
    }

    let response: Response;

    try {
      response = await fetcher(joinUrl(input.baseUrl, request.path), {
        method,
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          ...(encodedBody === undefined
            ? {}
            : { 'Content-Type': 'application/json' }),
          ...(csrfToken === null ? {} : { 'X-CSRF-Token': csrfToken }),
        },
        ...(encodedBody?.tag === 'encoded' ? { body: encodedBody.body } : {}),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
    } catch (cause) {
      if (
        request.signal?.aborted === true ||
        (cause instanceof DOMException && cause.name === 'AbortError')
      )
        throw cause;

      throw observed(
        requestFailure({
          requestKind: 'unavailable',
          code: 'NETWORK_UNAVAILABLE',
          message: 'The production service is unavailable.',
          cause,
        }),
      );
    }

    const requestId = responseTraceId(response.headers);
    let decoded: unknown;

    try {
      decoded = await response.json();
    } catch (cause) {
      throw observed(
        requestFailure({
          requestKind: 'invalid_response',
          code: 'INVALID_API_RESPONSE',
          message: 'The production service returned an unreadable response.',
          responseStatus: response.status,
          ...(requestId === undefined ? {} : { requestId }),
          cause,
        }),
      );
    }

    const parsed = decodeApiResponse(decoded, outputSchema);
    if (!parsed.success)
      throw observed(
        requestFailure({
          requestKind: 'invalid_response',
          code: 'INVALID_API_RESPONSE',
          message: 'The production service returned data outside its contract.',
          responseStatus: response.status,
          ...(requestId === undefined ? {} : { requestId }),
          cause: parsed.error,
        }),
      );

    const envelope = parsed.data;

    if (envelope.ok === false) {
      const appError = appErrorFromApiFailure({
        failure: envelope,
        responseStatus: response.status,
        headers: response.headers,
      });
      const kind = failureKind(appErrorKindForHttpStatus(appError.status));
      if (kind === 'unauthorized') {
        try {
          input.onUnauthorized?.();
        } catch {
          // Session cleanup cannot replace the authoritative request failure.
        }
      }

      throw observed(
        requestFailure({
          requestKind: kind,
          code: appError.code,
          message: appError.safeMessage,
          responseStatus: response.status,
          ...(requestId === undefined ? {} : { requestId }),
          ...(appError.traceId === undefined
            ? {}
            : { traceId: appError.traceId }),
          cause: appError,
        }),
      );
    }

    if (!response.ok)
      throw observed(
        requestFailure({
          requestKind: 'unexpected',
          code: `HTTP_${response.status}`,
          message:
            'The production service returned a success envelope with an unsuccessful status.',
          responseStatus: response.status,
          ...(requestId === undefined ? {} : { requestId }),
        }),
      );

    return envelope.data;
  };
};
