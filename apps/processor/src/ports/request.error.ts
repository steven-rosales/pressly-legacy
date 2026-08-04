import {
  isAppError,
  isRecord,
  makeAppError,
  type AppError,
  type ErrorKind,
  type HttpStatusCode,
} from '@pressly/errors/app-error';

export const requestFailureKinds = [
  'unauthorized',
  'forbidden',
  'invalid_request',
  'not_found',
  'conflict',
  'rate_limited',
  'unavailable',
  'invalid_response',
  'unexpected',
] as const;

export type RequestFailureKind = (typeof requestFailureKinds)[number];

export type RequestFailure = AppError &
  Readonly<{
    requestKind: RequestFailureKind;
    responseStatus?: number;
    requestId?: string;
    referenceId?: string;
  }>;

export type RequestFailureInput = Readonly<{
  requestKind: RequestFailureKind;
  code: string;
  message: string;
  responseStatus?: number;
  requestId?: string;
  traceId?: string;
  cause?: unknown;
}>;

const requestFailureDefaults: Readonly<
  Record<
    RequestFailureKind,
    Readonly<{ kind: ErrorKind; status: HttpStatusCode }>
  >
> = {
  unauthorized: { kind: 'AuthError', status: 401 },
  forbidden: { kind: 'PermissionError', status: 403 },
  invalid_request: { kind: 'ValidationError', status: 400 },
  not_found: { kind: 'NotFoundError', status: 404 },
  conflict: { kind: 'ConflictError', status: 409 },
  rate_limited: { kind: 'RateLimitError', status: 429 },
  unavailable: { kind: 'ExternalServiceError', status: 503 },
  invalid_response: { kind: 'UnexpectedError', status: 500 },
  unexpected: { kind: 'UnexpectedError', status: 500 },
};

const isRequestFailureKind = (value: unknown): value is RequestFailureKind =>
  typeof value === 'string' &&
  requestFailureKinds.includes(value as RequestFailureKind);

const throwableSemantics = (
  input: RequestFailureInput,
): Readonly<{ kind: ErrorKind; status: HttpStatusCode }> =>
  isAppError(input.cause)
    ? { kind: input.cause.kind, status: input.cause.status }
    : requestFailureDefaults[input.requestKind];

/**
 * Creates the Processor boundary's one throwable shape. The AppError fields
 * retain platform-wide failure semantics while requestKind and responseStatus
 * preserve presentation and transport context without overloading them.
 */
export const requestFailure = (input: RequestFailureInput): RequestFailure => {
  const semantics = throwableSemantics(input);
  const referenceId = input.traceId ?? input.requestId;
  const error = makeAppError({
    kind: semantics.kind,
    status: semantics.status,
    code: input.code,
    message: input.message,
    safeMessage: input.message,
    ...(input.traceId === undefined ? {} : { traceId: input.traceId }),
    ...(input.cause === undefined ? {} : { cause: input.cause }),
  });

  return Object.assign(error, {
    requestKind: input.requestKind,
    ...(input.responseStatus === undefined
      ? {}
      : { responseStatus: input.responseStatus }),
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    ...(referenceId === undefined ? {} : { referenceId }),
  });
};

export const isRequestFailure = (value: unknown): value is RequestFailure =>
  isAppError(value) &&
  isRecord(value) &&
  isRequestFailureKind(value['requestKind']) &&
  (value['responseStatus'] === undefined ||
    typeof value['responseStatus'] === 'number') &&
  (value['requestId'] === undefined ||
    typeof value['requestId'] === 'string') &&
  (value['referenceId'] === undefined ||
    typeof value['referenceId'] === 'string');
