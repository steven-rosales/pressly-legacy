export const errorKinds = [
  'ConfigError',
  'ValidationError',
  'AuthError',
  'PermissionError',
  'NotFoundError',
  'ConflictError',
  'RateLimitError',
  'ExternalServiceError',
  'DatabaseError',
  'InvariantViolationError',
  'UnexpectedError',
] as const;

export type ErrorKind = (typeof errorKinds)[number];

export const httpStatusCodes = [
  400, 401, 403, 404, 408, 409, 413, 415, 422, 429, 500, 502, 503, 504,
] as const;

export type HttpStatusCode = (typeof httpStatusCodes)[number];

export type ErrorCode = string;

export type AppError = Error &
  Readonly<{
    tag: 'AppError';
    kind: ErrorKind;
    code: ErrorCode;
    message: string;
    safeMessage: string;
    status: HttpStatusCode;
    /** Private diagnostic context. Never serialize this field to a client. */
    details?: unknown;
    /** Deliberately wire-safe structured context for callers. */
    publicDetails?: unknown;
    cause?: unknown;
    traceId?: string;
  }>;

export type MakeAppErrorInput = Readonly<{
  kind: ErrorKind;
  code: ErrorCode;
  message: string;
  status: HttpStatusCode;
  safeMessage?: string;
  details?: unknown;
  publicDetails?: unknown;
  cause?: unknown;
  traceId?: string;
}>;

const defaultSafeMessage = (status: HttpStatusCode): string =>
  status >= 500
    ? 'An unexpected error occurred.'
    : 'The request could not be completed.';

const makeThrowable = (input: MakeAppErrorInput): Error =>
  input.cause === undefined
    ? new Error(input.message)
    : new Error(input.message, { cause: input.cause });

export const makeAppError = (input: MakeAppErrorInput): AppError => {
  const error = makeThrowable(input);

  error.name = input.kind;
  const appError = Object.assign(error, {
    tag: 'AppError' as const,
    kind: input.kind,
    code: input.code,
    safeMessage: input.safeMessage ?? defaultSafeMessage(input.status),
    status: input.status,
    ...(input.publicDetails === undefined
      ? {}
      : { publicDetails: input.publicDetails }),
    ...(input.traceId === undefined ? {} : { traceId: input.traceId }),
  });

  if (input.details !== undefined)
    Object.defineProperty(appError, 'details', {
      value: input.details,
      enumerable: false,
    });

  return appError;
};

export const isRecord = (
  value: unknown,
): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null;

export const isErrorKind = (value: unknown): value is ErrorKind =>
  typeof value === 'string' &&
  errorKinds.includes(value as (typeof errorKinds)[number]);

export const isHttpStatusCode = (value: unknown): value is HttpStatusCode =>
  typeof value === 'number' &&
  httpStatusCodes.includes(value as (typeof httpStatusCodes)[number]);

export const isAppError = (value: unknown): value is AppError =>
  value instanceof Error &&
  isRecord(value) &&
  value['tag'] === 'AppError' &&
  isErrorKind(value['kind']) &&
  typeof value['code'] === 'string' &&
  typeof value['message'] === 'string' &&
  typeof value['safeMessage'] === 'string' &&
  isHttpStatusCode(value['status']);

export const mapUnknownError = (
  value: unknown,
  map: (value: unknown) => AppError,
): AppError => (isAppError(value) ? value : map(value));

export const normalizeUnknownError = (value: unknown): AppError => {
  if (isAppError(value)) return value;

  if (value instanceof Error)
    return makeAppError({
      kind: 'UnexpectedError',
      code: 'unexpected_error',
      message: value.message,
      safeMessage: 'An unexpected error occurred.',
      status: 500,
      cause: value,
    });

  return makeAppError({
    kind: 'UnexpectedError',
    code: 'unknown_thrown_value',
    message: 'A non-error value was thrown.',
    safeMessage: 'An unexpected error occurred.',
    status: 500,
    cause: value,
  });
};
