export type ErrorKind =
  | 'ConfigError'
  | 'ValidationError'
  | 'AuthError'
  | 'PermissionError'
  | 'NotFoundError'
  | 'ConflictError'
  | 'RateLimitError'
  | 'ExternalServiceError'
  | 'DatabaseError'
  | 'InvariantViolationError'
  | 'UnexpectedError';

export type HttpStatusCode =
  | 400
  | 401
  | 403
  | 404
  | 409
  | 422
  | 429
  | 500
  | 502
  | 503;

export type ErrorCode = string;

export type AppError = Error &
  Readonly<{
    tag: 'AppError';
    kind: ErrorKind;
    code: ErrorCode;
    message: string;
    safeMessage: string;
    status: HttpStatusCode;
    details?: unknown;
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

  return Object.assign(error, {
    tag: 'AppError' as const,
    kind: input.kind,
    code: input.code,
    safeMessage: input.safeMessage ?? defaultSafeMessage(input.status),
    status: input.status,
    ...(input.details === undefined ? {} : { details: input.details }),
    ...(input.traceId === undefined ? {} : { traceId: input.traceId }),
  });
};

export const isRecord = (
  value: unknown,
): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null;

export const isAppError = (value: unknown): value is AppError =>
  value instanceof Error &&
  isRecord(value) &&
  value['tag'] === 'AppError' &&
  typeof value['kind'] === 'string' &&
  typeof value['code'] === 'string' &&
  typeof value['message'] === 'string' &&
  typeof value['safeMessage'] === 'string' &&
  typeof value['status'] === 'number';

export const normalizeUnknownError = (value: unknown): AppError => {
  if (isAppError(value)) return value;

  if (value instanceof Error) {
    return makeAppError({
      kind: 'UnexpectedError',
      code: 'unexpected_error',
      message: value.message,
      safeMessage: 'An unexpected error occurred.',
      status: 500,
      cause: value,
    });
  }

  return makeAppError({
    kind: 'UnexpectedError',
    code: 'unknown_thrown_value',
    message: 'A non-error value was thrown.',
    safeMessage: 'An unexpected error occurred.',
    status: 500,
    cause: value,
  });
};
