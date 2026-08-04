import { isAppError, isRecord, type AppError } from '@pressly/errors/app-error';
import {
  conflictError,
  externalServiceError,
  validationError,
} from '@pressly/errors/factories';
import {
  appErrorFromApiFailure,
  decodeApiResponse,
  encodeJsonBody,
  responseTraceId,
} from '@pressly/http';
import { type ZodType } from 'zod';

const requestTimeoutMilliseconds = 15_000;

export const controlApiErrorKinds = [
  'session_refresh_required',
  'request_timeout',
  'service_unreachable',
  'unreadable_response',
  'authentication_required',
  'permission_denied',
  'record_not_found',
  'conflict',
  'invalid_request',
  'rate_limited',
  'service_unavailable',
  'request_rejected',
] as const;

export type ControlApiErrorKind = (typeof controlApiErrorKinds)[number];

export type ControlApiError = AppError &
  Readonly<{ controlKind: ControlApiErrorKind }>;

export const isControlApiError = (value: unknown): value is ControlApiError =>
  isAppError(value) &&
  isRecord(value) &&
  controlApiErrorKinds.includes(value['controlKind'] as ControlApiErrorKind);

export const makeControlApiError = (
  error: AppError,
  controlKind: ControlApiErrorKind = errorKindForAppError(error),
): ControlApiError => Object.freeze(Object.assign(error, { controlKind }));

const errorKindForAppError = (error: AppError): ControlApiErrorKind => {
  switch (error.kind) {
    case 'AuthError':
      return 'authentication_required';
    case 'PermissionError':
      return 'permission_denied';
    case 'NotFoundError':
      return 'record_not_found';
    case 'ConflictError':
      return 'conflict';
    case 'ValidationError':
      return 'invalid_request';
    case 'RateLimitError':
      return 'rate_limited';
    case 'ExternalServiceError':
    case 'DatabaseError':
    case 'InvariantViolationError':
    case 'UnexpectedError':
    case 'ConfigError':
      return 'service_unavailable';
  }
};

type FetchImplementation = typeof fetch;

export type ControlHttpClient = Readonly<{
  request: <Result>(
    input: {
      method?: 'GET' | 'POST' | 'PATCH';
      path: string;
      body?: unknown;
      csrf?: boolean;
    },
    schema: ZodType<Result>,
  ) => Promise<Result>;
  acceptCsrfToken: (token: string) => void;
  clearCsrfToken: () => void;
}>;

export function makeControlHttpClient(
  input: {
    fetchImplementation?: FetchImplementation;
    apiBaseUrl?: string;
  } = {},
): ControlHttpClient {
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const apiBaseUrl = (
    input.apiBaseUrl ??
    import.meta.env['VITE_API_URL'] ??
    '/api'
  ).replace(/\/$/, '');
  let csrfToken: string | null = null;

  const request = async <Result>(
    requestInput: {
      method?: 'GET' | 'POST' | 'PATCH';
      path: string;
      body?: unknown;
      csrf?: boolean;
    },
    schema: ZodType<Result>,
  ): Promise<Result> => {
    if (requestInput.csrf === true && csrfToken === null) {
      throw makeControlApiError(
        conflictError({
          code: 'control_session_refresh_required',
          message: 'A mutating Control request has no in-memory CSRF proof.',
          safeMessage: 'Refresh your session before trying again.',
        }),
        'session_refresh_required',
      );
    }

    const encodedBody =
      requestInput.body === undefined
        ? undefined
        : encodeJsonBody(requestInput.body);
    if (encodedBody?.tag === 'rejected')
      throw makeControlApiError(
        validationError({
          code: 'control_request_body_not_serializable',
          message: 'The Control request body cannot be encoded as JSON.',
          safeMessage: 'The request contains unsupported data.',
          details: { reason: encodedBody.reason },
          ...(encodedBody.cause === undefined
            ? {}
            : { cause: encodedBody.cause }),
        }),
        'invalid_request',
      );

    let response: Response;
    try {
      response = await fetchImplementation(
        `${apiBaseUrl}${requestInput.path}`,
        {
          method: requestInput.method ?? 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.timeout(requestTimeoutMilliseconds),
          headers: {
            Accept: 'application/json',
            ...(encodedBody === undefined
              ? {}
              : { 'Content-Type': 'application/json' }),
            ...(requestInput.csrf === true && csrfToken !== null
              ? { 'X-CSRF-Token': csrfToken }
              : {}),
          },
          ...(encodedBody?.tag === 'encoded' ? { body: encodedBody.body } : {}),
        },
      );
    } catch (error) {
      const timedOut = isRecord(error) && error['name'] === 'TimeoutError';

      throw makeControlApiError(
        externalServiceError({
          code: timedOut ? 'control_request_timed_out' : 'control_unreachable',
          message: timedOut
            ? 'The Control API request timed out.'
            : 'The Control API could not be reached.',
          safeMessage: timedOut
            ? 'The request timed out.'
            : 'Control is temporarily unavailable.',
          status: timedOut ? 504 : 503,
          cause: error,
        }),
        timedOut ? 'request_timeout' : 'service_unreachable',
      );
    }

    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw makeControlApiError(
        externalServiceError({
          code: 'control_response_not_json',
          message: 'The Control API response was not JSON.',
          safeMessage: 'Control returned an unreadable response.',
          status: 502,
          traceId: responseTraceId(response.headers),
        }),
        'unreadable_response',
      );
    }

    let decoded: unknown;
    try {
      decoded = await response.json();
    } catch (error) {
      throw makeControlApiError(
        externalServiceError({
          code: 'control_response_invalid_json',
          message: 'The Control API response body was invalid JSON.',
          safeMessage: 'Control returned an unreadable response.',
          status: 502,
          cause: error,
          traceId: responseTraceId(response.headers),
        }),
        'unreadable_response',
      );
    }

    const parsedEnvelope = decodeApiResponse(decoded, schema);
    if (!parsedEnvelope.success) {
      throw makeControlApiError(
        externalServiceError({
          code: 'control_response_contract_invalid',
          message: 'The Control API response violated its envelope contract.',
          safeMessage: 'Control returned an unreadable response.',
          status: 502,
          cause: parsedEnvelope.error,
          details: parsedEnvelope.error.issues,
          traceId: responseTraceId(response.headers),
        }),
        'unreadable_response',
      );
    }
    const envelope = parsedEnvelope.data;

    if (envelope.ok === false) {
      const appError = appErrorFromApiFailure({
        failure: envelope,
        responseStatus: response.status,
        headers: response.headers,
      });

      throw makeControlApiError(appError);
    }

    if (!response.ok)
      throw makeControlApiError(
        externalServiceError({
          code: 'control_status_envelope_mismatch',
          message: `The Control API returned HTTP ${response.status} with a success envelope.`,
          safeMessage: 'Control returned an unreadable response.',
          status: 502,
          details: { receivedStatus: response.status },
          traceId: responseTraceId(response.headers),
        }),
        'unreadable_response',
      );

    return envelope.data;
  };

  return {
    request,
    acceptCsrfToken: (token) => {
      csrfToken = token;
    },
    clearCsrfToken: () => {
      csrfToken = null;
    },
  };
}
