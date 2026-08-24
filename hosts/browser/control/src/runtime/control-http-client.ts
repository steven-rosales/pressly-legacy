import { isRecord } from '@pressly/errors/app-error';
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
import type {
  ControlBrowserHttpClient,
  ControlRequestErrorKind,
} from '@pressly/generated-runtime/browser/control';
import { makeControlRequestError } from '@pressly/generated-runtime/browser/control';
import { type ZodType } from 'zod';

const requestTimeoutMilliseconds = 15_000;

type FetchImplementation = typeof fetch;

export function makeControlHttpClient(input: {
  fetchImplementation: FetchImplementation;
  apiBaseUrl: string;
}): ControlBrowserHttpClient {
  const fetchImplementation = input.fetchImplementation;
  const apiBaseUrl = input.apiBaseUrl.replace(/\/$/, '');
  let csrfToken: string | null = null;

  const request = async <Result>(
    requestInput: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      path: string;
      body?: unknown;
      csrf?: boolean;
    },
    schema: ZodType<Result>,
  ): Promise<Result> => {
    if (requestInput.csrf === true && csrfToken === null) {
      throw makeControlRequestError(
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
      throw makeControlRequestError(
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

      throw makeControlRequestError(
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
        (timedOut
          ? 'request_timeout'
          : 'service_unreachable') satisfies ControlRequestErrorKind,
      );
    }

    const traceId = responseTraceId(response.headers);

    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw makeControlRequestError(
        externalServiceError({
          code: 'control_response_not_json',
          message: 'The Control API response was not JSON.',
          safeMessage: 'Control returned an unreadable response.',
          status: 502,
          ...(traceId === undefined ? {} : { traceId }),
        }),
        'unreadable_response',
      );
    }

    let decoded: unknown;
    try {
      decoded = await response.json();
    } catch (error) {
      throw makeControlRequestError(
        externalServiceError({
          code: 'control_response_invalid_json',
          message: 'The Control API response body was invalid JSON.',
          safeMessage: 'Control returned an unreadable response.',
          status: 502,
          cause: error,
          ...(traceId === undefined ? {} : { traceId }),
        }),
        'unreadable_response',
      );
    }

    const parsedEnvelope = decodeApiResponse(decoded, schema);
    if (!parsedEnvelope.success) {
      throw makeControlRequestError(
        externalServiceError({
          code: 'control_response_contract_invalid',
          message: 'The Control API response violated its envelope contract.',
          safeMessage: 'Control returned an unreadable response.',
          status: 502,
          cause: parsedEnvelope.error,
          details: parsedEnvelope.error.issues,
          ...(traceId === undefined ? {} : { traceId }),
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

      throw makeControlRequestError(appError);
    }

    if (!response.ok)
      throw makeControlRequestError(
        externalServiceError({
          code: 'control_status_envelope_mismatch',
          message: `The Control API returned HTTP ${response.status} with a success envelope.`,
          safeMessage: 'Control returned an unreadable response.',
          status: 502,
          details: { receivedStatus: response.status },
          ...(traceId === undefined ? {} : { traceId }),
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
