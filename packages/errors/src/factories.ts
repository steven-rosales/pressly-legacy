import {
  makeAppError,
  type AppError,
  type MakeAppErrorInput,
} from './app-error.js';

export type AppErrorFactoryInput = Readonly<{
  code: string;
  message: string;
  safeMessage?: string;
  cause?: unknown;
  details?: unknown;
  publicDetails?: unknown;
  traceId?: string;
}>;

export type ValidationErrorStatus = 400 | 413 | 415 | 422;
export type ExternalServiceErrorStatus = 408 | 500 | 502 | 503 | 504;
export type DatabaseErrorStatus = 500 | 503;

const errorFields = (
  input: AppErrorFactoryInput,
  defaultSafeMessage: string,
): Omit<MakeAppErrorInput, 'kind' | 'status'> => ({
  code: input.code,
  message: input.message,
  safeMessage: input.safeMessage ?? defaultSafeMessage,
  ...(input.cause === undefined ? {} : { cause: input.cause }),
  ...(input.details === undefined ? {} : { details: input.details }),
  ...(input.publicDetails === undefined
    ? {}
    : { publicDetails: input.publicDetails }),
  ...(input.traceId === undefined ? {} : { traceId: input.traceId }),
});

export const configError = (input: AppErrorFactoryInput): AppError =>
  makeAppError({
    kind: 'ConfigError',
    status: 500,
    ...errorFields(input, 'Server configuration is invalid.'),
  });

export const validationError = (
  input: AppErrorFactoryInput & Readonly<{ status?: ValidationErrorStatus }>,
): AppError =>
  makeAppError({
    kind: 'ValidationError',
    status: input.status ?? 400,
    ...errorFields(input, 'Invalid request input.'),
  });

export const authError = (input: AppErrorFactoryInput): AppError =>
  makeAppError({
    kind: 'AuthError',
    status: 401,
    ...errorFields(input, 'Authentication is required.'),
  });

export const permissionError = (input: AppErrorFactoryInput): AppError =>
  makeAppError({
    kind: 'PermissionError',
    status: 403,
    ...errorFields(input, 'You do not have permission to do this.'),
  });

export const notFoundError = (input: AppErrorFactoryInput): AppError =>
  makeAppError({
    kind: 'NotFoundError',
    status: 404,
    ...errorFields(input, 'The requested resource was not found.'),
  });

export const conflictError = (input: AppErrorFactoryInput): AppError =>
  makeAppError({
    kind: 'ConflictError',
    status: 409,
    ...errorFields(input, 'The request conflicts with current state.'),
  });

export const rateLimitError = (input: AppErrorFactoryInput): AppError =>
  makeAppError({
    kind: 'RateLimitError',
    status: 429,
    ...errorFields(input, 'Too many requests. Please try again later.'),
  });

export const externalServiceError = (
  input: AppErrorFactoryInput &
    Readonly<{ status?: ExternalServiceErrorStatus }>,
): AppError =>
  makeAppError({
    kind: 'ExternalServiceError',
    status: input.status ?? 503,
    ...errorFields(input, 'A required service is unavailable.'),
  });

export const databaseError = (
  input: AppErrorFactoryInput & Readonly<{ status?: DatabaseErrorStatus }>,
): AppError =>
  makeAppError({
    kind: 'DatabaseError',
    status: input.status ?? 500,
    ...errorFields(input, 'The service could not complete the request.'),
  });

export const invariantViolationError = (
  input: AppErrorFactoryInput,
): AppError =>
  makeAppError({
    kind: 'InvariantViolationError',
    status: 500,
    ...errorFields(input, 'An unexpected error occurred.'),
  });

export const unexpectedError = (input: AppErrorFactoryInput): AppError =>
  makeAppError({
    kind: 'UnexpectedError',
    status: 500,
    ...errorFields(input, 'An unexpected error occurred.'),
  });
