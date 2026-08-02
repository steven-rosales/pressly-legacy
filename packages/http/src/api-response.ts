import type { AppError } from '@pressly/errors';

export type ApiSuccess<T> = Readonly<{
  ok: true;
  data: T;
  meta?: Record<string, unknown> | undefined;
}>;

export type ApiFailure = Readonly<{
  ok: false;
  error: Readonly<{
    code: string;
    message: string;
    traceId?: string | undefined;
    details?: unknown;
  }>;
}>;

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const apiSuccess = <T>(
  data: T,
  meta?: Record<string, unknown>,
): ApiSuccess<T> => ({
  ok: true,
  data,
  ...(meta === undefined ? {} : { meta }),
});

export const apiFailure = (error: AppError): ApiFailure => ({
  ok: false,
  error: {
    code: error.code,
    message: error.safeMessage,
    ...(error.traceId === undefined ? {} : { traceId: error.traceId }),
    ...(error.publicDetails === undefined
      ? {}
      : { details: error.publicDetails }),
  },
});
